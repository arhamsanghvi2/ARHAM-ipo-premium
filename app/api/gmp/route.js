/**
 * Fast GMP-only endpoint.
 * - In-memory cache (works on Vercel warm instances)
 * - Uses shared browser.js (sparticuz/chromium on Vercel, puppeteer locally)
 * - Background refresh on stale cache (fire-and-forget)
 */
import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { scrapeHtml } from '@/lib/browser';

// In-memory GMP cache: link -> { data, fetchedAt }
const gmpCache = new Map();
const CACHE_TTL_MS = 30_000; // 30 seconds

// Prevent duplicate simultaneous scrapes
const inFlight = new Set();

async function fetchGmp(ipoLink) {
  if (inFlight.has(ipoLink)) return;
  inFlight.add(ipoLink);
  try {
    const url = ipoLink.startsWith('http') ? ipoLink : `https://www.ipopremium.in${ipoLink}`;
    const html = await scrapeHtml(url);
    const $ = cheerio.load(html);

    const tiles = {};
    $('.ipo-tile').each((i, tile) => {
      const label = $(tile).find('.ipo-tile__label').clone()
        .children().remove().end().text().trim().replace(/\s+/g, ' ')
        || $(tile).find('.ipo-tile__label').text().trim().replace(/\s+/g, ' ');
      const val = $(tile).find('.ipo-tile__value').text().trim().replace(/\s+/g, ' ');
      const sub = $(tile).find('.ipo-tile__sub').text().trim().replace(/\s+/g, ' ');
      if (label) tiles[label] = { val, sub };
    });

    // Dates from timeline
    let openDate = '', closeDate = '';
    $('.ipo-timeline__step').each((i, el) => {
      const label   = $(el).find('.ipo-timeline__label').text().trim();
      const dateVal = $(el).find('.ipo-timeline__date').text().trim();
      if (/^open$/i.test(label))  openDate  = dateVal;
      if (/^close$/i.test(label)) closeDate = dateVal;
    });

    const data = {
      gmp:       tiles['GMP Rumors']?.val || tiles['GMP']?.val || 'N/A',
      gmpPct:    tiles['GMP Rumors']?.sub || '',
      priceBand: tiles['Price Band']?.val || 'N/A',
      lotSize:   tiles['Lot Size']?.val   || 'N/A',
      openDate,
      closeDate,
      allTiles:  tiles,
    };

    gmpCache.set(ipoLink, { data, fetchedAt: Date.now() });
  } catch (e) {
    console.error('GMP fetch failed for', ipoLink, e.message);
  } finally {
    inFlight.delete(ipoLink);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ipoLink = searchParams.get('link');

  if (!ipoLink) {
    return NextResponse.json({ success: false, error: 'No link provided' }, { status: 400 });
  }

  const cached = gmpCache.get(ipoLink);
  const cacheAge = cached ? Date.now() - cached.fetchedAt : Infinity;

  // Stale or missing — trigger background refresh
  if (cacheAge > CACHE_TTL_MS) {
    fetchGmp(ipoLink).catch(console.error);
  }

  if (cached) {
    return NextResponse.json({
      success: true,
      fresh: cacheAge < CACHE_TTL_MS,
      cacheAge: Math.round(cacheAge / 1000),
      data: cached.data,
    });
  }

  // No cache yet — await first fetch
  try {
    await fetchGmp(ipoLink);
    const entry = gmpCache.get(ipoLink);
    if (entry) {
      return NextResponse.json({ success: true, fresh: true, cacheAge: 0, data: entry.data });
    }
    return NextResponse.json({ success: true, loading: true, data: null });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
