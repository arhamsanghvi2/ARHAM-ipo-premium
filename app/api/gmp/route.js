/**
 * Fast GMP-only endpoint — returns cached GMP instantly, 
 * triggers background re-scrape if cache is older than 8 seconds.
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
import { NextResponse } from 'next/server';
const { getGmpCache, setGmpCache } = require('@/lib/db');

puppeteer.use(StealthPlugin());

// In-memory lock to prevent duplicate simultaneous scrapes
const activeScrapes = new Set();

async function scrapeGmp(ipoLink) {
  if (activeScrapes.has(ipoLink)) return; // Already scraping
  activeScrapes.add(ipoLink);

  let browser;
  try {
    const url = ipoLink.startsWith('http') ? ipoLink : `https://www.ipopremium.in${ipoLink}`;
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000));

    const html = await page.content();
    const $ = cheerio.load(html);

    const tiles = {};
    $('.ipo-tile').each((i, tile) => {
      const label = $(tile).find('.ipo-tile__label').clone()
        .children().remove().end().text().trim().replace(/\s+/g, ' ').trim()
        || $(tile).find('.ipo-tile__label').text().trim().replace(/\s+/g, ' ');
      const val = $(tile).find('.ipo-tile__value').text().trim().replace(/\s+/g, ' ');
      const sub = $(tile).find('.ipo-tile__sub').text().trim().replace(/\s+/g, ' ');
      if (label) tiles[label] = { val, sub };
    });

    const data = {
      gmp: tiles['GMP Rumors']?.val || tiles['GMP']?.val || 'N/A',
      gmpPct: tiles['GMP Rumors']?.sub || '',
      priceBand: tiles['Price Band']?.val || 'N/A',
      lotSize: tiles['Lot Size']?.val || 'N/A',
      subscribed: tiles['Subscribed']?.val || null,
      allTiles: tiles,
    };

    setGmpCache(ipoLink, data);
  } catch (e) {
    console.error('GMP scrape failed for', ipoLink, e.message);
  } finally {
    if (browser) await browser.close();
    activeScrapes.delete(ipoLink);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const ipoLink = searchParams.get('link'); // Full URL or relative path

  if (!ipoLink) {
    return NextResponse.json({ success: false, error: 'No link provided' }, { status: 400 });
  }

  try {
    const cached = getGmpCache(ipoLink);
    
    // Calculate cache age in seconds
    const cacheAgeSeconds = cached
      ? (Date.now() - new Date(cached.last_scraped + 'Z').getTime()) / 1000
      : Infinity;

    // If cache is older than 8 seconds, trigger a background re-scrape (don't await)
    if (cacheAgeSeconds > 8) {
      scrapeGmp(ipoLink).catch(console.error); // Fire & forget
    }

    if (cached) {
      return NextResponse.json({
        success: true,
        fresh: cacheAgeSeconds < 8,
        cacheAge: Math.round(cacheAgeSeconds),
        data: {
          gmp: cached.gmp,
          gmpPct: cached.gmp_pct,
          priceBand: cached.price_band,
          lotSize: cached.lot_size,
          subscribed: cached.subscribed,
          allTiles: JSON.parse(cached.all_tiles || '{}'),
        }
      });
    }

    // No cache at all — trigger scrape and return loading state
    scrapeGmp(ipoLink).catch(console.error);
    return NextResponse.json({ success: true, loading: true, data: null });

  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
