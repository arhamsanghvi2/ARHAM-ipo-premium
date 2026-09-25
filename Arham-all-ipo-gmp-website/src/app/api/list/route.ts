import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

// In-memory cache — survive warm serverless instances
let ipoListCache: IpoItem[] | null = null;
let ipoListFetchedAt = 0;
const CACHE_TTL = 60_000; // 60 seconds

export interface IpoItem {
    id: number | string;
    name: string;
    link: string;
    priceBand: string;
    lotSize: string;
    issueSize: string;
    gmp: string;
    gmpPct: string;
    status: 'open' | 'upcoming' | 'closed';
    dateRange: string;
    openDate: string;
    closeDate: string;
    type: 'Mainboard' | 'SME';
}

async function fetchIpoList(): Promise<IpoItem[]> {
    if (ipoListCache && Date.now() - ipoListFetchedAt < CACHE_TTL) {
        return ipoListCache;
    }

    const cookieFile = path.join(os.tmpdir(), `ipo_cookies_${Date.now()}.txt`);

    try {
        // Step 1 — Get homepage + session cookies + CSRF token
        const argsGet = [
            '-s', '-L', '--max-time', '15', '--compressed',
            '-c', cookieFile, '-b', cookieFile,
            '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'https://www.ipopremium.in/'
        ];
        const { stdout: homepageHtml } = await execFileAsync('curl', argsGet, { maxBuffer: 10 * 1024 * 1024, timeout: 20000 });

        const $home = cheerio.load(homepageHtml);
        const token =
            $home('meta[name="csrf-token"]').attr('content') ||
            homepageHtml.match(/_token\s*=\s*'([^']+)'/)?.[1] ||
            homepageHtml.match(/name="_token"\s+value="([^"]+)"/)?.[1] ||
            '';

        if (!token) throw new Error('CSRF token not found on ipopremium.in');

        // Step 2 — POST to /ipo DataTables endpoint — get upcoming + open IPOs
        const postData = new URLSearchParams({
            draw: '1', start: '0', length: '200',
            'search[value]': '', _token: token,
            all: 'true', eq: 'true', sme: 'true',
            all_ipos: 'true', upcoming_ipos: 'false',
            open_ipos: 'false', closed_ipos: 'false'
        }).toString();

        const argsPost = [
            '-s', '-L', '--max-time', '15', '--compressed',
            '-c', cookieFile, '-b', cookieFile,
            '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '-H', 'X-Requested-With: XMLHttpRequest',
            '-H', 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8',
            '-H', 'Referer: https://www.ipopremium.in/',
            '-H', `X-CSRF-TOKEN: ${token}`,
            '-d', postData,
            'https://www.ipopremium.in/ipo'
        ];

        const { stdout: responseText } = await execFileAsync('curl', argsPost, { maxBuffer: 10 * 1024 * 1024, timeout: 20000 });
        const json = JSON.parse(responseText);

        if (!json.data || !Array.isArray(json.data)) return ipoListCache || [];

        const ipos: IpoItem[] = (json.data as Record<string, unknown>[]).map((item) => {
            const $name = cheerio.load((item.name as string) || '');
            const link = $name('a').attr('href') || '';
            const name = $name('a').text().trim() || $name.text().trim();
            const relativeLink = link.replace('https://www.ipopremium.in', '');

            let gmp = 'N/A';
            let gmpPct = '';
            if (item.premium) {
                const $prem = cheerio.load((item.premium as string));
                gmpPct = $prem('small').text().trim();
                $prem('small').remove();
                gmp = $prem.text().trim() || 'N/A';
            }

            let dateRange = '';
            if (item.open) {
                const $open = cheerio.load((item.open as string));
                $open('small').remove();
                const rawRange = $open.text().trim();
                if (rawRange) dateRange = rawRange.replace(/\s*–\s*|\s*-\s*/g, ' to ');
            }

            const statusRaw = (item.current_status as string) || 'closed';
            const status: 'open' | 'upcoming' | 'closed' =
                statusRaw === 'open' ? 'open' : statusRaw === 'upcoming' ? 'upcoming' : 'closed';

            return {
                id: item.id as number,
                name,
                link: relativeLink,
                priceBand: (item.price as string) || 'N/A',
                lotSize: (item.lot_size as string) || 'N/A',
                issueSize: (item.issue_size as string) || 'N/A',
                gmp,
                gmpPct,
                status,
                dateRange,
                openDate: item.open ? cheerio.load(item.open as string).text().trim() : '',
                closeDate: (item.close as string) || '',
                type: (item.type as string) === 'SME' ? 'SME' : 'Mainboard',
            } satisfies IpoItem;
        }).filter(i => i.name && i.link);

        // Prioritize: open first, then upcoming, then the rest
        ipos.sort((a, b) => {
            const order = { open: 0, upcoming: 1, closed: 2 };
            return order[a.status] - order[b.status];
        });

        ipoListCache = ipos;
        ipoListFetchedAt = Date.now();
        return ipos;

    } catch (e) {
        console.error('fetchIpoList error:', (e as Error).message);
        // Fallback to InvestorGain scrape if ipopremium fails
        return ipoListCache || [];
    } finally {
        if (fs.existsSync(cookieFile)) {
            try { fs.unlinkSync(cookieFile); } catch {}
        }
    }
}

export async function GET() {
    try {
        const ipos = await fetchIpoList();
        return NextResponse.json({ success: true, ipos });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Failed to fetch IPO list';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
