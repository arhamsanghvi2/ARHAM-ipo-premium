import { NextResponse } from 'next/server';
const { isAuthenticated } = require('@/lib/auth');
const { getWatchlist, setWatchlist } = require('@/lib/db');

export async function GET(request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const watchlist = getWatchlist();
    const items = watchlist.map(row => ({ name: row.ipo_name, link: row.ipo_link }));
    return NextResponse.json({ success: true, watchlist: items });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(request) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const { watchlist } = await request.json(); // [{ name, link }]
    setWatchlist(watchlist);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
