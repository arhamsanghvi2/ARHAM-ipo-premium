const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists (works both locally and on hosted server)
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'ipo_app.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    
    // Create tables if they don't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ipo_name TEXT NOT NULL,
        ipo_link TEXT NOT NULL UNIQUE,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS gmp_cache (
        ipo_link TEXT PRIMARY KEY,
        gmp TEXT,
        gmp_pct TEXT,
        price_band TEXT,
        lot_size TEXT,
        subscribed TEXT,
        all_tiles TEXT,
        last_scraped DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
  return db;
}

// Watchlist operations
function getWatchlist() {
  const db = getDb();
  return db.prepare('SELECT * FROM watchlist ORDER BY added_at DESC').all();
}

function addToWatchlist(ipoName, ipoLink) {
  const db = getDb();
  try {
    db.prepare('INSERT OR IGNORE INTO watchlist (ipo_name, ipo_link) VALUES (?, ?)').run(ipoName, ipoLink);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function removeFromWatchlist(ipoLink) {
  const db = getDb();
  db.prepare('DELETE FROM watchlist WHERE ipo_link = ?').run(ipoLink);
  return { success: true };
}

function setWatchlist(items) {
  // items: [{ name, link }]
  const db = getDb();
  const deleteAll = db.prepare('DELETE FROM watchlist');
  const insert = db.prepare('INSERT OR IGNORE INTO watchlist (ipo_name, ipo_link) VALUES (?, ?)');
  const txn = db.transaction((items) => {
    deleteAll.run();
    for (const item of items) {
      insert.run(item.name, item.link);
    }
  });
  txn(items);
  return { success: true };
}

// GMP Cache operations
function getGmpCache(ipoLink) {
  const db = getDb();
  return db.prepare('SELECT * FROM gmp_cache WHERE ipo_link = ?').get(ipoLink);
}

function setGmpCache(ipoLink, data) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO gmp_cache (ipo_link, gmp, gmp_pct, price_band, lot_size, subscribed, all_tiles, last_scraped)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    ipoLink,
    data.gmp || null,
    data.gmpPct || null,
    data.priceBand || null,
    data.lotSize || null,
    data.subscribed || null,
    JSON.stringify(data.allTiles || {})
  );
}

module.exports = { getDb, getWatchlist, addToWatchlist, removeFromWatchlist, setWatchlist, getGmpCache, setGmpCache };
