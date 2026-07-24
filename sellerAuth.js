const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  getInviteKey,
  markInviteKeyUsed,
  insertSeller,
  getSellerByInviteKey,
  getSession,
  insertSession,
  deleteSession,
  insertInviteKey,
  countSuperKeys,
  updateSellerEmail,
  listInviteKeysWithAlias,
  countListingsBySeller,
  deleteListingInterestsBySeller,
  deleteListingsBySeller,
  deleteSessionsBySeller,
  deleteSellerById,
  deleteInviteKeyByCode,
} = require('./db');

const SESSION_COOKIE = 'seller_session';
const SESSION_DAYS = 30;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PreorderCards <admin@preordercards.com>';
const SITE_URL = process.env.SITE_URL || 'https://preordercards.com';

function generateInviteKeyCode() {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

const ADJECTIVES = [
  'Quiet', 'Swift', 'Silver', 'Golden', 'Bold', 'Lucky', 'Hidden', 'Rapid',
  'Steady', 'Clever', 'Amber', 'Crimson', 'Shadow', 'Northern', 'Lone', 'Vivid',
];
const NOUNS = [
  'Falcon', 'Otter', 'Panther', 'Hawk', 'Wolf', 'Fox', 'Raven', 'Tiger',
  'Eagle', 'Lynx', 'Bear', 'Cobra', 'Heron', 'Marlin', 'Osprey', 'Puma',
];

function generateSellerName() {
  const adj = ADJECTIVES[crypto.randomInt(ADJECTIVES.length)];
  const noun = NOUNS[crypto.randomInt(NOUNS.length)];
  const num = crypto.randomInt(100, 999);
  return `${adj}${noun}${num}`;
}

function serializeCookie(name, value, options = {}) {
  let str = `${name}=${encodeURIComponent(value)}`;
  if (options.maxAge !== undefined) str += `; Max-Age=${options.maxAge}`;
  if (options.expires) str += `; Expires=${options.expires.toUTCString()}`;
  str += `; Path=${options.path || '/'}`;
  if (options.httpOnly) str += '; HttpOnly';
  if (options.sameSite) str += `; SameSite=${options.sameSite}`;
  if (options.secure) str += '; Secure';
  return str;
}

function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  });
  return result;
}

function issueSession(res, sellerId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  insertSession.run({ token, sellerId, expiresAt: expiresAt.toISOString() });
  res.setHeader(
    'Set-Cookie',
    serializeCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
      expires: expiresAt,
    })
  );
}

function requireSellerAuth(req, res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: 'Not logged in.' });
  const session = getSession.get(token);
  if (!session || new Date(session.expiresAt) < new Date()) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  req.seller = {
    id: session.sellerId,
    displayName: session.displayName,
    isAdmin: Boolean(session.isAdmin),
    email: session.email,
  };
  next();
}

// Simple in-memory rate limiter for auth attempts, mirroring the pattern
// already used for /api/interest in server.js.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const hitsByIp = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const hits = (hitsByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many attempts from this address. Try again later.' });
  }
  hits.push(now);
  hitsByIp.set(ip, hits);
  next();
}

const router = express.Router();

router.post('/signup', rateLimit, (req, res) => {
  const { key, password, email } = req.body || {};
  if (typeof key !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Missing key or password.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  let normalizedEmail = null;
  if (email) {
    normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address, or leave it blank.' });
    }
  }

  const normalizedKey = key.trim().toUpperCase();
  const keyRow = getInviteKey.get(normalizedKey);
  if (!keyRow) return res.status(400).json({ error: 'Invalid invite key.' });
  if (keyRow.used) return res.status(400).json({ error: 'This invite key has already been used.' });
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This invite key has expired.' });
  }

  const isAdmin = keyRow.key_type === 'admin';
  const passwordHash = bcrypt.hashSync(password, 10);
  const displayName = generateSellerName();
  const result = insertSeller.run({
    inviteKey: normalizedKey,
    passwordHash,
    displayName,
    isAdmin: isAdmin ? 1 : 0,
    email: normalizedEmail,
  });
  markInviteKeyUsed.run({ sellerId: result.lastInsertRowid, keyCode: normalizedKey });

  issueSession(res, result.lastInsertRowid);
  res.status(201).json({ success: true, displayName, isAdmin, email: normalizedEmail });
});

router.post('/login', rateLimit, (req, res) => {
  const { key, password } = req.body || {};
  if (typeof key !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Missing key or password.' });
  }

  const seller = getSellerByInviteKey.get(key.trim().toUpperCase());
  if (!seller || !bcrypt.compareSync(password, seller.password_hash)) {
    return res.status(401).json({ error: 'Invalid key or password.' });
  }

  issueSession(res, seller.id);
  res.json({
    success: true,
    displayName: seller.display_name,
    isAdmin: Boolean(seller.is_admin),
    email: seller.email,
  });
});

router.post('/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) deleteSession.run(token);
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }));
  res.json({ success: true });
});

router.get('/me', requireSellerAuth, (req, res) => {
  res.json({
    sellerId: req.seller.id,
    displayName: req.seller.displayName,
    isAdmin: req.seller.isAdmin,
    email: req.seller.email,
  });
});

// Sets or updates the seller's alert email — login stays key + password
// always; this is purely a notification contact, not a credential.
router.post('/email', requireSellerAuth, (req, res) => {
  const { email } = req.body || {};
  let normalizedEmail = null;
  if (email) {
    normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address, or leave it blank to remove it.' });
    }
  }
  updateSellerEmail.run({ sellerId: req.seller.id, email: normalizedEmail });
  res.json({ success: true, email: normalizedEmail });
});

// Read-only listing of every invite key ever generated, plus the real alias
// (display_name) if it's been used to sign up — for admin record-keeping.
router.get('/admin/keys', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  res.json({ keys: listInviteKeysWithAlias.all() });
});

// Read-only: look up a key + its seller (if used) and their listing count,
// so the admin can decide what a revoke would affect before doing it.
router.get('/admin/lookup-key', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const keyCode = String(req.query.key || '').trim().toUpperCase();
  const keyRow = getInviteKey.get(keyCode);
  if (!keyRow) return res.status(404).json({ error: 'Key not found.' });

  const seller = keyRow.used_by_seller_id ? getSellerByInviteKey.get(keyCode) : null;
  res.json({
    keyCode,
    keyType: keyRow.key_type,
    used: Boolean(keyRow.used),
    alias: seller ? seller.display_name : null,
    listingCount: seller ? countListingsBySeller.get(seller.id).c : 0,
  });
});

// Permanently revokes a key: deletes the seller account it created (if any),
// their listings, listing interests, and sessions, then deletes the key
// itself. Irreversible — meant to be called after the admin has confirmed
// what it will affect via /admin/lookup-key.
router.post('/admin/revoke-key', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const keyCode = String(req.body?.keyCode || '').trim().toUpperCase();
  const keyRow = getInviteKey.get(keyCode);
  if (!keyRow) return res.status(404).json({ error: 'Key not found.' });

  const seller = keyRow.used_by_seller_id ? getSellerByInviteKey.get(keyCode) : null;
  let removedListings = 0;
  if (seller) {
    removedListings = countListingsBySeller.get(seller.id).c;
    deleteListingInterestsBySeller.run(seller.id);
    deleteListingsBySeller.run(seller.id);
    deleteSessionsBySeller.run(seller.id);
    deleteSellerById.run(seller.id);
  }
  deleteInviteKeyByCode.run(keyCode);

  res.json({ success: true, hadSeller: Boolean(seller), alias: seller ? seller.display_name : null, removedListings });
});

function buildTrustedSellerEmail(keyCode, expiresAt) {
  const expiresLocal = expiresAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  });
  return [
    "You've been personally invited to join a small, trusted group of sellers helping build the next frontier of online commerce for hard-to-obtain items — PreorderCards.",
    '',
    `YOUR INVITE KEY (valid 24 hours, expires ${expiresLocal} ET): ${keyCode}`,
    '',
    `Go to ${SITE_URL}/seller.html, click "Sign Up with Key," enter the key above, and choose a password. You'll be given a random, anonymous display name — no personal info is shown publicly. Please register before the key expires.`,
    '',
    'FEE STRUCTURE',
    '- 2.5% is deducted from your payout as the seller.',
    '- 2.5% is added to what the buyer pays.',
    '- A shipping-label fee also applies once per completed sale, on both sides: $6 for the first box, plus $1 for each additional box in the same sale (e.g. $8 for a 3-box order).',
    '',
    "WHAT'S REQUIRED TO LIST",
    '- Item must be factory sealed.',
    '- A description, optional SKU, and an optional stock-photo link (not a file upload).',
    '- Quantity available (1-10 units) and your price per unit.',
    '',
    'KEEPING PRODUCT INTEGRITY',
    'To protect buyers and preserve trust in every sale:',
    '- The original factory seal must remain fully intact — no peeling, resealing, or tampering.',
    '- The original tracking number / barcode from the retailer you purchased from must remain visible on the box.',
    '- When you ship to the end customer, your new shipping label may be applied over other existing barcodes, but it must never cover or obscure the original retailer tracking number.',
    '',
    'ESCROW & PAYOUTS',
    "For this first wave of transactions, funds are held in escrow until a sale is confirmed complete. Once you've shipped to the end customer, you'll need to provide the tracking information for that shipment so we can confirm you've held up your side of the sale. As trust is established, select sellers will move to automatic payouts.",
    '',
    'QUESTIONS',
    'Just reply to this email or reach out to admin@preordercards.com any time.',
    '',
    'Welcome aboard,',
    'PreorderCards',
  ].join('\n');
}

// Generates a 24-hour invite key and emails it to a prospective trusted
// seller with the full onboarding rundown (fees, listing rules, product
// integrity requirements, escrow terms). Protected by the same shared
// admin secret as the other key-management routes.
router.post('/admin/invite-trusted-seller', async (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Email sending is not configured.' });
  }

  const keyCode = generateInviteKeyCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  insertInviteKey.run({ keyCode, keyType: 'seller', expiresAt: expiresAt.toISOString() });

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: "You're invited: PreorderCards Trusted Seller Program",
        text: buildTrustedSellerEmail(keyCode, expiresAt),
      }),
    });
    if (!emailRes.ok) {
      const body = await emailRes.text();
      console.error('Trusted-seller invite email failed:', emailRes.status, body);
      return res.status(502).json({ error: 'Key was created, but the invite email failed to send.', keyCode, expiresAt: expiresAt.toISOString() });
    }
  } catch (err) {
    console.error('Trusted-seller invite email failed:', err.message);
    return res.status(502).json({ error: 'Key was created, but the invite email failed to send.', keyCode, expiresAt: expiresAt.toISOString() });
  }

  res.json({ success: true, keyCode, expiresAt: expiresAt.toISOString() });
});

// Lets new (regular) invite keys be minted against the live database without
// shell access to the host — protected by a shared secret, not seller auth.
router.post('/admin/generate-keys', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const count = Math.min(Math.max(Number(req.body?.count) || 10, 1), 100);
  const keys = [];
  for (let i = 0; i < count; i++) {
    const key = generateInviteKeyCode();
    insertInviteKey.run({ keyCode: key, keyType: 'seller', expiresAt: null });
    keys.push(key);
  }
  res.json({ keys });
});

// Mints the one-and-only super key that creates an admin seller account on
// signup. Rejects if a super key already exists — only one may ever be made.
router.post('/admin/generate-super-key', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  if (countSuperKeys.get().c > 0) {
    return res.status(409).json({ error: 'A super key has already been generated. Only one may ever exist.' });
  }
  const key = generateInviteKeyCode();
  insertInviteKey.run({ keyCode: key, keyType: 'admin', expiresAt: null });
  res.json({ key });
});

module.exports = { router, requireSellerAuth };
