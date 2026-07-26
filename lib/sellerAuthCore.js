const crypto = require('crypto');
// Not destructured — db.js lazily opens the database on first property
// access, deferred until these functions actually run (never at module
// top level, which Next's build step would otherwise trigger).
const db = require('./db');
const { createRateLimiter } = require('./utils');
const { sendEmail, isEmailConfigured } = require('./email');

const SESSION_COOKIE = 'seller_session';
const SESSION_DAYS = 30;
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
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

// Sets the session cookie on a NextResponse (replaces the hand-rolled
// serializeCookie header string — same cookie name/options/expiry).
function issueSessionCookie(response, sellerId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.insertSession.run({ token, sellerId, expiresAt: expiresAt.toISOString() });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(request, response) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) db.deleteSession.run(token);
  response.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
}

// Replaces the old requireSellerAuth Express middleware. Distinguishes "no
// cookie at all" from "cookie present but expired/invalid" since the two
// carry different error messages in the original API contract.
function requireSeller(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { error: { status: 401, message: 'Not logged in.' } };
  const session = db.getSession.get(token);
  if (!session || new Date(session.expiresAt) < new Date()) {
    return { error: { status: 401, message: 'Session expired. Please log in again.' } };
  }
  return {
    seller: {
      id: session.sellerId,
      displayName: session.displayName,
      isAdmin: Boolean(session.isAdmin),
      email: session.email,
      profileComplete: Boolean(session.profileCompletedAt),
    },
  };
}

function buildTrustedSellerEmail(keyCode, expiresAt) {
  const expiresLocal = expiresAt.toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/New_York',
  });
  return [
    'Welcome to PreorderCards! The Newest way to buy/sell the most sought after card releases.',
    '',
    "You've been invited to join as a trusted seller. Congratulations!",
    '',
    `Your invite key (valid 24 hours, expires ${expiresLocal} ET): ${keyCode}`,
    '',
    `Log in here: ${SITE_URL}/seller.html (bookmark this, it's not on the site anywhere)`,
    `Have questions? Check our FAQ: ${SITE_URL}/#faq`,
    '',
    'Just reply to this email any time if you need help. As part of this program, we welcome any and all feedback.',
    '',
    '— PreorderCards Admin',
  ].join('\n');
}

// Shared by /forgot-password (identified by key) and /recover-account
// (identified by name + phone, for sellers who've lost their key entirely).
async function issuePasswordResetEmail(seller, noEmailMessage) {
  if (!seller.email) {
    return { ok: false, status: 400, error: noEmailMessage };
  }
  if (!isEmailConfigured()) {
    return { ok: false, status: 500, error: 'Email sending is not configured.' };
  }

  db.deletePasswordResetsBySeller.run(seller.id);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  db.insertPasswordReset.run({ token, sellerId: seller.id, expiresAt: expiresAt.toISOString() });

  const resetUrl = `${SITE_URL}/reset-password.html?token=${token}`;
  const result = await sendEmail({
    to: seller.email,
    subject: 'Reset your PreorderCards seller password',
    text: `Someone requested a password reset for your PreorderCards seller account.\n\nReset your password here (this link expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, you can ignore this email — your password won't change.`,
  });
  if (!result.ok) {
    return { ok: false, status: 502, error: 'Failed to send the reset email. Try again later.' };
  }
  return { ok: true };
}

// Login requires key + password, so just resetting the password isn't
// enough for someone who's lost the key itself — this emails the key
// back to them (plus a reset link, in case they want a new password too).
async function issueAccountRecoveryEmail(seller) {
  if (!seller.email) {
    return { ok: false, status: 400, error: 'This account has no alert email on file. Contact admin@preordercards.com to recover your account.' };
  }
  if (!isEmailConfigured()) {
    return { ok: false, status: 500, error: 'Email sending is not configured.' };
  }

  db.deletePasswordResetsBySeller.run(seller.id);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  db.insertPasswordReset.run({ token, sellerId: seller.id, expiresAt: expiresAt.toISOString() });
  const resetUrl = `${SITE_URL}/reset-password.html?token=${token}`;

  const result = await sendEmail({
    to: seller.email,
    subject: 'Your PreorderCards account recovery',
    text: `Someone requested account recovery for your PreorderCards seller account using your name and phone number.\n\nYour invite key: ${seller.invite_key}\n\nIf you'd also like to set a new password, use this link (expires in 1 hour): ${resetUrl}\n\nIf you didn't request this, you can ignore this email — nothing has changed on your account.`,
  });
  if (!result.ok) {
    return { ok: false, status: 502, error: 'Failed to send the recovery email. Try again later.' };
  }
  return { ok: true };
}

// Own bucket, independent from the public-route and marketplace limiters.
const sellerAuthRateLimit = createRateLimiter({ message: 'Too many attempts from this address. Try again later.' });

module.exports = {
  SESSION_COOKIE,
  SITE_URL,
  generateInviteKeyCode,
  generateSellerName,
  issueSessionCookie,
  clearSessionCookie,
  requireSeller,
  buildTrustedSellerEmail,
  issuePasswordResetEmail,
  issueAccountRecoveryEmail,
  sellerAuthRateLimit,
};
