const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'data', 'preorders.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS preorders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    release_id TEXT NOT NULL,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'phone')),
    contact_value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (release_id, contact_value)
  );
  CREATE INDEX IF NOT EXISTS idx_preorders_release_id ON preorders (release_id);
`);

const insertPreorder = db.prepare(`
  INSERT INTO preorders (release_id, contact_type, contact_value)
  VALUES (@releaseId, @contactType, @contactValue)
`);

const countByRelease = db.prepare(`
  SELECT release_id AS releaseId, COUNT(*) AS count
  FROM preorders
  GROUP BY release_id
`);

module.exports = { db, insertPreorder, countByRelease };
