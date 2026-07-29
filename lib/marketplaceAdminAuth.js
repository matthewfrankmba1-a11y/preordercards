const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
// Not destructured — db.js lazily opens the database on first property
// access, deferred until these functions actually run (never at module
// top level, which Next's build step would otherwise trigger).
const db = require('./db');
const { createRateLimiter } = require('./utils');

const SESSION_COOKIE = 'mkt_admin_session';
const SESSION_HOURS = 12;
const TOTP_ISSUER = 'PreorderCards';
const TOTP_LABEL = 'PreorderCards Marketplace Admin';

// Separate bucket from every other rate limiter — this one guards a 6-digit
// TOTP code, which is far more brute-forceable than a random token.
const totpLoginRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many code attempts. Try again in a few minutes.',
});

function getEnrollmentStatus() {
  const row = db.getAdminTotp.get();
  return { enrolled: Boolean(row && row.enrolledAt) };
}

// Generates a fresh secret and stores it un-enrolled (enrolled_at NULL) —
// it can't be used to log in until confirmEnrollment() verifies a real
// code against it. Called from the setup step, gated by ADMIN_SECRET.
function beginEnrollment() {
  const secret = speakeasy.generateSecret({ length: 20 });
  db.setAdminTotpSecret.run({ secret: secret.base32 });
  const otpauthUrl = speakeasy.otpauthURL({
    secret: secret.base32,
    label: encodeURIComponent(TOTP_LABEL),
    issuer: encodeURIComponent(TOTP_ISSUER),
    encoding: 'base32',
  });
  return { secret: secret.base32, otpauthUrl };
}

async function beginEnrollmentWithQr() {
  const { secret, otpauthUrl } = beginEnrollment();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  return { secret, otpauthUrl, qrDataUrl };
}

// Verifies a code against whatever secret is currently pending (enrolled or
// not) — used both to confirm first-time setup and to re-verify after a
// reset. window: 1 tolerates ±30s of clock drift.
function verifyCodeAgainstStoredSecret(code) {
  const row = db.getAdminTotp.get();
  if (!row) return false;
  return speakeasy.totp.verify({ secret: row.secret, encoding: 'base32', token: String(code || ''), window: 1 });
}

function confirmEnrollment(code) {
  if (!verifyCodeAgainstStoredSecret(code)) return false;
  db.markAdminTotpEnrolled.run();
  return true;
}

// Login only succeeds against a *confirmed* secret — a pending (unconfirmed)
// enrollment can't be used to unlock the page.
function verifyLoginCode(code) {
  const row = db.getAdminTotp.get();
  if (!row || !row.enrolledAt) return false;
  return speakeasy.totp.verify({ secret: row.secret, encoding: 'base32', token: String(code || ''), window: 1 });
}

function issueAdminSession(response) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  db.insertAdminMarketplaceSession.run({ token, expiresAt: expiresAt.toISOString() });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

function clearAdminSession(request, response) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (token) db.deleteAdminMarketplaceSession.run(token);
  response.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
}

function requireMarketplaceAdmin(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { error: { status: 401, message: 'Not logged in.' } };
  const session = db.getAdminMarketplaceSession.get(token);
  if (!session || new Date(session.expiresAt) < new Date()) {
    return { error: { status: 401, message: 'Session expired. Please log in again.' } };
  }
  return { ok: true };
}

module.exports = {
  SESSION_COOKIE,
  totpLoginRateLimit,
  getEnrollmentStatus,
  beginEnrollmentWithQr,
  confirmEnrollment,
  verifyLoginCode,
  issueAdminSession,
  clearAdminSession,
  requireMarketplaceAdmin,
};
