// Auth utilities — same credential system as the main Arham IPO Premium app
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const JWT_SECRET = process.env.JWT_SECRET || 'ipo-premium-secret-key-arham-2026';
export const COOKIE_NAME = 'ipo_token';

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'admin';

export function validateCredentials(username: string, password: string): boolean {
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function signToken(username: string): string {
    return jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): jwt.JwtPayload | null {
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        return typeof payload === 'object' ? payload : null;
    } catch {
        return null;
    }
}

export async function getSessionFromRequest(req: NextRequest) {
    const token = req.cookies.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}

export async function getSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return null;
    return verifyToken(token);
}
