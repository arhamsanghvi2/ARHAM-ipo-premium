const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required — set it in .env.local (dev) or your host\'s env vars (production).');
}

function validateCredentials(username, password) {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return false; // fail closed if not configured
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

function signToken(username) {
  return jwt.sign({ username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function getTokenFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k, v.join('=')];
    })
  );
  return cookies['ipo_token'] || null;
}

function isAuthenticated(request) {
  const token = getTokenFromRequest(request);
  if (!token) return false;
  return !!verifyToken(token);
}

module.exports = { validateCredentials, signToken, verifyToken, getTokenFromRequest, isAuthenticated };
