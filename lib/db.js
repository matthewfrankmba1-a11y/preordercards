const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Everything below is wrapped in initDb(), which only actually opens the
// database outside of Next's build step (see the phase check at the bottom).
// Next.js's build step ("collecting page data") imports every route module
// to statically analyze its exports — and confirmed empirically, that alone
// is enough to trigger a property read on every named import from this file,
// even via a lazy Proxy. On Render, DATA_DIR points at /var/data, a
// persistent disk that's only mounted at runtime, never during the
// ephemeral build step, so actually opening the database there throws and
// fails the whole build. The old Express app never had a build phase, so
// this only surfaced now.
function initDb() {
  // DATA_DIR lets production point the database at a persistent disk mount
  // (e.g. Render's /var/data) instead of the app's own bundle directory, which
  // gets wiped and replaced on every deploy.
  const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
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

  // Skips everyone else pending for a release without emailing them — used to
  // isolate a single test recipient before firing a real batch send.
  const markAllPendingRemindersSentExcept = db.prepare(`
    UPDATE interests
    SET reminder_sent_at = @sentAt
    WHERE release_id = @releaseId AND contact_type = 'email' AND reminder_sent_at IS NULL
      AND contact_value != @excludeContactValue
  `);

  const countByRelease = db.prepare(`
    SELECT release_id AS releaseId, COUNT(*) AS count
    FROM interests
    GROUP BY release_id
  `);

  // Full registrant detail (not just counts) for admin reporting, e.g. "who
  // signed up this week and how many". Ordered so a report grouped by
  // release stays contiguous without a second pass.
  const listInterestsSince = db.prepare(`
    SELECT id, release_id AS releaseId, contact_type AS contactType, contact_value AS contactValue,
           quantity, created_at AS createdAt
    FROM interests
    WHERE created_at > ?
    ORDER BY release_id, created_at
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

    CREATE TABLE IF NOT EXISTS discount_signups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- Single row (id=1): the TOTP secret backing the marketplace admin
    -- page's Google-Authenticator login. enrolled_at is NULL until the
    -- owner confirms the first code, so a half-finished /totp/setup call
    -- (secret generated, QR shown) can't be used to log in — only a
    -- completed enrollment can.
    CREATE TABLE IF NOT EXISTS admin_totp (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      secret TEXT NOT NULL,
      enrolled_at TEXT
    );

    -- Separate from seller_sessions — this is a distinct admin identity,
    -- not a seller account, so it gets its own cookie/session table rather
    -- than reusing seller auth.
    CREATE TABLE IF NOT EXISTS admin_marketplace_sessions (
      token TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
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
  addColumnIfMissing('listing_interests', 'cancelled_at', 'TEXT');
  addColumnIfMissing('interests', 'cancelled_at', 'TEXT');
  // Tracks the admin's "secured" / "not secured" outcome email — separate
  // from cancelled_at (shade/unfulfilled) and from email_sent_at /
  // reminder_sent_at (the earlier acknowledgment and drop-reminder emails).
  addColumnIfMissing('interests', 'outcome', `TEXT CHECK (outcome IN ('secured', 'not_secured'))`);
  addColumnIfMissing('interests', 'outcome_notified_at', 'TEXT');

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

  // --- Discount banner email signups ---

  const insertDiscountSignup = db.prepare(`
    INSERT OR IGNORE INTO discount_signups (email) VALUES (?)
  `);

  // --- Marketplace admin (TOTP-gated) ---

  const getAdminTotp = db.prepare(`SELECT secret, enrolled_at AS enrolledAt FROM admin_totp WHERE id = 1`);

  // Regenerating the secret always clears enrolled_at — a fresh secret
  // requires re-confirming with a real code before it can be used to log
  // in, same as first-time setup.
  const setAdminTotpSecret = db.prepare(`
    INSERT INTO admin_totp (id, secret, enrolled_at) VALUES (1, @secret, NULL)
    ON CONFLICT (id) DO UPDATE SET secret = excluded.secret, enrolled_at = NULL
  `);

  const markAdminTotpEnrolled = db.prepare(`UPDATE admin_totp SET enrolled_at = CURRENT_TIMESTAMP WHERE id = 1`);

  const insertAdminMarketplaceSession = db.prepare(`
    INSERT INTO admin_marketplace_sessions (token, expires_at) VALUES (@token, @expiresAt)
  `);

  const getAdminMarketplaceSession = db.prepare(`
    SELECT token, expires_at AS expiresAt FROM admin_marketplace_sessions WHERE token = ?
  `);

  const deleteAdminMarketplaceSession = db.prepare(`DELETE FROM admin_marketplace_sessions WHERE token = ?`);

  // One row per seller: completedSales counts listings actually marked
  // sold; pendingSales counts still-active listings that already have at
  // least one interested buyer (a sale in progress, not just a listing
  // sitting unsold with zero interest). loginCount is the lifetime count of
  // seller_sessions rows for that seller — sessions are never pruned except
  // on logout/key-revoke, so this approximates total logins including
  // since-expired ones.
  const getSellerStatsForAdmin = db.prepare(`
    SELECT
      s.id,
      s.email,
      s.display_name AS displayName,
      s.invite_key AS inviteKey,
      s.created_at AS createdAt,
      (SELECT COUNT(*) FROM listings WHERE seller_id = s.id AND status = 'sold') AS completedSales,
      (SELECT COUNT(*) FROM listings l
         WHERE l.seller_id = s.id AND l.status = 'active'
           AND EXISTS (SELECT 1 FROM listing_interests li WHERE li.listing_id = l.id)) AS pendingSales,
      (SELECT COUNT(*) FROM seller_sessions WHERE seller_id = s.id) AS loginCount
    FROM sellers s
    ORDER BY s.email
  `);

  // Every release-interest registration, newest first — the admin-panel
  // equivalent of listInterestsSince with no lower time bound. Release
  // titles aren't joined in (releases live in data/releases.json, not the
  // DB) — the caller maps releaseId to a title itself. cancelledAt is the
  // "shade out, unfulfilled" flag (soft, same as listing_interests);
  // deleteInterestById below is the separate hard-delete path for test rows.
  const listAllInterestsForAdmin = db.prepare(`
    SELECT id, release_id AS releaseId, contact_type AS contactType, contact_value AS contactValue,
           quantity, created_at AS createdAt, cancelled_at AS cancelledAt,
           outcome, outcome_notified_at AS outcomeNotifiedAt
    FROM interests
    ORDER BY created_at DESC
  `);

  const cancelInterest = db.prepare(`UPDATE interests SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ?`);

  const restoreInterest = db.prepare(`UPDATE interests SET cancelled_at = NULL WHERE id = ?`);

  const deleteInterestById = db.prepare(`DELETE FROM interests WHERE id = ?`);

  const setInterestOutcome = db.prepare(`
    UPDATE interests SET outcome = @outcome, outcome_notified_at = CURRENT_TIMESTAMP WHERE id = @id
  `);

  // Marketplace buyer interest, newest first, with enough listing/seller
  // context to compute a $ value (listingPrice * quantity) and show which
  // seller's item it was. cancelledAt is set by the admin when an inquiry
  // never turned into a sale — the row stays, just greyed out client-side.
  const getAllListingInterestsForAdmin = db.prepare(`
    SELECT li.id, li.contact_type AS contactType, li.contact_value AS contactValue, li.quantity,
           li.created_at AS createdAt, li.cancelled_at AS cancelledAt,
           l.id AS listingId, l.description AS listingDescription, l.price AS listingPrice, l.status AS listingStatus,
           s.display_name AS sellerName
    FROM listing_interests li
    JOIN listings l ON l.id = li.listing_id
    JOIN sellers s ON s.id = l.seller_id
    ORDER BY li.created_at DESC
  `);

  const cancelListingInterest = db.prepare(`UPDATE listing_interests SET cancelled_at = CURRENT_TIMESTAMP WHERE id = ?`);

  const restoreListingInterest = db.prepare(`UPDATE listing_interests SET cancelled_at = NULL WHERE id = ?`);

  return {
    db,
    upsertInterest,
    countByRelease,
    listInterestsSince,
    getInterestByReleaseAndContact,
    getInterestById,
    markEmailSent,
    getPendingReminderInterestsByRelease,
    markReminderSent,
    markAllPendingRemindersSentExcept,
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
    insertDiscountSignup,
    getAdminTotp,
    setAdminTotpSecret,
    markAdminTotpEnrolled,
    insertAdminMarketplaceSession,
    getAdminMarketplaceSession,
    deleteAdminMarketplaceSession,
    getSellerStatsForAdmin,
    listAllInterestsForAdmin,
    cancelInterest,
    restoreInterest,
    deleteInterestById,
    setInterestOutcome,
    getAllListingInterestsForAdmin,
    cancelListingInterest,
    restoreListingInterest,
  };
}

// Real export names, listed explicitly so the build-phase stub below (see
// getExports()) can have the exact same shape as the real module — Turbopack's
// CJS-to-ESM interop enumerates a module's keys (ownKeys/getOwnPropertyDescriptor,
// not just get) to build its namespace object, so a Proxy that only implements
// a `get` trap reports zero real keys and every import silently comes back
// undefined. Both branches must be plain objects with a real, matching key list.
const EXPORT_NAMES = [
  'db', 'upsertInterest', 'countByRelease', 'listInterestsSince', 'getInterestByReleaseAndContact', 'getInterestById',
  'markEmailSent', 'getPendingReminderInterestsByRelease', 'markReminderSent',
  'markAllPendingRemindersSentExcept', 'insertInviteKey', 'getInviteKey', 'markInviteKeyUsed',
  'listInviteKeys', 'listInviteKeysWithAlias', 'insertSeller', 'getSellerByInviteKey', 'getSellerById',
  'updateSellerEmail', 'updateSellerPassword', 'updateSellerProfile', 'findSellerByNamePhone',
  'insertPasswordReset', 'getPasswordReset', 'deletePasswordResetsBySeller', 'insertSession',
  'getSession', 'deleteSession', 'insertListing', 'getListingsBySeller', 'getActiveListings',
  'getListingById', 'markListingSold', 'upsertListingInterest', 'countSuperKeys', 'getAllListingsAdmin',
  'deleteListingInterestsByListing', 'deleteListingByIdAdmin', 'countListingsBySeller',
  'deleteListingInterestsBySeller', 'deleteListingsBySeller', 'deleteSessionsBySeller', 'deleteSellerById',
  'deleteInviteKeyByCode', 'insertSlotSubmission', 'countSlotSubmissionsSince', 'countInterestsSince',
  'countListingInterestsSince', 'getStatsSummaryState', 'setStatsSummaryState', 'insertDiscountSignup',
  'getAdminTotp', 'setAdminTotpSecret', 'markAdminTotpEnrolled', 'insertAdminMarketplaceSession',
  'getAdminMarketplaceSession', 'deleteAdminMarketplaceSession', 'getSellerStatsForAdmin',
  'listAllInterestsForAdmin', 'cancelInterest', 'restoreInterest', 'deleteInterestById', 'setInterestOutcome',
  'getAllListingInterestsForAdmin', 'cancelListingInterest', 'restoreListingInterest',
];

// A fake prepared statement: shaped like better-sqlite3's real Statement API
// (run/get/all) but never touches disk. Used only during Next's build step —
// see below — where these are read but never actually called (build only
// needs to see a route's exported HTTP methods, never executes them).
const STUB_STATEMENT = { run: () => ({ changes: 0, lastInsertRowid: 0 }), get: () => undefined, all: () => [] };
const buildPhaseStubExports = Object.fromEntries(EXPORT_NAMES.map((name) => [name, STUB_STATEMENT]));

// Lazy singleton: getExports() defers calling initDb() until the first
// actual property read (e.g. `db.upsertInterest`), which happens at real
// request time in normal operation. During `next build` (NEXT_PHASE ===
// 'phase-production-build'), though, that same property read happens simply
// by importing this file to inspect a route's exports — so in that phase
// we hand back the inert stub object above instead of calling initDb().
let cached = null;
function getExports() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return buildPhaseStubExports;
  if (!cached) cached = initDb();
  return cached;
}

module.exports = new Proxy(
  {},
  {
    get(target, prop) {
      return getExports()[prop];
    },
    has(target, prop) {
      return prop in getExports();
    },
    ownKeys() {
      return Reflect.ownKeys(getExports());
    },
    getOwnPropertyDescriptor(target, prop) {
      const exports = getExports();
      if (!(prop in exports)) return undefined;
      return { enumerable: true, configurable: true, value: exports[prop] };
    },
  }
);
