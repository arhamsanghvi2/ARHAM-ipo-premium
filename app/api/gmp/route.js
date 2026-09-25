/**
 * Fast GMP-only endpoint.
 * - In-memory cache (works on Vercel warm instances)
 * - Uses curl-based browser.js — fast (~200ms vs 30-60s Puppeteer)
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

    // Site uses .ip-stat / .ip-stat__label / .ip-stat__value (NOT .ipo-tile)
    const tiles = {};
    $('.ip-stat').each((i, stat) => {
      const label = $(stat).find('.ip-stat__label').text().trim().replace(/\s+/g, ' ');
      const val   = $(stat).find('.ip-stat__value').text().trim().replace(/\s+/g, ' ');
      const sub   = $(stat).find('.ip-stat__sub').text().trim().replace(/\s+/g, ' ');
      if (label) tiles[label] = { val, sub };
    });

    // Dates from ip-timeline (NOT ipo-timeline)
    let openDate = '', closeDate = '';
    $('.ip-timeline__step').each((i, el) => {
      const label   = $(el).find('.ip-timeline__label').text().trim();
      const dateVal = $(el).find('.ip-timeline__date').text().trim();
      if (/^open$/i.test(label))  openDate  = dateVal;
      if (/^close$/i.test(label)) closeDate = dateVal;
    });

    // Dynamic GMP and Listing Gain extraction
    let gmp = 'N/A';
    let gmpPct = '';
    
    for (const [key, t] of Object.entries(tiles)) {
      const k = key.toLowerCase();
      if (k.includes('gmp') || k.includes('premium')) {
        gmp = t.val;
        gmpPct = t.sub || '';
        break;
      }
    }
    if (gmp === 'N/A') {
      for (const [key, t] of Object.entries(tiles)) {
        const k = key.toLowerCase();
        if (k.includes('listing gain')) {
          gmp = t.val;
          gmpPct = t.sub || '';
          break;
        }
      }
    }

    let dateRange = '';
    if (openDate && closeDate) {
      dateRange = `${openDate} to ${closeDate}`;
    } else if (openDate) {
      dateRange = openDate;
    } else if (closeDate) {
      dateRange = closeDate;
    }

    const data = {
      gmp,
      gmpPct,
      priceBand: tiles['Price Band']?.val || 'N/A',
      issueSize: (tiles['Price Band']?.sub || '').replace(/\s*issue\s*$/i, '').trim(),
      lotSize:   tiles['Lot Size']?.val   || 'N/A',
      subscribed: tiles['Subscribed']?.val || 'N/A',
      openDate,
      closeDate,
      dateRange,
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
