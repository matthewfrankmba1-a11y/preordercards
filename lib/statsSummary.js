// Not destructured — db.js lazily opens the database on first property
// access, deferred until these functions actually run (never at module
// top level, which Next's build step would otherwise trigger).
const db = require('./db');
const { getDailyActiveUsers } = require('./ga4');

// Defaults to the main site webhook for now — swap STATS_SUMMARY_WEBHOOK_URL
// in the environment to point this at a different one later without a code change.
const WEBHOOK_URL = process.env.STATS_SUMMARY_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;

// Fires once daily, not on a fixed interval — was every 6 hours, which
// posted 4x/day and was too noisy. Checked via a 5-minute tick against wall
// -clock time (not a 24h setInterval) so it lands at a specific hour rather
// than drifting with every server restart/redeploy.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const TICK_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_HOUR = 9; // 9am
const TARGET_TIMEZONE = 'America/New_York';

function sqlToDate(sql) {
  return new Date(sql.replace(' ', 'T') + 'Z');
}

function hourInTZ(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(date));
}

function dateStringInTZ(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date); // YYYY-MM-DD
}

// SQLite's CURRENT_TIMESTAMP (used by every created_at column in this app)
// produces 'YYYY-MM-DD HH:MM:SS' in UTC — no 'T', no 'Z', no milliseconds.
// Comparing that against a real ISO string (toISOString()) breaks silently:
// ' ' < 'T' lexicographically, so `created_at > isoString` is always false
// regardless of actual time. Match the format so string comparison works.
function sqliteUtcNow(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function runStatsSummary() {
  const state = db.getStatsSummaryState.get();
  const sinceSql = state && state.lastRunAt ? state.lastRunAt : sqliteUtcNow(new Date(Date.now() - LOOKBACK_MS));
  const nowSql = sqliteUtcNow();

  const slotCount = db.countSlotSubmissionsSince.get(sinceSql).c;
  const inquiryCount = db.countInterestsSince.get(sinceSql).c;
  const marketplaceCount = db.countListingInterestsSince.get(sinceSql).c;
  const dailyUsers = await getDailyActiveUsers();

  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'New Preorder!',
          embeds: [
            {
              title: '📊 Site Activity Summary',
              color: 13770556,
              fields: [
                {
                  name: 'Google Analytics — Daily Users',
                  value: dailyUsers === null ? 'Not configured yet' : String(dailyUsers),
                  inline: true,
                },
                { name: 'Slot Submissions', value: String(slotCount), inline: true },
                { name: 'Inquiries', value: String(inquiryCount), inline: true },
                { name: 'Marketplace Sales', value: String(marketplaceCount), inline: true },
              ],
              footer: {
                text: `Since ${new Date(sinceSql.replace(' ', 'T') + 'Z').toLocaleString('en-US', { timeZone: 'America/New_York' })} ET`,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error('Stats summary Discord post failed:', res.status, await res.text());
      }
    } catch (err) {
      console.error('Stats summary Discord post failed:', err.message);
    }
  }

  db.setStatsSummaryState.run({ lastRunAt: nowSql });

  return { slotCount, inquiryCount, marketplaceCount, dailyUsers, since: sinceSql };
}

function startStatsSummarySchedule() {
  setInterval(() => {
    const now = new Date();
    if (hourInTZ(now, TARGET_TIMEZONE) !== TARGET_HOUR) return;

    const state = db.getStatsSummaryState.get();
    const alreadyRanToday =
      state && state.lastRunAt && dateStringInTZ(sqlToDate(state.lastRunAt), TARGET_TIMEZONE) === dateStringInTZ(now, TARGET_TIMEZONE);
    if (alreadyRanToday) return;

    runStatsSummary().catch((err) => console.error('Stats summary run failed:', err.message));
  }, TICK_INTERVAL_MS);
}

module.exports = { runStatsSummary, startStatsSummarySchedule };
