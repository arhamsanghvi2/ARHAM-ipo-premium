/**
 * Fast scraper — uses curl (child_process) to bypass Cloudflare.
 *
 * curl is available on:
 *  - Windows 10+ (built-in)
 *  - macOS (built-in)
 *  - Linux/Ubuntu/Vercel (built-in)
 *  - Docker containers (install if missing)
 *
 * This is MUCH faster than Puppeteer (~1-3s vs 30-90s).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

// In-memory HTML cache: url -> { html, fetchedAt }
const htmlCache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds — reuse HTML for 1 min

// In-memory IPO list cache
let ipoListCache = null;
let ipoListFetchedAt = 0;

export async function scrapeHtml(url) {
  // Check cache first
  const cached = htmlCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.html;
  }

  const args = [
    '-s',                // silent
    '-L',                // follow redirects
    '--max-time', '20',  // 20 second timeout
    '--compressed',      // accept gzip
    '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    '-H', 'Accept-Language: en-US,en;q=0.9',
    '-H', 'Cache-Control: max-age=0',
    '-H', 'Connection: keep-alive',
    url,
  ];

  try {
    const { stdout } = await execFileAsync('curl', args, {
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      timeout: 25000,
    });

    const html = stdout;

    // Verify we didn't get a Cloudflare challenge page
    if (html.includes('Just a moment') && html.length < 20000) {
      throw new Error('Cloudflare challenge received — retry needed');
    }

    // Cache the result
    htmlCache.set(url, { html, fetchedAt: Date.now() });
    return html;
  } catch (err) {
    // On error, return stale cache if available
    if (cached) {
      console.warn('scrapeHtml: returning stale cache for', url, '— error:', err.message);
      return cached.html;
    }
    throw err;
  }
}

/**
 * Fetches full dynamic IPO directory from DataTables POST endpoint
 */
export async function fetchIpoList() {
  if (ipoListCache && Date.now() - ipoListFetchedAt < CACHE_TTL_MS) {
    return ipoListCache;
  }

  const cookieFile = path.join(os.tmpdir(), `ipo_cookies_${Date.now()}_${Math.random().toString(36).substring(2,7)}.txt`);

  try {
    // 1. Fetch homepage to get session cookies and CSRF token
    const argsGet = [
      '-s', '-L', '--max-time', '15', '--compressed',
      '-c', cookieFile,
      '-b', cookieFile,
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'https://www.ipopremium.in/'
    ];
    const { stdout: html } = await execFileAsync('curl', argsGet);
    const $ = cheerio.load(html);
    
    const token = $('meta[name="csrf-token"]').attr('content') || 
                  html.match(/_token\s*=\s*'([^']+)'/)?.[1] || 
                  html.match(/name="_token"\s+value="([^"]+)"/)?.[1];

    if (!token) throw new Error('CSRF token not found');

    // 2. Fetch IPO table data via POST
    const postData = new URLSearchParams({
      draw: '1',
      start: '0',
      length: '200', // Fetch top 200 IPOs
      'search[value]': '',
      _token: token,
      all: 'true',
      eq: 'true',
      sme: 'true',
      all_ipos: 'true',
      upcoming_ipos: 'false',
      open_ipos: 'false',
      closed_ipos: 'false'
    }).toString();

    const argsPost = [
      '-s', '-L', '--max-time', '15', '--compressed',
      '-c', cookieFile,
      '-b', cookieFile,
      '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '-H', 'X-Requested-With: XMLHttpRequest',
      '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
      '-H', 'Referer: https://www.ipopremium.in/',
      '-H', `X-CSRF-TOKEN: ${token}`,
      '-d', postData,
      'https://www.ipopremium.in/ipo'
    ];

    const { stdout: responseText } = await execFileAsync('curl', argsPost);
    const json = JSON.parse(responseText);

    if (!json.data || !Array.isArray(json.data)) return ipoListCache || [];

    const ipos = json.data.map(item => {
      const $name = cheerio.load(item.name || '');
      const link = $name('a').attr('href') || '';
      const name = $name('a').text().trim() || $name.text().trim();
      const relativeLink = link.replace('https://www.ipopremium.in', '');

      // Parse GMP value and percentage
      let gmp = 'N/A';
      let gmpPct = '';
      if (item.premium) {
        const $prem = cheerio.load(item.premium);
        gmpPct = $prem('small').text().trim();
        $prem('small').remove();
        gmp = $prem.text().trim() || 'N/A';
      }

      // Parse date range in one line: "Sep 28 to Sep 30"
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
        name: name,
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
    }).filter(item => item.name && item.link);

    ipoListCache = ipos;
    ipoListFetchedAt = Date.now();
    return ipos;

  } catch (e) {
    console.error('fetchIpoList error:', e.message);
    return ipoListCache || [];
  } finally {
    if (fs.existsSync(cookieFile)) {
      try { fs.unlinkSync(cookieFile); } catch {}
    }
  }
}

// Warm up cache for frequently accessed pages
export async function warmCache(links) {
  const promises = links.map(link =>
    scrapeHtml(link.startsWith('http') ? link : `https://www.ipopremium.in${link}`)
      .catch(e => console.warn('Warm cache failed for', link, e.message))
  );
  await Promise.allSettled(promises);
}
