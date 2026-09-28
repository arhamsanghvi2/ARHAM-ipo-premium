/**
 * Scraper — curl first (fast, ~1-3s), headless Chromium fallback when Cloudflare
 * blocks curl (slow, ~5-15s, but actually solves the JS challenge).
 *
 * Why the fallback exists: ipopremium.in runs behind Cloudflare. curl has no JS
 * engine and a non-browser TLS fingerprint, so Cloudflare tolerates it for a
 * while and then starts serving a "Just a moment" challenge to the scraping
 * IP. curl can never pass that — without a fallback, the whole site goes
 * blank until someone manually intervenes. A stealth-patched headless Chromium
 * *can* pass it, so we only pay its cost when curl actually gets blocked.
 *
 * A `lastGood*` cache (no TTL) is also kept so that if BOTH curl and the
 * browser fallback fail at the same moment, we still serve the last
 * successfully scraped data instead of an empty page.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);
const IS_VERCEL = !!process.env.VERCEL;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// In-memory HTML cache: url -> { html, fetchedAt }
const htmlCache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds — reuse HTML for 1 min

// Never-expiring "last known good" fallback, used only when a fresh fetch
// (curl AND browser) fails outright.
const lastGoodHtml = new Map(); // url -> html
let lastGoodIpoList = null;

// In-memory IPO list cache
let ipoListCache = null;
let ipoListFetchedAt = 0;

/**
 * The site's homepage embeds a short-lived Laravel *signed* URL for the
 * DataTables AJAX call, e.g.:
 *   url: "https:\/\/www.ipopremium.in\/ipo?expires=169...&signature=abcd..."
 * This signature is only valid for a limited window (tens of minutes), and
 * the endpoint now rejects POST entirely ("POST method is not supported for
 * route ipo") — it must be re-extracted from a fresh homepage load and
 * called with GET. This (not just Cloudflare) is why a hardcoded POST/CSRF
 * flow eventually goes dead: the signature it depended on expires and the
 * verb it used stopped being accepted.
 */
function extractSignedIpoUrl(html) {
  const m = html.match(/url\s*:\s*"(https:\\?\/\\?\/www\.ipopremium\.in\\?\/ipo\?expires=[^"]+)"/);
  if (!m) return null;
  return m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
}

function buildIpoQuery(signedUrl) {
  const qs = new URLSearchParams({
    draw: '1',
    start: '0',
    length: '200',
    'search[value]': '',
    all: 'true',
    eq: 'true',
    sme: 'true',
    all_ipos: 'true',
    upcoming_ipos: 'false',
    open_ipos: 'false',
    closed_ipos: 'false',
  }).toString();
  const sep = signedUrl.includes('?') ? '&' : '?';
  return `${signedUrl}${sep}${qs}`;
}

function isChallengePage(html) {
  if (!html) return true;
  if (html.length > 20000) return false;
  return (
    /just a moment/i.test(html) ||
    /enable javascript and cookies/i.test(html) ||
    /cf-browser-verification|__cf_chl|cf_chl_opt/i.test(html)
  );
}

// ─── curl helpers ──────────────────────────────────────────────────────────
async function curlGet(url, { cookieFile } = {}) {
  const args = [
    '-s', '-L',
    '--max-time', '8', // short — a Cloudflare-blocked request should fail fast so we can fall back
    '--compressed',
    '-A', USER_AGENT,
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-H', 'Cache-Control: max-age=0',
    '-H', 'Connection: keep-alive',
  ];
  if (cookieFile) args.push('-c', cookieFile, '-b', cookieFile);
  args.push(url);

  const { stdout } = await execFileAsync('curl', args, {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 10000,
  });
  return stdout;
}

// ─── Headless Chromium fallback (stealth) ─────────────────────────────────
let browserPromise = null;

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const puppeteerExtra = (await import('puppeteer-extra')).default;
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    puppeteerExtra.use(StealthPlugin());

    if (IS_VERCEL) {
      const chromium = (await import('@sparticuz/chromium')).default;
      return puppeteerExtra.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
    }

    const puppeteerBase = (await import('puppeteer')).default;
    return puppeteerExtra.launch({
      executablePath: puppeteerBase.executablePath(),
      headless: true,
    });
  })();

  // If launch fails, don't cache the rejected promise forever — allow retry next time.
  browserPromise.catch(() => { browserPromise = null; });
  return browserPromise;
}

async function waitOutChallenge(page) {
  for (let i = 0; i < 10; i++) {
    const title = await page.title().catch(() => '');
    if (!/just a moment/i.test(title)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

async function fetchHtmlViaBrowser(url) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    await waitOutChallenge(page);
    return await page.content();
  } finally {
    await page.close().catch(() => {});
  }
}

/** Loads the homepage in a real browser (passing any Cloudflare challenge),
 *  extracts the fresh signed AJAX URL, then issues the GET from *inside*
 *  the page so it inherits the browser's cookies/TLS/JS fingerprint. */
async function fetchIpoJsonViaBrowser() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.goto('https://www.ipopremium.in/', { waitUntil: 'networkidle2', timeout: 25000 });
    await waitOutChallenge(page);

    const html = await page.content();
    const signedUrl = extractSignedIpoUrl(html);
    if (!signedUrl) throw new Error('signed IPO ajax URL not found (browser)');
    const fullUrl = buildIpoQuery(signedUrl);

    return await page.evaluate(async (url) => {
      const res = await fetch(url, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });
      return res.json();
    }, fullUrl);
  } finally {
    await page.close().catch(() => {});
  }
}

// ─── Public: single-page HTML scrape ──────────────────────────────────────
export async function scrapeHtml(url) {
  const cached = htmlCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.html;
  }

  try {
    let html;
    try {
      html = await curlGet(url);
    } catch {
      html = null;
    }

    if (isChallengePage(html)) {
      html = await fetchHtmlViaBrowser(url);
      if (isChallengePage(html)) {
        throw new Error('Cloudflare challenge could not be solved');
      }
    }

    htmlCache.set(url, { html, fetchedAt: Date.now() });
    lastGoodHtml.set(url, html);
    return html;
  } catch (err) {
    // Prefer the freshest thing we've got over a hard failure.
    if (cached) {
      console.warn('scrapeHtml: returning stale cache for', url, '— error:', err.message);
      return cached.html;
    }
    const lastGood = lastGoodHtml.get(url);
    if (lastGood) {
      console.warn('scrapeHtml: returning last-known-good for', url, '— error:', err.message);
      return lastGood;
    }
    throw err;
  }
}

function mapIpoItem(item) {
  const $name = cheerio.load(item.name || '');
  const link = $name('a').attr('href') || '';
  const name = $name('a').text().trim() || $name.text().trim();
  const relativeLink = link.replace('https://www.ipopremium.in', '');

  let gmp = 'N/A';
  let gmpPct = '';
  if (item.premium) {
    const $prem = cheerio.load(item.premium);
    gmpPct = $prem('small').text().trim();
    $prem('small').remove();
    gmp = $prem.text().trim() || 'N/A';
  }

  let dateRange = '';
  if (item.open) {
    const $open = cheerio.load(item.open);
    $open('small').remove();
    const rawRange = $open.text().trim();
    if (rawRange) {
      dateRange = rawRange.replace(/\s*–\s*|\s*-\s*/g, ' to ');
    }
  }
  if (!dateRange && item.close) {
    dateRange = item.close;
  }

  return {
    id: item.id,
    name,
    link: relativeLink,
    priceBand: item.price || 'N/A',
    lotSize: item.lot_size || 'N/A',
    issueSize: item.issue_size || 'N/A',
    gmp,
    gmpPct,
    status: item.current_status || 'closed',
    dateRange,
    openDate: item.open ? cheerio.load(item.open).text().trim() : '',
    closeDate: item.close || '',
    allotmentDate: item.allotment_date || '',
    listingDate: item.listing_date || '',
    type: item.type === 'SME' ? 'SME' : 'Mainboard',
  };
}

/**
 * Fetches full dynamic IPO directory from the DataTables AJAX endpoint.
 * The endpoint requires GET plus a signed `expires`/`signature` pair that's
 * freshly generated into the homepage's inline script on every load — so we
 * always re-fetch the homepage first to mint a valid one.
 */
export async function fetchIpoList() {
  if (ipoListCache && Date.now() - ipoListFetchedAt < CACHE_TTL_MS) {
    return ipoListCache;
  }

  const cookieFile = path.join(os.tmpdir(), `ipo_cookies_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.txt`);

  try {
    let json = null;

    try {
      // 1. Fetch homepage to mint a fresh signed AJAX URL
      const html = await curlGet('https://www.ipopremium.in/', { cookieFile });

      if (isChallengePage(html)) {
        throw new Error('Cloudflare challenge on homepage GET');
      }

      const signedUrl = extractSignedIpoUrl(html);
      if (!signedUrl) throw new Error('signed IPO ajax URL not found in homepage');

      // 2. Fetch IPO table data via signed GET
      const { stdout: responseText } = await execFileAsync('curl', [
        '-s', '-L', '--max-time', '8', '--compressed',
        '-c', cookieFile, '-b', cookieFile,
        '-A', USER_AGENT,
        '-H', 'X-Requested-With: XMLHttpRequest',
        '-H', 'Referer: https://www.ipopremium.in/',
        buildIpoQuery(signedUrl),
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 10000 });

      json = JSON.parse(responseText);
    } catch (e) {
      console.warn('fetchIpoList: curl path failed (', e.message, ') — falling back to headless browser');
      json = await fetchIpoJsonViaBrowser();
    }

    if (!json || !json.data || !Array.isArray(json.data)) {
      throw new Error('IPO list response had no data');
    }

    const ipos = json.data.map(mapIpoItem).filter((item) => item.name && item.link);

    ipoListCache = ipos;
    ipoListFetchedAt = Date.now();
    lastGoodIpoList = ipos;
    return ipos;

  } catch (e) {
    console.error('fetchIpoList error:', e.message);
    return ipoListCache || lastGoodIpoList || [];
  } finally {
    if (fs.existsSync(cookieFile)) {
      try { fs.unlinkSync(cookieFile); } catch {}
    }
  }
}

// Warm up cache for frequently accessed pages
export async function warmCache(links) {
  const promises = links.map((link) =>
    scrapeHtml(link.startsWith('http') ? link : `https://www.ipopremium.in${link}`)
      .catch((e) => console.warn('Warm cache failed for', link, e.message))
  );
  await Promise.allSettled(promises);
}
