import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { scrapeHtml } from '@/lib/browser';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '/';
  const url = path.startsWith('http') ? path : `https://www.ipopremium.in${path}`;

  try {
    const html = await scrapeHtml(url);
    const $ = cheerio.load(html);

    let data = {
      title: $('title').text().replace(' | IPO Premium', '').trim(),
      url,
    };

    if (path === '/') {
      // ---- HOMEPAGE: Extract list of IPOs ----
      const ipos = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/ipo/')) {
          const name = $(el).text().trim();
          if (name.length > 3) ipos.push({ name, link: href });
        }
      });
      data.ipos = [...new Map(ipos.map(item => [item.link, item])).values()];

    } else {
      // ---- DETAIL PAGE ----

      // --- TILE DATA ---
      const tiles = {};
      $('.ipo-tile').each((i, tile) => {
        const label = $(tile).find('.ipo-tile__label').clone()
          .children().remove().end().text().trim().replace(/\s+/g, ' ')
          || $(tile).find('.ipo-tile__label').text().trim().replace(/\s+/g, ' ');
        const val = $(tile).find('.ipo-tile__value').text().trim().replace(/\s+/g, ' ');
        const sub = $(tile).find('.ipo-tile__sub').text().trim().replace(/\s+/g, ' ');
        if (label) tiles[label] = { val, sub };
      });

      data.gmp        = tiles['GMP Rumors']?.val || tiles['GMP']?.val || 'N/A';
      data.gmpPct     = tiles['GMP Rumors']?.sub || '';
      data.priceBand  = tiles['Price Band']?.val || 'N/A';
      data.issueSize  = tiles['Price Band']?.sub || '';
      data.lotSize    = tiles['Lot Size']?.val   || 'N/A';
      data.lotSizeMin = tiles['Lot Size']?.sub   || '';
      data.allTiles   = tiles;

      // --- SUBSCRIPTION TABLES ---
      const tables = [];
      $('table').each((i, table) => {
        const rows = [];
        const caption = $(table).closest('.card').find('.card-title, .card-header').first().text().trim();
        $(table).find('tr').each((j, tr) => {
          const row = [];
          $(tr).find('th, td').each((k, td) => row.push($(td).text().trim()));
          if (row.length > 0) rows.push(row);
        });
        if (rows.length > 0) tables.push({ caption, rows });
      });
      data.tables = tables;

      // --- DATES from ipo-timeline ---
      $('.ipo-timeline__step').each((i, el) => {
        const label   = $(el).find('.ipo-timeline__label').text().trim();
        const dateVal = $(el).find('.ipo-timeline__date').text().trim();
        if (!dateVal) return;
        if      (/^open$/i.test(label))      data.openDate      = dateVal;
        else if (/^close$/i.test(label))     data.closeDate     = dateVal;
        else if (/^allotment$/i.test(label)) data.allotmentDate = dateVal;
        else if (/^listing$/i.test(label))   data.listingDate   = dateVal;
      });

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

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error('Scrape error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
