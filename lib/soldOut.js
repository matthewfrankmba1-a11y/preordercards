// When a release stops accepting registrations.
//
// A release used to go sold out at midnight — the moment its date became
// "yesterday". In practice a drop is gone long before that: the boxes are
// claimed the morning they release, so anyone registering interest in the
// afternoon is registering for something nobody can get. From 2pm Eastern on
// its own release day, a release is treated as sold out.
//
// Imported by both the browser and the server, so it holds no filesystem or
// database access and every judgement is anchored to one timezone. A visitor
// in California must see the same thing as one in New York: the flip is a
// fact about the drop, not about where the person looking at it happens to
// be sitting.
const TIMEZONE = 'America/New_York';
const SOLD_OUT_HOUR = 14;

const FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  // h23 rather than hour12:false — the latter renders midnight as "24" on
  // some ICU versions, which would put the day's first second past every
  // comparison below.
  hourCycle: 'h23',
});

function partsInTZ(now) {
  const parts = {};
  for (const part of FORMATTER.formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = part.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function todayInTZ(now = new Date()) {
  return partsInTZ(now).date;
}

function hasKnownDate(release) {
  return typeof release.releaseDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(release.releaseDate);
}

// A release with no announced date can't be in the past, so it's never
// auto-marked sold out — only an explicit flag can do that.
function isSoldOut(release, now = new Date()) {
  if (release.soldOut === true) return true;
  if (!hasKnownDate(release)) return false;

  const { date, hour } = partsInTZ(now);
  if (release.releaseDate < date) return true;
  return release.releaseDate === date && hour >= SOLD_OUT_HOUR;
}

// Milliseconds until the next moment this function's answer could change:
// 2pm, when the day's releases flip, or midnight, when the next day's
// releases become current. Computed from the clock in TIMEZONE rather than
// by building a date, so the twice-yearly DST shift can't skew it.
function msUntilNextChange(now = new Date()) {
  const { hour, minute, second } = partsInTZ(now);
  const secondsNow = hour * 3600 + minute * 60 + second;
  const next = [SOLD_OUT_HOUR * 3600, 24 * 3600].find((boundary) => boundary > secondsNow) || 24 * 3600;
  // A second past the boundary, so the re-check lands on the far side of it.
  return (next - secondsNow) * 1000 + 1000;
}

module.exports = {
  SOLD_OUT_HOUR,
  TIMEZONE,
  hasKnownDate,
  isSoldOut,
  msUntilNextChange,
  todayInTZ,
};
