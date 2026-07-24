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
} = require('./db');

const SESSION_COOKIE = 'seller_session';
const SESSION_DAYS = 30;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    insertInviteKey.run({ keyCode: key, keyType: 'seller' });
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
  insertInviteKey.run({ keyCode: key, keyType: 'admin' });
  res.json({ key });
});

module.exports = { router, requireSellerAuth };
