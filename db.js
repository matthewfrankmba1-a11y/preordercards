const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// DATA_DIR lets production point the database at a persistent disk mount
// (e.g. Render's /var/data) instead of the app's own bundle directory, which
// gets wiped and replaced on every deploy.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'preorders.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id TEXT NOT NULL,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'phone')),
    contact_value TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (release_id, contact_value)
  );
  CREATE INDEX IF NOT EXISTS idx_interests_release_id ON interests (release_id);
`);

const upsertInterest = db.prepare(`
  INSERT INTO interests (release_id, contact_type, contact_value, quantity)
  VALUES (@releaseId, @contactType, @contactValue, @quantity)
  ON CONFLICT (release_id, contact_value)
  DO UPDATE SET quantity = excluded.quantity, contact_type = excluded.contact_type, created_at = CURRENT_TIMESTAMP
`);

const countByRelease = db.prepare(`
  SELECT release_id AS releaseId, COUNT(*) AS count
  FROM interests
  GROUP BY release_id
`);

module.exports = { db, upsertInterest, countByRelease };
