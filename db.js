const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data', 'preorders.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id TEXT NOT NULL,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'phone')),
    contact_value TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    product_type TEXT NOT NULL CHECK (product_type IN ('value', 'mega', 'hobby', 'hobby_case')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (release_id, contact_value, product_type)
  );
  CREATE INDEX IF NOT EXISTS idx_interests_release_id ON interests (release_id);
`);

const upsertInterest = db.prepare(`
  INSERT INTO interests (release_id, contact_type, contact_value, quantity, product_type)
  VALUES (@releaseId, @contactType, @contactValue, @quantity, @productType)
  ON CONFLICT (release_id, contact_value, product_type)
  DO UPDATE SET quantity = excluded.quantity, contact_type = excluded.contact_type, created_at = CURRENT_TIMESTAMP
`);

const countByRelease = db.prepare(`
  SELECT release_id AS releaseId, COUNT(*) AS count
  FROM interests
  GROUP BY release_id
`);

module.exports = { db, upsertInterest, countByRelease };
