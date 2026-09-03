// Validates data/releases.json before it can mislead anyone. Run it after
// editing the file by hand:
//
//   node scripts/check-release-data.js
//
// Exits non-zero on a problem, so it can gate a commit or a deploy later.
// Reports (but does not fail on) entries the site deliberately excludes —
// those are working as intended, and seeing them listed is how you confirm
// an exclusion actually took.

const path = require('path');
const { loadReleases, exclusionReason, MANUFACTURERS } = require(path.join(__dirname, '..', 'lib', 'releases'));

const { releases, lastUpdated } = loadReleases();
const problems = [];
const excluded = [];

const seenIds = new Set();
const seenTitleDate = new Set();

for (const r of releases) {
  const where = `${r.releaseDate} ${r.id}`;

  if (!r.id || !r.title || !r.sport || !r.format || !r.releaseDate) {
    problems.push(`${where}: missing a required field (id, title, sport, format, releaseDate)`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.releaseDate || '')) {
    problems.push(`${where}: releaseDate is not YYYY-MM-DD`);
  }
  if (!MANUFACTURERS.includes(r.manufacturer)) {
    problems.push(`${where}: unknown manufacturer "${r.manufacturer}" (expected one of ${MANUFACTURERS.join(', ')})`);
  }
  if (!r.description || !r.description.trim()) {
    problems.push(`${where}: no description — the card and the email both print it`);
  }
  if (seenIds.has(r.id)) problems.push(`${where}: duplicate id`);
  seenIds.add(r.id);

  const key = `${r.title}|${r.releaseDate}`;
  if (seenTitleDate.has(key)) problems.push(`${where}: another entry has the same title and date`);
  seenTitleDate.add(key);

  // A sold-out flag on a future date contradicts itself: the card says
  // "already shipped" while the date is still ahead.
  if (r.soldOut && r.releaseDate > new Date().toISOString().slice(0, 10)) {
    problems.push(`${where}: soldOut is set but the date is in the future`);
  }

  const reason = exclusionReason(r);
  if (reason) excluded.push(`${where}: excluded (${reason}) — ${r.title}`);
}

console.log('');
console.log(`data/releases.json — ${releases.length} entries, lastUpdated ${lastUpdated}`);
console.log('');

if (excluded.length) {
  console.log(`Excluded from the site, newsletter and blog (${excluded.length}):`);
  for (const line of excluded) console.log('  ' + line);
  console.log('');
}

if (problems.length) {
  console.log(`PROBLEMS (${problems.length}):`);
  for (const line of problems) console.log('  ' + line);
  console.log('');
  process.exit(1);
}

console.log('No problems found.');
console.log('');
