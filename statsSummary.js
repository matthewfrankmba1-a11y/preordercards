const {
  countSlotSubmissionsSince,
  countInterestsSince,
  countListingInterestsSince,
  getStatsSummaryState,
  setStatsSummaryState,
} = require('./db');
const { getDailyActiveUsers } = require('./ga4');

// Defaults to the main site webhook for now — swap STATS_SUMMARY_WEBHOOK_URL
// in the environment to point this at a different one later without a code change.
const WEBHOOK_URL = process.env.STATS_SUMMARY_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
const INTERVAL_MS = 6 * 60 * 60 * 1000;

// SQLite's CURRENT_TIMESTAMP (used by every created_at column in this app)
// produces 'YYYY-MM-DD HH:MM:SS' in UTC — no 'T', no 'Z', no milliseconds.
// Comparing that against a real ISO string (toISOString()) breaks silently:
// ' ' < 'T' lexicographically, so `created_at > isoString` is always false
// regardless of actual time. Match the format so string comparison works.
function sqliteUtcNow(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

async function runStatsSummary() {
  const state = getStatsSummaryState.get();
  const sinceSql = state && state.lastRunAt ? state.lastRunAt : sqliteUtcNow(new Date(Date.now() - INTERVAL_MS));
  const nowSql = sqliteUtcNow();

  const slotCount = countSlotSubmissionsSince.get(sinceSql).c;
  const inquiryCount = countInterestsSince.get(sinceSql).c;
  const marketplaceCount = countListingInterestsSince.get(sinceSql).c;
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

  setStatsSummaryState.run({ lastRunAt: nowSql });

  return { slotCount, inquiryCount, marketplaceCount, dailyUsers, since: sinceSql };
}

function startStatsSummarySchedule() {
  setInterval(() => {
    runStatsSummary().catch((err) => console.error('Stats summary run failed:', err.message));
  }, INTERVAL_MS);
}

module.exports = { runStatsSummary, startStatsSummarySchedule };
