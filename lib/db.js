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

    -- Agent-authored blog posts. Deliberately stored as data rather than as
    -- committed page.js files (like the hand-written posts under
    -- app/blog/<slug>/) so the agent can publish without a git push and a
    -- Render redeploy — app/blog/[slug] renders these at request time.
    -- body_json is a JSON array of {heading, paragraphs[]} sections, not
    -- HTML: the renderer maps it to real elements, so nothing the model
    -- writes can inject markup.
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      tagline TEXT,
      body_json TEXT NOT NULL,
      tweet TEXT NOT NULL,
      read_minutes INTEGER NOT NULL DEFAULT 2,
      date_published TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_blog_posts_date ON blog_posts (date_published);

    CREATE TABLE IF NOT EXISTS blog_agent_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_run_at TEXT
    );

    -- Keyed by path rather than being a single homepage counter, so other
    -- pages can be counted later without a migration. One row per path.
    CREATE TABLE IF NOT EXISTS page_views (
      path TEXT PRIMARY KEY,
      views INTEGER NOT NULL DEFAULT 0
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

    -- One row per (issue, recipient) for the weekly newsletter. An "issue"
    -- isn't its own record: it's the blog post the agent published for that
    -- week (blog_posts above), identified here by issue_key — the post's
    -- slug, or "week-of-<sunday>" on a week with no post, which is the only
    -- case where the email is release-list-only. Written as 'pending' before
    -- the send so the row id can be baked into that recipient's tracking and
    -- unsubscribe links, then updated with the outcome. variant is the A/B
    -- send-day cohort — see lib/newsletter.js variantForEmail(), which
    -- assigns it deterministically so a given address always lands in the
    -- same arm.
    CREATE TABLE IF NOT EXISTS newsletter_sends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_key TEXT NOT NULL,
      week_of TEXT NOT NULL,
      email TEXT NOT NULL,
      variant TEXT NOT NULL CHECK (variant IN ('sunday', 'monday')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'complained')),
      resend_email_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      opened_at TEXT,
      clicked_at TEXT,
      click_count INTEGER NOT NULL DEFAULT 0,
      UNIQUE (issue_key, email)
    );
    CREATE INDEX IF NOT EXISTS idx_newsletter_sends_issue ON newsletter_sends (issue_key);
    CREATE INDEX IF NOT EXISTS idx_newsletter_sends_email ON newsletter_sends (email);

    -- Suppression list. Checked by every recipient query below, so an
    -- unsubscribe survives the address being re-collected later by any of
    -- the signup forms that feed the list.
    CREATE TABLE IF NOT EXISTS newsletter_unsubscribes (
      email TEXT PRIMARY KEY,
      source TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  // Tracks the automatic welcome email sent on discount-banner signup.
  // resend_email_id lets the /api/webhooks/resend bounce handler find the
  // right row without matching on email address alone (a bounce webhook
  // arrives with only the Resend-assigned email ID, not our row's PK).
  addColumnIfMissing('discount_signups', 'welcome_email_sent_at', 'TEXT');
  addColumnIfMissing('discount_signups', 'welcome_email_status', `TEXT CHECK (welcome_email_status IN ('sent', 'bounced'))`);
  addColumnIfMissing('discount_signups', 'resend_email_id', 'TEXT');
  // Which form the address came from — 'banner' (the homepage seller-fee
  // promo) or 'newsletter' (/newsletter.html). Both feed the same weekly
  // send; the source only picks which welcome email goes out. Rows created
  // before this column existed are banner signups, hence the default.
  addColumnIfMissing('discount_signups', 'source', `TEXT NOT NULL DEFAULT 'banner'`);

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

  // Upsert + RETURNING in one statement: the incremented total comes back
  // from the same write, so a concurrent request can't read a stale count
  // between the UPDATE and a follow-up SELECT.
  const incrementPageView = db.prepare(`
    INSERT INTO page_views (path, views) VALUES (@path, 1)
    ON CONFLICT(path) DO UPDATE SET views = views + 1
    RETURNING views
  `);

  const getPageViews = db.prepare(`SELECT views FROM page_views WHERE path = ?`);

  // Absolute set rather than increment — used only to seed the counter with
  // real history (see app/api/admin/page-views/seed/route.js).
  const setPageViews = db.prepare(`
    INSERT INTO page_views (path, views) VALUES (@path, @views)
    ON CONFLICT(path) DO UPDATE SET views = @views
    RETURNING views
  `);

  const getStatsSummaryState = db.prepare(`SELECT last_run_at AS lastRunAt FROM stats_summary_state WHERE id = 1`);

  const setStatsSummaryState = db.prepare(`
    INSERT INTO stats_summary_state (id, last_run_at) VALUES (1, @lastRunAt)
    ON CONFLICT (id) DO UPDATE SET last_run_at = excluded.last_run_at
  `);

  // --- Discount banner email signups ---

  const insertDiscountSignup = db.prepare(`
    INSERT OR IGNORE INTO discount_signups (email, source) VALUES (@email, @source)
  `);

  // --- Agent-authored blog posts ---

  const insertBlogPost = db.prepare(`
    INSERT INTO blog_posts (slug, title, description, tagline, body_json, tweet, read_minutes, date_published)
    VALUES (@slug, @title, @description, @tagline, @bodyJson, @tweet, @readMinutes, @datePublished)
  `);

  const getBlogPostBySlug = db.prepare(`
    SELECT slug, title, description, tagline, body_json AS bodyJson, tweet,
           read_minutes AS readMinutes, date_published AS datePublished
    FROM blog_posts WHERE slug = ?
  `);

  // Newest first, matching the hand-written BLOG_POSTS ordering so the index
  // page can merge the two lists without re-sorting each source separately.
  const listBlogPosts = db.prepare(`
    SELECT slug, title, description, date_published AS datePublished
    FROM blog_posts ORDER BY date_published DESC, id DESC
  `);

  const getBlogAgentState = db.prepare(`SELECT last_run_at AS lastRunAt FROM blog_agent_state WHERE id = 1`);

  const setBlogAgentState = db.prepare(`
    INSERT INTO blog_agent_state (id, last_run_at) VALUES (1, @lastRunAt)
    ON CONFLICT (id) DO UPDATE SET last_run_at = excluded.last_run_at
  `);

  const getDiscountSignupByEmail = db.prepare(`
    SELECT id, email, source, created_at AS createdAt, welcome_email_sent_at AS welcomeEmailSentAt,
           welcome_email_status AS welcomeEmailStatus, resend_email_id AS resendEmailId
    FROM discount_signups WHERE email = ?
  `);

  const listDiscountSignupsForAdmin = db.prepare(`
    SELECT id, email, source, created_at AS createdAt, welcome_email_sent_at AS welcomeEmailSentAt,
           welcome_email_status AS welcomeEmailStatus, resend_email_id AS resendEmailId
    FROM discount_signups
    ORDER BY created_at DESC
  `);

  const markWelcomeEmailSent = db.prepare(`
    UPDATE discount_signups
    SET welcome_email_sent_at = CURRENT_TIMESTAMP, welcome_email_status = 'sent', resend_email_id = @resendEmailId
    WHERE id = @id
  `);

  // Matched by resend_email_id, not by row id — the bounce webhook only
  // knows the Resend-assigned email ID from the original send response.
  const markWelcomeEmailBouncedByResendId = db.prepare(`
    UPDATE discount_signups SET welcome_email_status = 'bounced' WHERE resend_email_id = ?
  `);

  // --- Weekly newsletter ---

  // The week's issue is the blog post the agent published for that week —
  // there's no separate issue record. This finds it: the newest post dated
  // on or after the week's Sunday, with its full body.
  const getLatestBlogPostSince = db.prepare(`
    SELECT slug, title, description, tagline, body_json AS bodyJson, tweet,
           read_minutes AS readMinutes, date_published AS datePublished
    FROM blog_posts
    WHERE date_published >= ?
    ORDER BY date_published DESC, id DESC
    LIMIT 1
  `);

  const insertNewsletterSend = db.prepare(`
    INSERT INTO newsletter_sends (issue_key, week_of, email, variant)
    VALUES (@issueKey, @weekOf, @email, @variant)
    RETURNING id
  `);

  const getNewsletterSendById = db.prepare(`
    SELECT id, issue_key AS issueKey, week_of AS weekOf, email, variant, status,
           resend_email_id AS resendEmailId, sent_at AS sentAt, opened_at AS openedAt,
           clicked_at AS clickedAt, click_count AS clickCount
    FROM newsletter_sends WHERE id = ?
  `);

  const getNewsletterSendByIssueAndEmail = db.prepare(`
    SELECT id, issue_key AS issueKey, email, variant, status FROM newsletter_sends
    WHERE issue_key = @issueKey AND email = @email
  `);

  const markNewsletterSendResult = db.prepare(`
    UPDATE newsletter_sends
    SET status = @status, resend_email_id = @resendEmailId, error = @error,
        sent_at = CASE WHEN @status = 'sent' THEN CURRENT_TIMESTAMP ELSE sent_at END
    WHERE id = @id
  `);

  // COALESCE keeps the FIRST open/click timestamp — the rates in the A/B
  // report count unique recipients, while click_count keeps the raw total.
  const markNewsletterOpened = db.prepare(`
    UPDATE newsletter_sends SET opened_at = COALESCE(opened_at, CURRENT_TIMESTAMP) WHERE id = ?
  `);

  const markNewsletterClicked = db.prepare(`
    UPDATE newsletter_sends
    SET clicked_at = COALESCE(clicked_at, CURRENT_TIMESTAMP), click_count = click_count + 1
    WHERE id = ?
  `);

  // Matched on the Resend-assigned email ID, which is all a delivery-event
  // webhook carries — the same pattern as the discount-signup bounce path.
  const getNewsletterSendByResendId = db.prepare(`
    SELECT id, issue_key AS issueKey, email, variant, status FROM newsletter_sends WHERE resend_email_id = ?
  `);

  const markNewsletterSendStatusByResendId = db.prepare(`
    UPDATE newsletter_sends SET status = @status WHERE resend_email_id = @resendEmailId
  `);

  const countNewsletterSendsForIssueVariant = db.prepare(`
    SELECT COUNT(*) AS c FROM newsletter_sends WHERE issue_key = @issueKey AND variant = @variant
  `);

  // The A/B result itself: one row per (issue, variant) with the unique
  // open/click counts the report turns into rates.
  // The A/B result itself: one row per (issue, variant) with the unique
  // open/click counts the report turns into rates. Reads only from
  // newsletter_sends — a post the agent later edits or renames can't
  // retroactively change what was measured.
  const newsletterStatsByIssueVariant = db.prepare(`
    SELECT issue_key AS issueKey, week_of AS weekOf, variant,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status IN ('bounced', 'complained') THEN 1 ELSE 0 END) AS bounced,
           SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
           SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked,
           SUM(click_count) AS clickCount
    FROM newsletter_sends
    GROUP BY issue_key, variant
    ORDER BY week_of DESC, variant
  `);

  const insertNewsletterUnsubscribe = db.prepare(`
    INSERT OR IGNORE INTO newsletter_unsubscribes (email, source) VALUES (@email, @source)
  `);

  const countNewsletterUnsubscribes = db.prepare(`SELECT COUNT(*) AS c FROM newsletter_unsubscribes`);

  const isNewsletterUnsubscribed = db.prepare(`SELECT 1 AS x FROM newsletter_unsubscribes WHERE email = ?`);

  // Two recipient queries, selected by NEWSLETTER_AUDIENCE (see
  // lib/newsletter.js). 'all' (the default) is everyone who has given us an
  // email address: the banner and /newsletter.html signup forms, plus anyone
  // who registered interest in a release or a marketplace listing — the
  // registration form says the address gets the weekly roundup, and every
  // issue carries a one-click unsubscribe. 'signups' narrows it back to just
  // the two signup forms. Both suppress unsubscribes, hard bounces, and spam
  // complaints.
  //
  // @joinedBefore is the issue's week-of date (the Sunday). An address only
  // becomes eligible for issues dated after the week it was collected, so
  // nobody gets a roundup the same week they signed up — their first one is
  // the following week's. created_at is 'YYYY-MM-DD HH:MM:SS' in UTC, so a
  // plain string comparison against a 'YYYY-MM-DD' cutoff is a date
  // comparison; the few UTC hours that fall on the previous ET evening just
  // wait one more week, which is the safe direction.
  const NEWSLETTER_SUPPRESSION = `
    email NOT IN (SELECT email FROM newsletter_unsubscribes)
    AND email NOT IN (SELECT email FROM newsletter_sends WHERE status IN ('bounced', 'complained'))
  `;

  const listNewsletterRecipientsSignups = db.prepare(`
    SELECT email FROM (
      SELECT LOWER(email) AS email, created_at AS joinedAt FROM discount_signups
      WHERE welcome_email_status IS NULL OR welcome_email_status <> 'bounced'
    )
    WHERE ${NEWSLETTER_SUPPRESSION}
    GROUP BY email
    HAVING MIN(joinedAt) < @joinedBefore
    ORDER BY email
  `);

  const listNewsletterRecipientsAll = db.prepare(`
    SELECT email FROM (
      SELECT LOWER(email) AS email, created_at AS joinedAt FROM discount_signups
      WHERE welcome_email_status IS NULL OR welcome_email_status <> 'bounced'
      UNION ALL
      SELECT LOWER(contact_value) AS email, created_at AS joinedAt FROM interests
      WHERE contact_type = 'email' AND cancelled_at IS NULL
      UNION ALL
      SELECT LOWER(contact_value) AS email, created_at AS joinedAt FROM listing_interests
      WHERE contact_type = 'email' AND cancelled_at IS NULL
    )
    WHERE ${NEWSLETTER_SUPPRESSION}
    GROUP BY email
    HAVING MIN(joinedAt) < @joinedBefore
    ORDER BY email
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
           outcome, outcome_notified_at AS outcomeNotifiedAt, email_sent_at AS emailSentAt
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
    incrementPageView,
    getPageViews,
    setPageViews,
    insertDiscountSignup,
    insertBlogPost,
    getBlogPostBySlug,
    listBlogPosts,
    getBlogAgentState,
    setBlogAgentState,
    getDiscountSignupByEmail,
    listDiscountSignupsForAdmin,
    markWelcomeEmailSent,
    markWelcomeEmailBouncedByResendId,
    getLatestBlogPostSince,
    insertNewsletterSend,
    getNewsletterSendById,
    getNewsletterSendByIssueAndEmail,
    getNewsletterSendByResendId,
    markNewsletterSendResult,
    markNewsletterOpened,
    markNewsletterClicked,
    markNewsletterSendStatusByResendId,
    countNewsletterSendsForIssueVariant,
    newsletterStatsByIssueVariant,
    insertNewsletterUnsubscribe,
    countNewsletterUnsubscribes,
    isNewsletterUnsubscribed,
    listNewsletterRecipientsSignups,
    listNewsletterRecipientsAll,
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
  'countListingInterestsSince', 'getStatsSummaryState', 'setStatsSummaryState',
  'incrementPageView', 'getPageViews', 'setPageViews', 'insertDiscountSignup',
  'insertBlogPost', 'getBlogPostBySlug', 'listBlogPosts', 'getBlogAgentState', 'setBlogAgentState',
  'getDiscountSignupByEmail', 'listDiscountSignupsForAdmin', 'markWelcomeEmailSent', 'markWelcomeEmailBouncedByResendId',
  'getLatestBlogPostSince', 'insertNewsletterSend',
  'getNewsletterSendById', 'getNewsletterSendByIssueAndEmail', 'getNewsletterSendByResendId', 'markNewsletterSendResult', 'markNewsletterOpened',
  'markNewsletterClicked', 'markNewsletterSendStatusByResendId', 'countNewsletterSendsForIssueVariant',
  'newsletterStatsByIssueVariant', 'insertNewsletterUnsubscribe', 'countNewsletterUnsubscribes',
  'isNewsletterUnsubscribed', 'listNewsletterRecipientsSignups', 'listNewsletterRecipientsAll',
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
