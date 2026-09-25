import { NextRequest, NextResponse } from 'next/server';
import { scrapeAllGMP } from '@/lib/scraper';

export async function GET(req: NextRequest) {
    try {
        const searchParams = req.nextUrl.searchParams;
        const ipoName = searchParams.get('ipoName');
        
        if (!ipoName) {
            return NextResponse.json({ error: "Missing ipoName parameter" }, { status: 400 });
        }

        const data = await scrapeAllGMP(ipoName);
        
        return NextResponse.json({ success: true, data }, { status: 200 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
