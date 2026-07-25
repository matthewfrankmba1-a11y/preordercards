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

// Tracks the separate "drop is coming up" reminder email, distinct from the
// original one-at-a-time confirmation email (email_sent_at above).
const hasReminderSentAt = db
  .prepare(`SELECT COUNT(*) AS c FROM pragma_table_info('interests') WHERE name = 'reminder_sent_at'`)
  .get().c > 0;
if (!hasReminderSentAt) {
  db.exec(`ALTER TABLE interests ADD COLUMN reminder_sent_at TEXT`);
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

// Everyone who registered by email for a release and hasn't yet received
// the "drop is coming up" reminder — used for the batch send, not the
// one-at-a-time Discord confirmation button.
const getPendingReminderInterestsByRelease = db.prepare(`
  SELECT id, release_id AS releaseId, contact_type AS contactType, contact_value AS contactValue, quantity
  FROM interests
  WHERE release_id = ? AND contact_type = 'email' AND reminder_sent_at IS NULL
`);

const markReminderSent = db.prepare(`
  UPDATE interests SET reminder_sent_at = @sentAt WHERE id = @id
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
    key_type TEXT NOT NULL DEFAULT 'seller' CHECK (key_type IN ('seller', 'admin')),
    used INTEGER NOT NULL DEFAULT 0,
    used_by_seller_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sellers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invite_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seller_sessions (
    token TEXT PRIMARY KEY,
    seller_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS seller_password_resets (
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

  CREATE TABLE IF NOT EXISTS slot_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stats_summary_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    last_run_at TEXT
  );
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
addColumnIfMissing('seller_invite_keys', 'key_type', "TEXT NOT NULL DEFAULT 'seller'");
addColumnIfMissing('sellers', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('sellers', 'email', 'TEXT');
addColumnIfMissing('seller_invite_keys', 'expires_at', 'TEXT');
addColumnIfMissing('sellers', 'full_name', 'TEXT');
addColumnIfMissing('sellers', 'phone', 'TEXT');
addColumnIfMissing('sellers', 'venmo', 'TEXT');
addColumnIfMissing('sellers', 'cashapp', 'TEXT');
addColumnIfMissing('sellers', 'zelle', 'TEXT');
addColumnIfMissing('sellers', 'profile_completed_at', 'TEXT');

const insertInviteKey = db.prepare(`
  INSERT INTO seller_invite_keys (key_code, key_type, expires_at) VALUES (@keyCode, @keyType, @expiresAt)
`);

const getInviteKey = db.prepare(`SELECT * FROM seller_invite_keys WHERE key_code = ?`);

const countSuperKeys = db.prepare(`SELECT COUNT(*) AS c FROM seller_invite_keys WHERE key_type = 'admin'`);

const markInviteKeyUsed = db.prepare(`
  UPDATE seller_invite_keys SET used = 1, used_by_seller_id = @sellerId WHERE key_code = @keyCode
`);

const listInviteKeys = db.prepare(`
  SELECT key_code AS keyCode, key_type AS keyType, used, used_by_seller_id AS usedBySellerId, created_at AS createdAt
  FROM seller_invite_keys ORDER BY id
`);

const listInviteKeysWithAlias = db.prepare(`
  SELECT k.key_code AS keyCode, k.key_type AS keyType, k.used, k.created_at AS createdAt,
         k.expires_at AS expiresAt, s.display_name AS alias
  FROM seller_invite_keys k
  LEFT JOIN sellers s ON s.id = k.used_by_seller_id
  ORDER BY k.id
`);

const insertSeller = db.prepare(`
  INSERT INTO sellers (invite_key, password_hash, display_name, is_admin, email)
  VALUES (@inviteKey, @passwordHash, @displayName, @isAdmin, @email)
`);

const getSellerByInviteKey = db.prepare(`SELECT * FROM sellers WHERE invite_key = ?`);

const getSellerById = db.prepare(`SELECT * FROM sellers WHERE id = ?`);

const updateSellerEmail = db.prepare(`UPDATE sellers SET email = @email WHERE id = @sellerId`);

const updateSellerPassword = db.prepare(`UPDATE sellers SET password_hash = @passwordHash WHERE id = @sellerId`);

const updateSellerProfile = db.prepare(`
  UPDATE sellers
  SET full_name = @fullName, phone = @phone, venmo = @venmo, cashapp = @cashapp, zelle = @zelle,
      profile_completed_at = CURRENT_TIMESTAMP
  WHERE id = @sellerId
`);

// Used for account recovery when a seller has lost their invite key —
// exact match on normalized phone plus a case-insensitive name match.
const findSellerByNamePhone = db.prepare(`
  SELECT * FROM sellers WHERE phone = @phone AND LOWER(full_name) = LOWER(@fullName)
`);

const insertPasswordReset = db.prepare(`
  INSERT INTO seller_password_resets (token, seller_id, expires_at) VALUES (@token, @sellerId, @expiresAt)
`);

const getPasswordReset = db.prepare(`SELECT * FROM seller_password_resets WHERE token = ?`);

const deletePasswordResetsBySeller = db.prepare(`DELETE FROM seller_password_resets WHERE seller_id = ?`);

const insertSession = db.prepare(`
  INSERT INTO seller_sessions (token, seller_id, expires_at) VALUES (@token, @sellerId, @expiresAt)
`);

const getSession = db.prepare(`
  SELECT sess.token, sess.expires_at AS expiresAt, s.id AS sellerId, s.display_name AS displayName,
         s.is_admin AS isAdmin, s.email AS email, s.profile_completed_at AS profileCompletedAt
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

// --- Admin (super key) ---

// Admin-only (gated by requireAdmin in marketplace.js) — includes seller
// contact/payout details so the admin can actually pay a seller after a
// sale. Deliberately never selects password_hash.
const getAllListingsAdmin = db.prepare(`
  SELECT l.id, l.description, l.sku, l.image_url AS imageUrl, l.price, l.quantity, l.status,
         l.created_at AS createdAt, s.display_name AS sellerName,
         s.full_name AS sellerFullName, s.phone AS sellerPhone, s.email AS sellerEmail,
         s.venmo AS sellerVenmo, s.cashapp AS sellerCashapp, s.zelle AS sellerZelle
  FROM listings l
  JOIN sellers s ON s.id = l.seller_id
  ORDER BY l.created_at DESC
`);

const deleteListingInterestsByListing = db.prepare(`DELETE FROM listing_interests WHERE listing_id = ?`);

const deleteListingByIdAdmin = db.prepare(`DELETE FROM listings WHERE id = ?`);

// --- Admin: revoke a seller (and their key) entirely ---

const countListingsBySeller = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE seller_id = ?`);

const deleteListingInterestsBySeller = db.prepare(`
  DELETE FROM listing_interests WHERE listing_id IN (SELECT id FROM listings WHERE seller_id = ?)
`);

const deleteListingsBySeller = db.prepare(`DELETE FROM listings WHERE seller_id = ?`);

const deleteSessionsBySeller = db.prepare(`DELETE FROM seller_sessions WHERE seller_id = ?`);

const deleteSellerById = db.prepare(`DELETE FROM sellers WHERE id = ?`);

const deleteInviteKeyByCode = db.prepare(`DELETE FROM seller_invite_keys WHERE key_code = ?`);

// --- Stats summary (Discord notification every 6 hours) ---

const insertSlotSubmission = db.prepare(`INSERT INTO slot_submissions (created_at) VALUES (CURRENT_TIMESTAMP)`);

const countSlotSubmissionsSince = db.prepare(`SELECT COUNT(*) AS c FROM slot_submissions WHERE created_at > ?`);

const countInterestsSince = db.prepare(`SELECT COUNT(*) AS c FROM interests WHERE created_at > ?`);

const countListingInterestsSince = db.prepare(`SELECT COUNT(*) AS c FROM listing_interests WHERE created_at > ?`);

const getStatsSummaryState = db.prepare(`SELECT last_run_at AS lastRunAt FROM stats_summary_state WHERE id = 1`);

const setStatsSummaryState = db.prepare(`
  INSERT INTO stats_summary_state (id, last_run_at) VALUES (1, @lastRunAt)
  ON CONFLICT (id) DO UPDATE SET last_run_at = excluded.last_run_at
`);

module.exports = {
  db,
  upsertInterest,
  countByRelease,
  getInterestByReleaseAndContact,
  getInterestById,
  markEmailSent,
  getPendingReminderInterestsByRelease,
  markReminderSent,
  insertInviteKey,
  getInviteKey,
  markInviteKeyUsed,
  listInviteKeys,
  listInviteKeysWithAlias,
  insertSeller,
  getSellerByInviteKey,
  getSellerById,
  updateSellerEmail,
  updateSellerPassword,
  updateSellerProfile,
  findSellerByNamePhone,
  insertPasswordReset,
  getPasswordReset,
  deletePasswordResetsBySeller,
  insertSession,
  getSession,
  deleteSession,
  insertListing,
  getListingsBySeller,
  getActiveListings,
  getListingById,
  markListingSold,
  upsertListingInterest,
  countSuperKeys,
  getAllListingsAdmin,
  deleteListingInterestsByListing,
  deleteListingByIdAdmin,
  countListingsBySeller,
  deleteListingInterestsBySeller,
  deleteListingsBySeller,
  deleteSessionsBySeller,
  deleteSellerById,
  deleteInviteKeyByCode,
  insertSlotSubmission,
  countSlotSubmissionsSince,
  countInterestsSince,
  countListingInterestsSince,
  getStatsSummaryState,
  setStatsSummaryState,
};
