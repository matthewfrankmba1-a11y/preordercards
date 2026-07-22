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

// Migration: add email_sent_at to tables created before this column existed.
const hasEmailSentAt = db
  .prepare(`SELECT COUNT(*) AS c FROM pragma_table_info('interests') WHERE name = 'email_sent_at'`)
  .get().c > 0;
if (!hasEmailSentAt) {
  db.exec(`ALTER TABLE interests ADD COLUMN email_sent_at TEXT`);
}

const upsertInterest = db.prepare(`
  INSERT INTO interests (release_id, contact_type, contact_value, quantity)
  VALUES (@releaseId, @contactType, @contactValue, @quantity)
  ON CONFLICT (release_id, contact_value)
  DO UPDATE SET quantity = excluded.quantity, contact_type = excluded.contact_type, created_at = CURRENT_TIMESTAMP
`);

const getInterestByReleaseAndContact = db.prepare(`
  SELECT id, release_id AS releaseId, contact_type AS contactType, contact_value AS contactValue,
         quantity, email_sent_at AS emailSentAt
  FROM interests WHERE release_id = ? AND contact_value = ?
`);

const getInterestById = db.prepare(`
  SELECT id, release_id AS releaseId, contact_type AS contactType, contact_value AS contactValue,
         quantity, email_sent_at AS emailSentAt
  FROM interests WHERE id = ?
`);

const markEmailSent = db.prepare(`
  UPDATE interests SET email_sent_at = @sentAt WHERE id = @id
`);

const countByRelease = db.prepare(`
  SELECT release_id AS releaseId, COUNT(*) AS count
  FROM interests
  GROUP BY release_id
`);

module.exports = {
  db,
  upsertInterest,
  countByRelease,
  getInterestByReleaseAndContact,
  getInterestById,
  markEmailSent,
};
