const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');

puppeteer.use(StealthPlugin());

async function run() {
  const url = 'https://www.ipopremium.in/view/ipo/1326/veegaland-developers-ltd';
  console.log(`Fetching ${url}...`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  
  const html = await page.content();
  const $ = cheerio.load(html);

  const tiles = {};
  $('.ipo-tile').each((i, tile) => {
    const label = $(tile).find('.ipo-tile__label').clone()
      .children().remove().end().text().trim()
      .replace(/\s+/g, ' ').trim()
      || $(tile).find('.ipo-tile__label').text().trim().replace(/\s+/g, ' ');
    const val = $(tile).find('.ipo-tile__value').text().trim().replace(/\s+/g, ' ');
    const sub = $(tile).find('.ipo-tile__sub').text().trim().replace(/\s+/g, ' ');
    if (label) tiles[label] = { val, sub };
  });

  console.log('All tiles:', JSON.stringify(tiles, null, 2));

  const gmp = tiles['GMP Rumors']?.val || tiles['GMP']?.val || 'N/A';
  const priceBand = tiles['Price Band']?.val || 'N/A';
  const lotSize = tiles['Lot Size']?.val || 'N/A';

  console.log('\n✅ GMP:', gmp);
  console.log('✅ Price Band:', priceBand);
  console.log('✅ Lot Size:', lotSize);
  
  await browser.close();
}

run().catch(console.error);
