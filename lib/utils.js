// Shared helpers that were previously copy-pasted identically across
// server.js, sellerAuth.js, and marketplace.js.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (hasPlus ? '+' : '') + digits;
}

// Simple in-memory rate limiter: N requests per window per IP. Each call
// site gets its own independent Map (own bucket of hits) — this factory
// shares the logic, not the state, so separate route groups (auth attempts,
// interest registrations, etc.) stay independently rate-limited exactly as
// before, just without three copies of the same 12 lines.
function createRateLimiter({ windowMs = 10 * 60 * 1000, max = 20, message } = {}) {
  const hitsByIp = new Map();
  return function rateLimit(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    const hits = (hitsByIp.get(ip) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return res.status(429).json({ error: message || 'Too many requests from this address. Try again later.' });
    }
    hits.push(now);
    hitsByIp.set(ip, hits);
    next();
  };
}

// Express middleware guarding every shared-secret admin route (as opposed
// to marketplace.js's requireAdmin, which checks an authenticated seller
// session's is_admin flag instead — the two are not interchangeable).
const ADMIN_SECRET = process.env.ADMIN_SECRET;
function requireAdminSecret(req, res, next) {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  next();
}

const SPORT_EMOJI = {
  Baseball: '⚾',
  Basketball: '🏀',
  Football: '🏈',
  MMA: '🥊',
  Soccer: '⚽',
  Entertainment: '🎬',
};

module.exports = { EMAIL_RE, normalizePhone, createRateLimiter, requireAdminSecret, SPORT_EMOJI };
