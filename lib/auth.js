const jwt = require('jsonwebtoken');

// In production, set this as an environment variable
const JWT_SECRET = process.env.JWT_SECRET || 'ipo-premium-secret-key-arham-2026';

// Hardcoded admin credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin';

function validateCredentials(username, password) {
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
