// Test ipopremium.in noscript table parsing
import axios from 'axios';
import * as cheerio from 'cheerio';

const { data } = await axios.get('https://www.ipopremium.in/', {
  headers: {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
  },
  timeout: 15000
});

const $ = cheerio.load(data);

// Try to find noscript table via string search
const noscriptContent = data.match(/<noscript>([\s\S]*?)<\/noscript>/g);
console.log('noscript blocks found:', noscriptContent ? noscriptContent.length : 0);
if (noscriptContent) {
  const ns = noscriptContent[0].substring(0, 3000);
  console.log(ns);
}

// Also check how cheerio sees it
console.log('\n--- Cheerio noscript table rows ---');
$('noscript').each((i, el) => {
  const inner = $(el).html();
  if (inner && inner.includes('GMP')) {
    console.log('Found noscript with GMP, len:', inner.length);
    console.log(inner.substring(0, 2000));
  }
});
