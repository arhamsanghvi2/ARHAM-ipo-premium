const axios = require('axios');
const cheerio = require('cheerio');

const websites = [
    { name: 'IPO Trend', url: 'https://ipo-trend.com/ipo-gmp', parser: parseIpoTrend },
    { name: 'IPO Corner', url: 'https://ipocornerr.com/', parser: parseIpoCorner },
    { name: 'Investor Gain', url: 'https://www.investorgain.com/category/ipo-gmp/', parser: parseInvestorGain },
    { name: 'IPO Ji', url: 'https://www.ipoji.com/', parser: parseIpoJi },
    { name: 'IPO Watch', url: 'https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', parser: parseIpoWatch }
];

function fuzzyMatch(text, search) {
    if (!text || !search) return false;
    return text.toLowerCase().includes(search.toLowerCase());
}

async function fetchHTML(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        return data;
    } catch (error) {
        console.error(`Error fetching ${url}:`, error.message);
        return null;
    }
}

function parseIpoTrend($, searchIpo) {
    let result = "N/A";
    $('table tr, tr').each((i, el) => {
        const tds = $(el).find('td');
        if (tds.length < 2) return;
        const rowText = $(el).text();
        if (fuzzyMatch(rowText, searchIpo)) {
            let gmpCell = "";
            let gainCell = "";

            if (tds.length >= 3) {
                const col2Text = $(tds.eq(2)).text().trim();
                if (col2Text && !/₹?\d+\s*-\s*₹?\d+/.test(col2Text)) {
                    gmpCell = col2Text;
                    if (tds.length >= 4) gainCell = $(tds.eq(3)).text().trim();
                }
            }

            if (!gmpCell) {
                tds.each((j, td) => {
                    if (j === 0) return;
                    const text = $(td).text().trim();
                    if (/₹?\d+\s*-\s*₹?\d+/.test(text)) return;
                    if (text.includes('₹') || /^\+?-?\d+/.test(text)) {
                        gmpCell = text;
                        return false;
                    }
                });
            }

            if (gmpCell) {
                const cleanGmp = gmpCell.split('\n')[0].trim();
                if (gainCell && gainCell.includes('%')) {
                    result = `${cleanGmp} (${gainCell.trim()})`;
                } else {
                    result = cleanGmp;
                }
                return false;
            }
        }
    });
    return result;
}

function parseIpoCorner($, searchIpo) {
    let result = "N/A";
    $('tr').each((i, el) => {
        const rowText = $(el).text();
        if (fuzzyMatch(rowText, searchIpo)) {
            $(el).find('td').each((j, td) => {
                const text = $(td).text().trim();
                // Usually GMP contains digits and might have % or just digits
                if (/^\d+$/.test(text) || text.includes('₹') || text.includes('%')) {
                    if (j > 0 && j < 5) result = text;
                }
            });
        }
    });
    return result;
}

function parseInvestorGain($, searchIpo) {
    let result = "N/A";
    $('tr').each((i, el) => {
        const rowText = $(el).text();
        if (fuzzyMatch(rowText, searchIpo)) {
            $(el).find('td').each((j, td) => {
                const text = $(td).text().trim();
                if (text.includes('₹') || text.includes('%') || /^\d+$/.test(text)) {
                    if (j > 0 && j < 6) result = text;
                }
            });
        }
    });
    return result;
}

function parseIpoJi($, searchIpo) {
    let result = "N/A";
    $('tr').each((i, el) => {
        const rowText = $(el).text();
        if (fuzzyMatch(rowText, searchIpo)) {
            $(el).find('td').each((j, td) => {
                const text = $(td).text().trim();
                if (text.includes('₹') || text.includes('%') || /^\d+$/.test(text)) {
                    result = text;
                }
            });
        }
    });
    return result;
}

function parseIpoWatch($, searchIpo) {
    let result = "N/A";
    $('tr').each((i, el) => {
        const rowText = $(el).text();
        if (fuzzyMatch(rowText, searchIpo)) {
            $(el).find('td').each((j, td) => {
                const text = $(td).text().trim();
                if (text.includes('₹')) {
                    result = text;
                    return false;
                }
            });
        }
    });
    return result;
}

async function scrapeGMP(ipoName) {
    console.log(`Searching GMP for: ${ipoName}...`);
    
    const promises = websites.map(async (site) => {
        const html = await fetchHTML(site.url);
        if (!html) return { site: site.name, gmp: 'Error fetching' };
        
        const $ = cheerio.load(html);
        const gmp = site.parser($, ipoName);
        return { site: site.name, gmp };
    });

    const results = await Promise.all(promises);
    console.table(results);
}

const args = process.argv.slice(2);
const ipo = args.length > 0 ? args.join(' ') : 'Tata Motors'; // Example

scrapeGMP(ipo);
