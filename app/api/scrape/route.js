const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
import { NextResponse } from 'next/server';

puppeteer.use(StealthPlugin());

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path') || '/';
  const url = path.startsWith('http') ? path : `https://www.ipopremium.in${path}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for JS-rendered content
    await new Promise(resolve => setTimeout(resolve, 5000));

    const html = await page.content();
    const $ = cheerio.load(html);

    let data = {
      title: $('title').text().replace(' | IPO Premium', '').trim(),
      url: url
    };

    if (path === '/') {
      // ---- HOMEPAGE: Extract list of IPOs ----
      const ipos = [];
      $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('/ipo/')) {
          const name = $(el).text().trim();
          if (name.length > 3) { // skip tiny/empty link text
            ipos.push({ name, link: href });
          }
        }
      });
      data.ipos = [...new Map(ipos.map(item => [item.link, item])).values()];

    } else {
      // ---- DETAIL PAGE: Extract GMP, Price Band, Lot Size, all tile data, and tables ----

      // --- TILE DATA (GMP, Price Band, Lot Size, etc.) ---
      // Structure: <div class="ipo-tile">
      //   <div class="ipo-tile__label">GMP Rumors</div>
      //   <div class="ipo-tile__val">₹24</div>
      //   <div class="ipo-tile__sub">+17.1%</div>
      // </div>
      const tiles = {};
      $('.ipo-tile').each((i, tile) => {
        // The label may contain child <span> elements (like asterisk), so get just own text
        const label = $(tile).find('.ipo-tile__label').clone()
          .children().remove().end().text().trim()
          .replace(/\s+/g, ' ').trim()
          || $(tile).find('.ipo-tile__label').text().trim().replace(/\s+/g, ' ');
        const val = $(tile).find('.ipo-tile__value').text().trim().replace(/\s+/g, ' ');
        const sub = $(tile).find('.ipo-tile__sub').text().trim().replace(/\s+/g, ' ');
        if (label) {
          tiles[label] = { val, sub };
        }
      });

      // Extract known fields from tiles
      data.gmp = tiles['GMP Rumors']?.val || tiles['GMP']?.val || 'N/A';
      data.gmpPct = tiles['GMP Rumors']?.sub || '';
      data.priceBand = tiles['Price Band']?.val || 'N/A';
      data.issueSize = tiles['Price Band']?.sub || '';
      data.lotSize = tiles['Lot Size']?.val || 'N/A';
      data.lotSizeMin = tiles['Lot Size']?.sub || '';
      data.allTiles = tiles;

      // --- SUBSCRIPTION TABLES ---
      const tables = [];
      $('table').each((i, table) => {
        const rows = [];
        const caption = $(table).closest('.card').find('.card-title, .card-header').first().text().trim();
        $(table).find('tr').each((j, tr) => {
          const row = [];
          $(tr).find('th, td').each((k, td) => {
            row.push($(td).text().trim());
          });
          if (row.length > 0) rows.push(row);
        });
        if (rows.length > 0) tables.push({ caption, rows });
      });
      data.tables = tables;

      // --- ADDITIONAL INFO: Open/Close dates, Issue Size, Listing Date etc. ---
      // They appear in table rows or definition lists like "td:contains('Open Date')"
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

      // --- EXTRACT KNOWN DATE FIELDS ---
      // Common key names on ipopremium.in
      const dateKeyMap = {
        openDate:    ['Open Date', 'IPO Open Date', 'Opening Date', 'Subscription Open Date'],
        closeDate:   ['Close Date', 'IPO Close Date', 'Closing Date', 'Subscription Close Date'],
        listingDate: ['Listing Date', 'Expected Listing Date', 'Allotment Date'],
      };
      for (const [field, keys] of Object.entries(dateKeyMap)) {
        for (const k of keys) {
          if (infoMap[k]) { data[field] = infoMap[k]; break; }
        }
      }

      // Also try scraping date tiles or dedicated date elements
      if (!data.openDate || !data.closeDate) {
        $('td, th, li, span, div').each((i, el) => {
          const text = $(el).text().trim();
          if (!data.openDate && /open\s*date/i.test(text)) {
            const next = $(el).next().text().trim() || $(el).parent().find('td').eq(1).text().trim();
            if (next && next.length < 30) data.openDate = next;
          }
          if (!data.closeDate && /close\s*date/i.test(text)) {
            const next = $(el).next().text().trim() || $(el).parent().find('td').eq(1).text().trim();
            if (next && next.length < 30) data.closeDate = next;
          }
        });
      }
    }

    await browser.close();
    return NextResponse.json({ success: true, data });

  } catch (error) {
    if (browser) await browser.close();
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
