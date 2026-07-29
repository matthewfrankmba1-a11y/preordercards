// Single source of truth for the canonical origin. Kept in one place so the
// sitemap, robots.txt, and the metadataBase in app/layout.js can never drift
// apart — a mismatch between them is the classic way a canonical tag ends up
// pointing at a hostname Google then treats as a duplicate of the real one.
const SITE_URL = 'https://preordercards.com';

module.exports = { SITE_URL };
