import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { scrapeHtml, fetchIpoList } from '@/lib/browser';

// In-memory cache for full page data
const pageCache = new Map();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '/';
  const url = path.startsWith('http') ? path : `https://www.ipopremium.in${path}`;

  // Return cached result if fresh
  const cached = pageCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, cached: true, data: cached.data });
  }

  try {
    let data = { url };

    if (path === '/') {
      // ---- HOMEPAGE: Fetch full dynamic list of IPOs ----
      const ipos = await fetchIpoList();
      data.title = 'IPO Directory';
      data.ipos = ipos;

    } else {
      // ---- DETAIL PAGE ----
      const html = await scrapeHtml(url);
      const $ = cheerio.load(html);

      data.title = $('title').text().replace(' | IPO Premium', '').trim();

      const tiles = {};
      $('.ip-stat').each((i, stat) => {
        const label = $(stat).find('.ip-stat__label').text().trim().replace(/\s+/g, ' ');
        const val   = $(stat).find('.ip-stat__value').text().trim().replace(/\s+/g, ' ');
        const sub   = $(stat).find('.ip-stat__sub').text().trim().replace(/\s+/g, ' ');
        if (label) tiles[label] = { val, sub };
      });

      // Dynamic GMP / Listing Gain extraction
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

      data.gmp        = gmp;
      data.gmpPct     = gmpPct;
      data.priceBand  = tiles['Price Band']?.val || 'N/A';
      data.issueSize  = tiles['Price Band']?.sub || '';
      data.lotSize    = tiles['Lot Size']?.val   || 'N/A';
      data.lotSizeMin = tiles['Lot Size']?.sub  || '';
      data.subscribed = tiles['Subscribed']?.val || 'N/A';
      data.allTiles   = tiles;

      // --- DATES from ip-timeline (not ipo-timeline) ---
      $('.ip-timeline__step').each((i, el) => {
        const label   = $(el).find('.ip-timeline__label').text().trim();
        const dateVal = $(el).find('.ip-timeline__date').text().trim();
        if (!dateVal) return;
        if      (/^open$/i.test(label))      data.openDate      = dateVal;
        else if (/^close$/i.test(label))     data.closeDate     = dateVal;
        else if (/^allotment$/i.test(label)) data.allotmentDate = dateVal;
        else if (/^listing$/i.test(label))   data.listingDate   = dateVal;
      });

      if (data.openDate && data.closeDate) {
        data.dateRange = `${data.openDate} to ${data.closeDate}`;
      } else if (data.openDate) {
        data.dateRange = data.openDate;
      } else if (data.closeDate) {
        data.dateRange = data.closeDate;
      }

      // --- SUBSCRIPTION TABLES ---
      const tables = [];
      $('table').each((i, table) => {
        const rows = [];
        const caption = $(table).closest('.card, .ip-card').find('.card-title, .ip-card__title, .card-header').first().text().trim();
        $(table).find('tr').each((j, tr) => {
          const row = [];
          $(tr).find('th, td').each((k, td) => row.push($(td).text().trim()));
          if (row.length > 0) rows.push(row);
        });
        if (rows.length > 0) tables.push({ caption, rows });
      });
      data.tables = tables;

      // --- Fallback: table row dates ---
      const infoMap = {};
      $('tr').each((i, tr) => {
        const cells = $(tr).find('td');
        if (cells.length >= 2) {
          const key = $(cells[0]).text().trim();
          const val = $(cells[1]).text().trim();
          if (key && val) infoMap[key] = val;
        }
      });
      data.additionalInfo = infoMap;
      if (!data.openDate)    data.openDate    = infoMap['Open Date']    || infoMap['IPO Open Date']    || '';
      if (!data.closeDate)   data.closeDate   = infoMap['Close Date']   || infoMap['IPO Close Date']   || '';
      if (!data.listingDate) data.listingDate = infoMap['Listing Date'] || infoMap['Expected Listing Date'] || '';
    }

    pageCache.set(url, { data, fetchedAt: Date.now() });
    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Scrape error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
