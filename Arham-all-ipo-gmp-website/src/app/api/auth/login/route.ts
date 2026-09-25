import { NextRequest, NextResponse } from 'next/server';
import { validateCredentials, signToken, COOKIE_NAME } from '@/lib/auth';

export async function POST(req: NextRequest) {
    try {
        const { username, password } = await req.json();
        if (!validateCredentials(username, password)) {
            return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
        }
        // signToken is synchronous (jsonwebtoken)
        const token = signToken(username);
        const response = NextResponse.json({ success: true, message: 'Logged in' });
        response.cookies.set(COOKIE_NAME, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            path: '/',
        });
        return response;
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Server error';
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
