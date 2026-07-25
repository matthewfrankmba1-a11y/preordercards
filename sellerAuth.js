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
  updateSellerPassword,
  updateSellerProfile,
  findSellerByNamePhone,
  insertPasswordReset,
  getPasswordReset,
  deletePasswordResetsBySeller,
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

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (hasPlus ? '+' : '') + digits;
}

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
    profileComplete: Boolean(session.profileCompletedAt),
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
  res.status(201).json({ success: true, displayName, isAdmin, email: normalizedEmail, profileComplete: false });
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
    profileComplete: Boolean(seller.profile_completed_at),
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
    profileComplete: req.seller.profileComplete,
  });
});

// Required before a seller can create any listings: full name, phone, and
// at least one payout method (Venmo, CashApp, or Zelle). Also doubles as
// the identifying info used by /recover-account if they lose their key.
router.post('/profile', requireSellerAuth, (req, res) => {
  const { fullName, phone, venmo, cashapp, zelle } = req.body || {};

  if (typeof fullName !== 'string' || !fullName.trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (fullName.trim().length > 200) {
    return res.status(400).json({ error: 'Full name is too long.' });
  }
  if (typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Enter a valid phone number.' });
  }

  const trimmedVenmo = venmo ? String(venmo).trim() : '';
  const trimmedCashapp = cashapp ? String(cashapp).trim() : '';
  const trimmedZelle = zelle ? String(zelle).trim() : '';
  if (!trimmedVenmo && !trimmedCashapp && !trimmedZelle) {
    return res.status(400).json({ error: 'Provide at least one of Venmo, CashApp, or Zelle.' });
  }
  for (const [label, value] of [['Venmo', trimmedVenmo], ['CashApp', trimmedCashapp], ['Zelle', trimmedZelle]]) {
    if (value.length > 100) {
      return res.status(400).json({ error: `${label} is too long (max 100 characters).` });
    }
  }

  updateSellerProfile.run({
    sellerId: req.seller.id,
    fullName: fullName.trim(),
    phone: normalizedPhone,
    venmo: trimmedVenmo || null,
    cashapp: trimmedCashapp || null,
    zelle: trimmedZelle || null,
  });

  res.json({ success: true, profileComplete: true });
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

// Shared by /forgot-password (identified by key) and /recover-account
// (identified by name + phone, for sellers who've lost their key entirely).
async function issuePasswordResetEmail(seller, noEmailMessage) {
  if (!seller.email) {
    return { ok: false, status: 400, error: noEmailMessage };
  }
  if (!RESEND_API_KEY) {
    return { ok: false, status: 500, error: 'Email sending is not configured.' };
  }

  deletePasswordResetsBySeller.run(seller.id);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  insertPasswordReset.run({ token, sellerId: seller.id, expiresAt: expiresAt.toISOString() });

  const resetUrl = `${SITE_URL}/reset-password.html?token=${token}`;
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [seller.email],
        subject: 'Reset your PreorderCards seller password',
        text: `Someone requested a password reset for your PreorderCards seller account.\n\nReset your password here (this link expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
      }),
    });
    if (!emailRes.ok) {
      console.error('Password reset email failed:', emailRes.status, await emailRes.text());
      return { ok: false, status: 502, error: 'Failed to send the reset email. Try again later.' };
    }
  } catch (err) {
    console.error('Password reset email failed:', err.message);
    return { ok: false, status: 502, error: 'Failed to send the reset email. Try again later.' };
  }
  return { ok: true };
}

// Requests a password reset link be emailed to the alert email registered
// on this key's account. There's no username/email login — the invite key
// is the account identifier, so that's what's submitted here.
router.post('/forgot-password', rateLimit, async (req, res) => {
  const { key } = req.body || {};
  if (typeof key !== 'string' || !key.trim()) {
    return res.status(400).json({ error: 'Enter your invite key.' });
  }
  const seller = getSellerByInviteKey.get(key.trim().toUpperCase());
  if (!seller) {
    return res.status(400).json({ error: 'No account found for that key.' });
  }
  const result = await issuePasswordResetEmail(
    seller,
    'This account has no alert email on file. Contact admin@preordercards.com to reset your password.'
  );
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ success: true, message: 'Reset link sent to the email on file.' });
});

// Login requires key + password, so just resetting the password isn't
// enough for someone who's lost the key itself — this emails the key
// back to them (plus a reset link, in case they want a new password too).
async function issueAccountRecoveryEmail(seller) {
  if (!seller.email) {
    return { ok: false, status: 400, error: 'This account has no alert email on file. Contact admin@preordercards.com to recover your account.' };
  }
  if (!RESEND_API_KEY) {
    return { ok: false, status: 500, error: 'Email sending is not configured.' };
  }

  deletePasswordResetsBySeller.run(seller.id);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  insertPasswordReset.run({ token, sellerId: seller.id, expiresAt: expiresAt.toISOString() });
  const resetUrl = `${SITE_URL}/reset-password.html?token=${token}`;

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [seller.email],
        subject: 'Your PreorderCards account recovery',
        text: `Someone requested account recovery for your PreorderCards seller account using your name and phone number.\n\nYour invite key: ${seller.invite_key}\n\nIf you'd also like to set a new password, use this link (expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, you can ignore this email — nothing has changed on your account.`,
      }),
    });
    if (!emailRes.ok) {
      console.error('Account recovery email failed:', emailRes.status, await emailRes.text());
      return { ok: false, status: 502, error: 'Failed to send the recovery email. Try again later.' };
    }
  } catch (err) {
    console.error('Account recovery email failed:', err.message);
    return { ok: false, status: 502, error: 'Failed to send the recovery email. Try again later.' };
  }
  return { ok: true };
}

// For sellers who've lost their invite key entirely — identifies the
// account by the full name + phone number collected on their required
// profile instead of the key, then emails the key back to them.
router.post('/recover-account', rateLimit, async (req, res) => {
  const { fullName, phone } = req.body || {};
  if (typeof fullName !== 'string' || !fullName.trim() || typeof phone !== 'string' || !phone.trim()) {
    return res.status(400).json({ error: 'Enter your full name and phone number.' });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Enter a valid phone number.' });
  }
  const seller = findSellerByNamePhone.get({ fullName: fullName.trim(), phone: normalizedPhone });
  if (!seller) {
    return res.status(400).json({ error: 'No account found matching that name and phone number.' });
  }
  const result = await issueAccountRecoveryEmail(seller);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ success: true, message: 'Your invite key and a reset link have been sent to the email on file.' });
});

// Completes a password reset using the token emailed by /forgot-password.
// Also invalidates the account's active sessions, forcing a fresh login.
router.post('/reset-password', rateLimit, (req, res) => {
  const { token, newPassword } = req.body || {};
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Missing reset token.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const resetRow = getPasswordReset.get(token);
  if (!resetRow || new Date(resetRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateSellerPassword.run({ sellerId: resetRow.seller_id, passwordHash });
  deletePasswordResetsBySeller.run(resetRow.seller_id);
  deleteSessionsBySeller.run(resetRow.seller_id);

  res.json({ success: true });
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
    'Welcome to PreorderCards!',
    '',
    "You've been invited to join as a trusted seller.",
    '',
    `Your invite key (valid 24 hours, expires ${expiresLocal} ET): ${keyCode}`,
    '',
    `Log in here: ${SITE_URL}/seller.html`,
    `Have questions? Check our FAQ: ${SITE_URL}/#faq`,
    '',
    'Just reply to this email any time if you need help.',
    '',
    '— PreorderCards',
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
