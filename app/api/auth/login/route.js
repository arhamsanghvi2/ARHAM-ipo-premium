import { NextResponse } from 'next/server';
const { validateCredentials, signToken } = require('@/lib/auth');

export async function POST(request) {
  try {
    const { username, password } = await request.json();
    
    if (!validateCredentials(username, password)) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }
    
    const token = signToken(username);
    
    const response = NextResponse.json({ success: true, message: 'Logged in' });
    response.cookies.set('ipo_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    
    return response;
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
