import axios from 'axios';
import * as cheerio from 'cheerio';

interface ScrapeResult {
    site: string;
    gmp: string;
    url: string;
}

function fuzzyMatch(text: string, search: string) {
    if (!text || !search) return false;
    // Extract the primary name (first word) to handle variations like "LTD" vs "Limited"
    const searchMain = search.toLowerCase().split(' ')[0].replace(/[^a-z0-9]/g, '');
    const t = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return searchMain.length > 2 ? t.includes(searchMain) : t.includes(search.toLowerCase().replace(/[^a-z0-9]/g, ''));
}

async function fetchHTML(url: string, customHeaders?: Record<string, string>): Promise<string | null> {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-IN,en;q=0.9',
                'Referer': 'https://www.google.com/',
                ...customHeaders, // override/add custom headers if provided
            },
            timeout: 12000
        });
        return data;
    } catch {
        return null;
    }
}

// ---- IPO Trend: Table has Col 0: IPO Company, Col 1: Price Band, Col 2: Live GMP, Col 3: Est Gain ----
function parseIpoTrend($: cheerio.CheerioAPI, searchIpo: string): string {
    let result = 'N/A';
    $('table tr, tr').each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length < 2) return;
        const rowText = $(el).text();
        if (!fuzzyMatch(rowText, searchIpo)) return;

        let gmpCell = '';
        let gainCell = '';

        // Column 2 is Live GMP, Column 3 is Est Gain
        if (tds.length >= 3) {
            const col2Text = $(tds.eq(2)).text().trim();
            if (col2Text && !/₹?\d+\s*-\s*₹?\d+/.test(col2Text)) {
                gmpCell = col2Text;
                if (tds.length >= 4) {
                    gainCell = $(tds.eq(3)).text().trim();
                }
            }
        }

        // Fallback: search tds for a value that contains ₹ or digits but is NOT a price range
        if (!gmpCell) {
            tds.each((j, td) => {
                if (j === 0) return;
                const text = $(td).text().trim();
                if (/₹?\d+\s*-\s*₹?\d+/.test(text)) return; // Skip price band range
                if (/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(text)) return;

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
    });
    return result;
}

// ---- InvestorGain/Chittorgarh: col[0]=Name col[1]=GMP (e.g. "₹ 15 (11.54%)") ----
function parseInvestorGain($: cheerio.CheerioAPI, searchIpo: string): string {
    let result = 'N/A';
    $('table tr').each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length < 2) return;
        const nameText = $(tds.eq(0)).text().trim();
        if (!fuzzyMatch(nameText, searchIpo)) return;
        const gmpText = $(tds.eq(1)).text().trim();
        if (gmpText && gmpText !== '--' && gmpText !== '₹ -- (0.00%)' && !/₹?\d+\s*-\s*₹?\d+/.test(gmpText)) {
            result = gmpText;
            return false;
        }
    });
    return result;
}

// ---- IPO Ji: Exp Prem column — look for row with name, pick col 2-4 with ₹ or number ----
function parseIpoJi($: cheerio.CheerioAPI, searchIpo: string): string {
    let result = 'N/A';
    $('tr').each((_, el) => {
        const rowText = $(el).text();
        if (!fuzzyMatch(rowText, searchIpo)) return;
        const tds = $(el).find('td');
        tds.each((j, td) => {
            const text = $(td).text().trim();
            if (j > 0 && j < 6 && (text.includes('₹') || /^-?\d+(\.\d+)?$/.test(text)) && !/₹?\d+\s*-\s*₹?\d+/.test(text)) {
                result = text;
                return false;
            }
        });
        if (result !== 'N/A') return false;
    });
    return result;
}

// ---- IPO Watch: ₹ in any td after column 0 (excluding price range) ----
function parseIpoWatch($: cheerio.CheerioAPI, searchIpo: string): string {
    let result = 'N/A';
    $('tr').each((_, el) => {
        const rowText = $(el).text();
        if (!fuzzyMatch(rowText, searchIpo)) return;
        $(el).find('td').each((j, td) => {
            const text = $(td).text().trim();
            if (j > 0 && text.includes('₹') && !/₹?\d+\s*-\s*₹?\d+/.test(text)) {
                result = text.split('\n')[0].trim();
                return false;
            }
        });
        if (result !== 'N/A') return false;
    });
    return result;
}

// ---- IPO Corner: React SPA with card layout — find element with IPO name then nearby Premium GMP ----
function parseIpoCorner($: cheerio.CheerioAPI, searchIpo: string): string {
    let result = 'N/A';

    // The page is SPA rendered but static HTML may have some data; search all elements
    const allText = $('body').text();
    
    // Try to extract the GMP value near the IPO name in full body text
    const lines = allText.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
    let foundIpo = false;
    
    for (let i = 0; i < lines.length; i++) {
        if (fuzzyMatch(lines[i], searchIpo)) {
            foundIpo = true;
            // Look in next 20 lines for GMP / Premium
            for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
                const line = lines[j];
                if (line.toLowerCase().includes('premium') || line.toLowerCase().includes('gmp')) {
                    // Next line should have the value
                    for (let k = j + 1; k < Math.min(j + 5, lines.length); k++) {
                        const valLine = lines[k];
                        const match = valLine.match(/(₹\s*-?\d+(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*(?:\(.*?\))?/);
                        if (match) {
                            result = match[0].trim();
                            return result;
                        }
                    }
                }
            }
        }
    }

    if (!foundIpo) return 'IPO Not Listed';
    
    // Fallback to table search
    $('tr').each((_, el) => {
        const rowText = $(el).text();
        if (!fuzzyMatch(rowText, searchIpo)) return;
        $(el).find('td').each((j, td) => {
            const text = $(td).text().trim();
            if (j > 0 && (text.includes('₹') || /^-?\d+(\.\d+)?$/.test(text))) {
                result = text;
                return false;
            }
        });
        if (result !== 'N/A') return false;
    });
    
    return result;
}

// ---- IPO Premium (ipopremium.in): noscript fallback table — col0=Company, col1=Type, col2=GMP(₹) ----
// The main page renders data via JS, but serves a <noscript> table with all the data server-side.
// Cheerio doesn't traverse into <noscript> as DOM, so we extract its raw inner HTML and re-parse it.
function parseIpoPremium(mainHtml: string, searchIpo: string): string {
    // Extract raw noscript content
    const nsMatch = mainHtml.match(/<noscript>([\s\S]*?)<\/noscript>/i);
    if (!nsMatch) return 'N/A';
    
    const $ = cheerio.load(nsMatch[1]);
    let result = 'N/A';
    
    // Noscript table: Company Name (col 0) | Type (col 1) | GMP (₹) (col 2)
    $('tr').each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length < 3) return;
        const nameText = $(tds.eq(0)).text().trim();
        if (!fuzzyMatch(nameText, searchIpo)) return;
        const gmpText = $(tds.eq(2)).text().trim();
        if (gmpText !== '' && gmpText !== '-' && gmpText !== '--') {
            const numVal = parseFloat(gmpText);
            if (!isNaN(numVal)) {
                result = numVal === 0 ? '₹0 (No GMP)' : `₹${gmpText}`;
            } else {
                result = gmpText;
            }
            return false;
        }
    });
    return result;
}

const websites = [
    { name: 'IPO Trend', shortName: 'ipo-trend.com', url: 'https://ipo-trend.com/ipo-gmp', parser: parseIpoTrend },
    { name: 'IPO Watch', shortName: 'ipowatch.in', url: 'https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', parser: parseIpoWatch },
    { name: 'Chittorgarh', shortName: 'chittorgarh.com', url: 'https://www.investorgain.com/report/live-ipo-gmp/331/', parser: parseInvestorGain },
    { name: 'IPO Ji', shortName: 'ipoji.com', url: 'https://www.ipoji.com/', parser: parseIpoJi },
    { name: 'IPO Corner', shortName: 'ipocornerr.com', url: 'https://ipocornerr.com/', parser: parseIpoCorner },
    {
        name: 'IPO Premium',
        shortName: 'ipopremium.in',
        url: 'https://www.ipopremium.in/',
        parser: null, // uses rawHtmlParser instead
        rawHtmlParser: parseIpoPremium,
        customHeaders: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/109.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        },
    },
] as const;

export async function scrapeAllGMP(ipoName: string): Promise<ScrapeResult[]> {
    if (!ipoName) return [];

    // Cache HTML so same URL isn't fetched twice (keyed by URL)
    const htmlCache: Record<string, string | null> = {};

    const promises = (websites as unknown as any[]).map(async (site) => {
        const cacheKey = site.url;
        if (!(cacheKey in htmlCache)) {
            htmlCache[cacheKey] = await fetchHTML(site.url, site.customHeaders);
        }
        const html = htmlCache[cacheKey];
        if (!html) return { site: site.name, gmp: 'Fetch Error', url: site.url };

        let gmp: string;
        if (site.rawHtmlParser) {
            // Parser that operates on raw HTML string (e.g., needs to parse noscript blocks)
            gmp = site.rawHtmlParser(html, ipoName);
        } else {
            const $ = cheerio.load(html);
            gmp = site.parser($, ipoName);
        }
        return { site: site.name, gmp, url: site.url };
    });

    return Promise.all(promises);
}

export async function getLiveIpoList(): Promise<{ name: string; category: string }[]> {
    const html = await fetchHTML('https://www.investorgain.com/report/live-ipo-gmp/331/');
    if (!html) return [];

    const $ = cheerio.load(html);
    const ipos: { name: string; category: string }[] = [];
    const seen = new Set<string>();

    $('table tr').each((_, el) => {
        const tds = $(el).find('td');
        if (tds.length < 2) return;
        const rawName = $(tds.eq(0)).text().trim();
        // Remove trailing IPO or SME labels if needed, clean up line breaks
        const name = rawName.split('\n')[0].replace(/\s+IPO$/i, '').trim();
        if (name && name.length > 2 && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase());
            const isSme = rawName.toLowerCase().includes('sme') || name.toLowerCase().includes('sme');
            ipos.push({
                name,
                category: isSme ? 'SME' : 'Mainboard'
            });
        }
    });

    return ipos;
}

