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

// --- Seller marketplace ---

db.exec(`
  CREATE TABLE IF NOT EXISTS seller_invite_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_code TEXT NOT NULL UNIQUE,
    used INTEGER NOT NULL DEFAULT 0,
    used_by_seller_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sellers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invite_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seller_sessions (
    token TEXT PRIMARY KEY,
    seller_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    sku TEXT,
    image_url TEXT,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_listings_seller_id ON listings (seller_id);
  CREATE INDEX IF NOT EXISTS idx_listings_status ON listings (status);

  CREATE TABLE IF NOT EXISTS listing_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('email', 'phone')),
    contact_value TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (listing_id, contact_value)
  );
  CREATE INDEX IF NOT EXISTS idx_listing_interests_listing_id ON listing_interests (listing_id);
`);

// Migrations: add quantity to tables created before this column existed.
function addColumnIfMissing(table, column, definition) {
  const exists = db
    .prepare(`SELECT COUNT(*) AS c FROM pragma_table_info('${table}') WHERE name = '${column}'`)
    .get().c > 0;
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing('listings', 'quantity', 'INTEGER NOT NULL DEFAULT 1');
addColumnIfMissing('listing_interests', 'quantity', 'INTEGER NOT NULL DEFAULT 1');

const insertInviteKey = db.prepare(`INSERT INTO seller_invite_keys (key_code) VALUES (?)`);

const getInviteKey = db.prepare(`SELECT * FROM seller_invite_keys WHERE key_code = ?`);

const markInviteKeyUsed = db.prepare(`
  UPDATE seller_invite_keys SET used = 1, used_by_seller_id = @sellerId WHERE key_code = @keyCode
`);

const listInviteKeys = db.prepare(`
  SELECT key_code AS keyCode, used, used_by_seller_id AS usedBySellerId, created_at AS createdAt
  FROM seller_invite_keys ORDER BY id
`);

const insertSeller = db.prepare(`
  INSERT INTO sellers (invite_key, password_hash, display_name)
  VALUES (@inviteKey, @passwordHash, @displayName)
`);

const getSellerByInviteKey = db.prepare(`SELECT * FROM sellers WHERE invite_key = ?`);

const getSellerById = db.prepare(`SELECT * FROM sellers WHERE id = ?`);

const insertSession = db.prepare(`
  INSERT INTO seller_sessions (token, seller_id, expires_at) VALUES (@token, @sellerId, @expiresAt)
`);

const getSession = db.prepare(`
  SELECT sess.token, sess.expires_at AS expiresAt, s.id AS sellerId, s.display_name AS displayName
  FROM seller_sessions sess
  JOIN sellers s ON s.id = sess.seller_id
  WHERE sess.token = ?
`);

const deleteSession = db.prepare(`DELETE FROM seller_sessions WHERE token = ?`);

const insertListing = db.prepare(`
  INSERT INTO listings (seller_id, description, sku, image_url, price, quantity)
  VALUES (@sellerId, @description, @sku, @imageUrl, @price, @quantity)
`);

const getListingsBySeller = db.prepare(`
  SELECT * FROM listings WHERE seller_id = ? ORDER BY created_at DESC
`);

const getActiveListings = db.prepare(`
  SELECT l.id, l.description, l.sku, l.image_url AS imageUrl, l.price, l.quantity, l.status,
         l.created_at AS createdAt, s.display_name AS sellerName
  FROM listings l
  JOIN sellers s ON s.id = l.seller_id
  WHERE l.status = 'active'
  ORDER BY l.created_at DESC
`);

const getListingById = db.prepare(`SELECT * FROM listings WHERE id = ?`);

const markListingSold = db.prepare(`
  UPDATE listings SET status = 'sold' WHERE id = @id AND seller_id = @sellerId
`);

const upsertListingInterest = db.prepare(`
  INSERT INTO listing_interests (listing_id, contact_type, contact_value, quantity)
  VALUES (@listingId, @contactType, @contactValue, @quantity)
  ON CONFLICT (listing_id, contact_value)
  DO UPDATE SET contact_type = excluded.contact_type, quantity = excluded.quantity, created_at = CURRENT_TIMESTAMP
`);

module.exports = {
  db,
  upsertInterest,
  countByRelease,
  getInterestByReleaseAndContact,
  getInterestById,
  markEmailSent,
  insertInviteKey,
  getInviteKey,
  markInviteKeyUsed,
  listInviteKeys,
  insertSeller,
  getSellerByInviteKey,
  getSellerById,
  insertSession,
  getSession,
  deleteSession,
  insertListing,
  getListingsBySeller,
  getActiveListings,
  getListingById,
  markListingSold,
  upsertListingInterest,
};
