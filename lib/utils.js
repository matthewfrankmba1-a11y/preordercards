// Shared helpers that were previously copy-pasted identically across
// server.js, sellerAuth.js, and marketplace.js.

// Local part: standard unquoted-atom characters. Domain: dot-separated
// labels of alphanumerics/hyphens only (no bare parens/question marks etc,
// unlike the old [^\s@]+ local/domain check, which let garbage like
// "u@))(.ci" validate as long as it had an @ and a dot).
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (hasPlus ? '+' : '') + digits;
}

// Render (and most PaaS hosts) put the app behind a reverse proxy, so the
// real client IP is in x-forwarded-for, not any single fixed header.
function getClientIp(request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// Simple in-memory rate limiter: N requests per window per IP. Each call
// site gets its own independent Map (own bucket of hits) — this factory
// shares the logic, not the state, so separate route groups (auth attempts,
// interest registrations, etc.) stay independently rate-limited exactly as
// before. Returns {allowed, message} rather than acting as Express-style
// middleware, since Route Handlers call this explicitly at the top instead
// of chaining middleware.
function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 20, message } = {}) {
  const hitsByIp = new Map();
  return function checkRateLimit(request) {
    const ip = getClientIp(request);
    const now = Date.now();
    const hits = (hitsByIp.get(ip) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return { allowed: false, message: message || 'Too many requests from this address. Try again later.' };
    }
    hits.push(now);
    hitsByIp.set(ip, hits);
    return { allowed: true };
  };
}

// Guards every shared-secret admin route (as opposed to marketplace's
// requireAdmin, which checks an authenticated seller session's is_admin
// flag instead — the two are not interchangeable).
function checkAdminSecret(request) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  return Boolean(ADMIN_SECRET) && request.headers.get('x-admin-secret') === ADMIN_SECRET;
}

// Generic dev/QA domains and a bounded "test"/"bot"/"qa" keyword (must sit
// between separators, not just be a substring — so "testyest@jsjd.com"
// isn't flagged) catch the routine noise from manual/bot smoke-testing.
// ADMIN_REPORT_TEST_CONTACTS supplements this with exact matches (e.g. the
// site owner's own addresses used for QA) without hardcoding personal
// emails into the repo.
const TEST_CONTACT_DOMAIN_RE = /@(example\.(com|org|net)|test\.com)$/i;
const TEST_CONTACT_KEYWORD_RE = /(^|[._-])(test|bot|qa)([._-]|@)/i;

function isLikelyTestContact(contactValue) {
  const value = String(contactValue || '').trim();
  if (!value) return false;
  if (TEST_CONTACT_DOMAIN_RE.test(value) || TEST_CONTACT_KEYWORD_RE.test(value)) return true;

  const exactList = (process.env.ADMIN_REPORT_TEST_CONTACTS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return exactList.includes(value.toLowerCase());
}

const SPORT_EMOJI = {
  Baseball: '⚾',
  Basketball: '🏀',
  Football: '🏈',
  MMA: '🥊',
  Soccer: '⚽',
  Entertainment: '🎬',
};

module.exports = { EMAIL_RE, normalizePhone, createRateLimiter, checkAdminSecret, isLikelyTestContact, SPORT_EMOJI };
