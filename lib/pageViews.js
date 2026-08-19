// Not destructured — db.js lazily opens the database on first property
// access, deferred until these functions actually run (never at module
// top level, which Next's build step would otherwise trigger).
const db = require('./db');

// The homepage is the only counted path today, but the table is keyed by
// path so adding others is a one-line change rather than a migration.
const HOME_PATH = '/';

// Counting happens from the client after hydration (POST /api/page-view)
// rather than during the server render. Rendering the homepage is not the
// same as a person looking at it: Next prefetches route payloads on link
// hover, and every RSC/HEAD request would otherwise land in the total.
// Requiring JS execution also drops the large majority of crawlers for
// free — the ones left are handled by the user-agent check below.
const BOT_UA_RE = /bot|crawl|spider|slurp|headless|phantom|puppeteer|playwright|lighthouse|pingdom|uptime|curl|wget|python-requests|scrapy|facebookexternalhit|preview/i;

function isLikelyBot(userAgent) {
  if (!userAgent) return true; // a real browser always sends one
  return BOT_UA_RE.test(userAgent);
}

// Returns the new total so the caller can show a count that includes the
// visit just recorded, rather than one that's always one behind.
function recordHomepageView() {
  const row = db.incrementPageView.get({ path: HOME_PATH });
  return row ? row.views : null;
}

// Read-only, for the server render. Returns 0 before the first view is
// ever recorded (no row yet) so the footer has a real number to show
// instead of flashing a placeholder.
function getHomepageViews() {
  const row = db.getPageViews.get(HOME_PATH);
  return row ? row.views : 0;
}

// Absolute set, for seeding only — normal traffic goes through
// recordHomepageView above.
function setHomepageViews(views) {
  const row = db.setPageViews.get({ path: HOME_PATH, views });
  return row ? row.views : null;
}

module.exports = { HOME_PATH, isLikelyBot, recordHomepageView, getHomepageViews, setHomepageViews };
