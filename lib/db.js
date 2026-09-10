/**
 * db.js — Storage layer.
 *
 * Vercel (serverless) → in-memory Maps (stateless; watchlist persisted in
 *   browser localStorage via the client — see page.js).
 * Local / Node server   → better-sqlite3 (persistent on disk).
 *
 * We detect Vercel via the VERCEL env var that Vercel injects automatically.
 */

const IS_VERCEL = !!process.env.VERCEL;

// ─── In-memory fallback ───────────────────────────────────────────────────────
const memWatchlist = new Map(); // link -> { name, link }

// ─── SQLite (local only) ──────────────────────────────────────────────────────
let db;
function getDb() {
  if (db) return db;
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs   = require('fs');
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  db = new Database(path.join(dataDir, 'ipo_app.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      ipo_name TEXT NOT NULL,
      ipo_link TEXT NOT NULL UNIQUE,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

// ─── Watchlist operations ─────────────────────────────────────────────────────
function getWatchlist() {
  if (IS_VERCEL) {
    return [...memWatchlist.values()];
  }
  return getDb().prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all()
    .map(row => ({ name: row.ipo_name, link: row.ipo_link }));
}

function setWatchlist(items) {
  // items: [{ name, link }]
  if (IS_VERCEL) {
    memWatchlist.clear();
    for (const item of items) memWatchlist.set(item.link, item);
    return { success: true };
  }
  const db  = getDb();
  const del = db.prepare('DELETE FROM watchlist');
  const ins = db.prepare('INSERT OR IGNORE INTO watchlist (ipo_name, ipo_link) VALUES (?, ?)');
  db.transaction((items) => {
    del.run();
    for (const item of items) ins.run(item.name, item.link);
  })(items);
  return { success: true };
}

module.exports = { getWatchlist, setWatchlist };
