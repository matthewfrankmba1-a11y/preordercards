// Copies everyone who ever registered interest by email — release preorders
// and marketplace listings — into the discount_signups table, which is the
// site's own subscriber list.
//
// Note this is NOT what puts them on the newsletter: with the default
// NEWSLETTER_AUDIENCE=all, lib/newsletter.js already reads interests and
// listing_interests directly, so past registrants receive the weekly roundup
// today without this script. What the copy buys is durability — membership
// that no longer depends on the registration row staying eligible:
//
//   - Switching to NEWSLETTER_AUDIENCE=signups later stops reading the
//     interest tables at all. Without this backfill, that setting silently
//     drops every past registrant off the list.
//   - Cancelling a registration in the admin panel removes that person from
//     the 'all' audience. Cancelling is a decision about one preorder, not
//     about email preferences, so it shouldn't quietly unsubscribe them.
//
// Usage, from the project root (the Render Shell starts there):
//   node scripts/backfill-newsletter-list.js              # dry run, writes nothing
//   node scripts/backfill-newsletter-list.js --apply      # actually insert
//   node scripts/backfill-newsletter-list.js --apply --skip-cancelled
//
// Sends no email. These people already had their registration confirmation,
// and a "welcome to the newsletter" message for a list they're already on
// would only confuse them.

const path = require('path');
const db = require(path.join(__dirname, '..', 'lib', 'db'));
const { EMAIL_RE, isLikelyTestContact } = require(path.join(__dirname, '..', 'lib', 'utils'));

const apply = process.argv.includes('--apply');
const skipCancelled = process.argv.includes('--skip-cancelled');

// Earliest registration per address, across both tables. The original date
// matters: discount_signups.created_at is what the newsletter's first-week
// hold is measured against, so inserting these at today's date would park
// people who registered months ago behind a week's wait for no reason.
const CANCELLED_FILTER = skipCancelled ? 'AND cancelled_at IS NULL' : '';

const candidates = db.db
  .prepare(
    `
    SELECT email, MIN(joinedAt) AS joinedAt, MAX(active) AS active FROM (
      SELECT LOWER(contact_value) AS email, created_at AS joinedAt,
             CASE WHEN cancelled_at IS NULL THEN 1 ELSE 0 END AS active
      FROM interests
      WHERE contact_type = 'email' ${CANCELLED_FILTER}
      UNION ALL
      SELECT LOWER(contact_value) AS email, created_at AS joinedAt,
             CASE WHEN cancelled_at IS NULL THEN 1 ELSE 0 END AS active
      FROM listing_interests
      WHERE contact_type = 'email' ${CANCELLED_FILTER}
    )
    GROUP BY email
    ORDER BY email
  `
  )
  .all();

const insert = db.db.prepare(`
  INSERT OR IGNORE INTO discount_signups (email, source, created_at)
  VALUES (@email, 'preorder-backfill', @joinedAt)
`);

const skipped = { invalid: [], test: [], unsubscribed: [], alreadyOnList: 0 };
const toInsert = [];

for (const row of candidates) {
  const email = String(row.email || '').trim();

  // Same two filters the send itself applies, so the report below matches
  // what a real send would do rather than overcounting.
  if (!EMAIL_RE.test(email) || email.length > 254) {
    skipped.invalid.push(email);
    continue;
  }
  if (isLikelyTestContact(email)) {
    skipped.test.push(email);
    continue;
  }

  // Unsubscribes are suppressed at send time regardless, so adding these
  // rows would change nothing — but listing them keeps the count honest.
  if (db.isNewsletterUnsubscribed.get(email)) {
    skipped.unsubscribed.push(email);
    continue;
  }

  if (db.getDiscountSignupByEmail.get(email)) {
    skipped.alreadyOnList += 1;
    continue;
  }

  toInsert.push({ email, joinedAt: row.joinedAt, active: row.active });
}

let inserted = 0;
if (apply) {
  const run = db.db.transaction((rows) => {
    for (const row of rows) {
      inserted += insert.run({ email: row.email, joinedAt: row.joinedAt }).changes;
    }
  });
  run(toInsert);
}

const cancelledOnly = toInsert.filter((r) => !r.active).length;

console.log('');
console.log(apply ? 'Backfill applied.' : 'DRY RUN — nothing was written. Re-run with --apply to insert.');
console.log('');
console.log(`  Registrant addresses found:   ${candidates.length}`);
console.log(`  Already on the list:          ${skipped.alreadyOnList}`);
console.log(`  Skipped, unsubscribed:        ${skipped.unsubscribed.length}`);
console.log(`  Skipped, test addresses:      ${skipped.test.length}`);
console.log(`  Skipped, invalid addresses:   ${skipped.invalid.length}`);
console.log(`  ${apply ? 'Inserted' : 'Would insert'}:${apply ? '                     ' : '                 '}${apply ? inserted : toInsert.length}`);
if (cancelledOnly) {
  console.log('');
  console.log(`  ${cancelledOnly} of those have only cancelled registrations. They are currently`);
  console.log('  OUTSIDE the newsletter audience and this adds them to it. Re-run with');
  console.log('  --skip-cancelled to leave them out.');
}

if (skipped.unsubscribed.length) {
  console.log('');
  console.log('  Unsubscribed (left alone, as they should be):');
  for (const email of skipped.unsubscribed) console.log(`    ${email}`);
}
if (skipped.invalid.length) {
  console.log('');
  console.log('  Invalid addresses (worth a look — these never received any mail either):');
  for (const email of skipped.invalid) console.log(`    ${email}`);
}
console.log('');
