// Weekly release-data autocheck.
//
// Fetches the published release calendars, extracts what they list, and
// diffs that against data/releases.json — then reports. It never writes to
// the data file. That's deliberate: the whole accuracy gate downstream
// (lib/newsletter.js) rests on a human having checked the week's dates, and
// a job that silently rewrote the calendar would hollow that out. This tells
// you what to look at; you still decide.
//
// Extraction is done by the model rather than by CSS selectors. The sources
// are a vendor marketing page and a vBulletin forum thread, neither of which
// promises a stable DOM, and a selector that silently stops matching would
// look identical to "no changes this week" — the worst possible failure for
// a checker. Handing the page text to a model with a strict schema fails
// loudly instead, and survives a redesign.
const Anthropic = require('@anthropic-ai/sdk');
const { loadReleases, hasKnownDate } = require('./releases');
const { parseProxies, describeProxy, fetchThroughProxy } = require('./proxyFetch');

const MODEL = 'claude-opus-5';
const SITE_URL = (process.env.SITE_URL || 'https://preordercards.com').replace(/\/+$/, '');
const WEBHOOK_URL = process.env.RELEASE_CHECK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;

// Off unless armed, same as the newsletter — a fresh deploy shouldn't start
// making outbound requests and posting alerts before anyone has seen a run.
const ENABLED = process.env.RELEASE_CHECK_ENABLED === 'true';

// Saturday, so the report lands before the blog agent writes Sunday 8am and
// the newsletter goes out Sunday 10am. That ordering is the point: the check
// is only useful if there's time to act on it before the week is published.
const TICK_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_WEEKDAY = 'Sat';
const TARGET_HOUR = Number(process.env.RELEASE_CHECK_HOUR || 9);
const TARGET_TIMEZONE = 'America/New_York';
const MIN_HOURS_BETWEEN_RUNS = 20;

// The manufacturers' own calendars first — they're the authority, and the
// site's accuracy rule is "confirm against the manufacturer". The forum
// thread is a secondary cross-check: it's maintained daily and often has
// dates before the vendors post them, but it's someone's hand-kept list.
const DEFAULT_SOURCES = [
  { id: 'panini', name: 'Panini — Coming Soon', url: 'https://www.paniniamerica.net/coming-soon.html', manufacturer: 'Panini' },
  { id: 'topps', name: 'Topps — Release Calendar', url: 'https://www.topps.com/release-calendar', manufacturer: 'Topps' },
  { id: 'blowout', name: 'Blowout Forums — Release Calendar', url: 'https://www.blowoutforums.com/showthread.php?t=803', manufacturer: null },
];

function getSources() {
  const override = process.env.RELEASE_CHECK_SOURCES;
  if (!override) return DEFAULT_SOURCES;
  // "id|name|url|manufacturer" per line, so a source can be swapped or a
  // dead URL dropped without a deploy.
  return override
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, name, url, manufacturer] = line.split('|').map((s) => (s || '').trim());
      return { id, name: name || id, url, manufacturer: manufacturer || null };
    })
    .filter((s) => s.id && s.url);
}

// --- fetching --------------------------------------------------------------

const FETCH_TIMEOUT_MS = 20000;
const MAX_TEXT_CHARS = 60000;

// Crude tag-stripping rather than a DOM parser: all the model needs is the
// visible text, and adding a parser dependency for that would be a heavier
// commitment to these two specific pages than they deserve.
function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

// Identifies the bot and points at the site, so an operator who sees it in
// their logs can tell what it is. Overridable because some publishers refuse
// anything that doesn't look like a browser: presenting a browser string is
// a decision about their terms, so it belongs in the operator's hands and in
// the environment, not hardcoded here.
function userAgent() {
  return process.env.RELEASE_CHECK_USER_AGENT || `PreorderCardsReleaseCheck/1.0 (+${SITE_URL})`;
}

// These publishers refuse the deploy's own IP outright, so requests can be
// routed through a rotating pool instead. Each entry is a separate session
// (and so a separate exit IP); on a block the next one is tried. Credentials
// live only in RELEASE_CHECK_PROXIES and are never logged or returned — see
// describeProxy() in proxyFetch.js, which is what appears in reports.
function getProxies() {
  return parseProxies(process.env.RELEASE_CHECK_PROXIES);
}

// Where the pool starts each run, so a single entry isn't the one taking
// every first request week after week.
let proxyCursor = 0;

// A block doesn't always arrive as an error status. Imperva answers 200 with
// an interstitial in the body, which is why a status check alone reported
// Blowout as a success carrying 83 characters of text.
function blockSignal(status, body) {
  if (status === 403 || status === 429 || status === 503) return `HTTP ${status}`;
  if (/incapsula|_incapsula_resource|request unsuccessful/i.test(body)) return 'Imperva/Incapsula interstitial';
  if (/just a moment|cf-browser-verification|challenge-platform/i.test(body)) return 'Cloudflare challenge';
  if (/access denied|permission denied|bot detection/i.test(body.slice(0, 2000))) return 'Access denied page';
  return null;
}

async function fetchViaProxies(source, proxies) {
  const attempts = [];

  for (let i = 0; i < proxies.length; i += 1) {
    const index = (proxyCursor + i) % proxies.length;
    const proxy = proxies[index];
    const label = describeProxy(proxy, index);

    let response;
    try {
      response = await fetchThroughProxy(source.url, proxy, {
        headers: { 'User-Agent': userAgent(), Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
        timeoutMs: FETCH_TIMEOUT_MS,
      });
    } catch (err) {
      attempts.push({ proxy: label, outcome: err.message });
      continue;
    }

    const blocked = blockSignal(response.status, response.body);
    if (blocked) {
      attempts.push({ proxy: label, outcome: `blocked — ${blocked}` });
      continue;
    }

    const text = htmlToText(response.body);
    if (text.length < 500) {
      attempts.push({ proxy: label, outcome: `only ${text.length} characters of text` });
      continue;
    }

    // Leave the cursor past the entry that worked, so the next source in
    // this same run starts on a different session.
    proxyCursor = (index + 1) % proxies.length;
    return {
      ok: true,
      text,
      diagnostics: {
        httpStatus: response.status,
        finalUrl: response.finalUrl,
        via: label,
        attempts,
        rawLength: response.body.length,
        textLength: text.length,
        rawSample: response.body.slice(0, 1500),
        textSample: text.slice(0, 500),
      },
    };
  }

  proxyCursor = (proxyCursor + 1) % Math.max(proxies.length, 1);
  return {
    ok: false,
    error: `All ${proxies.length} proxies were blocked or failed`,
    diagnostics: { via: null, attempts, httpStatus: null, finalUrl: source.url, rawLength: 0, textLength: 0, rawSample: '', textSample: '' },
  };
}

async function fetchSourceText(source) {
  // With a pool configured, everything goes through it — never falling back
  // to a direct request, which would put the deploy's own IP in front of a
  // publisher that has already refused it.
  const proxies = getProxies();
  if (proxies.length) return fetchViaProxies(source, proxies);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent(),
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const raw = res.ok ? await res.text() : '';
    const text = raw ? htmlToText(raw) : '';

    // Carried on every result, success or not: when a source breaks, the
    // question is always "what did it actually send back", and without this
    // the only way to answer it is to guess from a character count.
    const diagnostics = {
      httpStatus: res.status,
      finalUrl: res.url,
      redirected: res.redirected,
      contentType: res.headers.get('content-type') || null,
      rawLength: raw.length,
      textLength: text.length,
      rawSample: raw.slice(0, 1500),
      textSample: text.slice(0, 500),
    };

    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, diagnostics };
    const blocked = blockSignal(res.status, raw);
    if (blocked) return { ok: false, error: `Blocked — ${blocked}`, diagnostics };
    if (text.length < 500) {
      return {
        ok: false,
        error: `Page returned only ${text.length} characters of text${raw.length > 5000 ? ' — the page is large but its content is rendered client-side' : ''}`,
        diagnostics,
      };
    }
    return { ok: true, text, diagnostics };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// --- extraction ------------------------------------------------------------

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    releases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Product name exactly as the page writes it' },
          releaseDate: { type: 'string', description: 'YYYY-MM-DD, or empty string if the page gives no date' },
          manufacturer: { type: 'string', description: 'Topps, Panini, or Other' },
          sport: { type: 'string', description: 'Baseball, Basketball, Football, Soccer, Golf, MMA, Entertainment, or Other' },
          womensSport: { type: 'boolean', description: 'true if this is a women\'s league or competition (WNBA, NWSL, Women\'s ...)' },
          dutchAuction: { type: 'boolean', description: 'true if the page marks it as a Dutch auction or First Off The Line auction' },
        },
        required: ['title', 'releaseDate', 'manufacturer', 'sport', 'womensSport', 'dutchAuction'],
        additionalProperties: false,
      },
    },
  },
  required: ['releases'],
  additionalProperties: false,
};

const EXTRACT_SYSTEM = [
  'You read trading card release calendars and return what they list, verbatim.',
  '',
  'Rules:',
  '- Only report products the page actually lists. Never infer, complete or invent an entry.',
  '- releaseDate: only if the page states one. A relative countdown ("2 days"), "coming soon",',
  '  "TBA" or a month with no day all mean no date — return an empty string.',
  '- Copy titles as written, including the box type in parentheses. Do not tidy them up.',
  '- Set womensSport for WNBA, NWSL, and any competition named as women\'s.',
  '- Set dutchAuction when the page marks the item as a Dutch auction or a "1st Off The Line" auction.',
  '- If the page is not a release calendar, or you cannot find any products, return an empty array.',
].join('\n');

async function extractReleases(source, text, todayISO) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: EXTRACT_SYSTEM,
    output_config: { format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          `Today is ${todayISO}. Extract every product listed on this page: ${source.name} (${source.url}).`,
          'Where a year is ambiguous, choose the one that makes the date fall on or after today.',
          '',
          text,
        ].join('\n'),
      },
    ],
  });

  if (response.stop_reason === 'refusal') throw new Error('Model declined the extraction.');
  if (response.stop_reason === 'max_tokens') throw new Error('Extraction hit max_tokens — page too long.');
  const block = response.content.find((b) => b.type === 'text');
  if (!block) throw new Error('Model returned no text.');

  const parsed = JSON.parse(block.text);
  return Array.isArray(parsed.releases) ? parsed.releases : [];
}

// --- matching --------------------------------------------------------------

// Titles differ cosmetically between sources ("2026 Panini Prizm Baseball
// Trading Card Box (Hobby)" vs "2026 Prizm Baseball Hobby"), so matching is
// on significant words rather than the whole string. But two things must
// never be blurred away, because they distinguish products that are
// otherwise worded identically:
//
//   - the box format. "Bowman Chrome Baseball Hobby Box" and "... Mega Box"
//     are different products with different dates, and dropping "hobby" and
//     "mega" as filler made them score a perfect match.
//   - the year or season. "2027 Panini Immaculate" is not "2026 Panini
//     Immaculate", however similar the rest reads.
//
// So both are pulled out and compared separately, and only the leftover
// words go through the fuzzy comparison.
const NOISE_WORDS = new Set([
  'trading', 'card', 'cards', 'box', 'boxes', 'the', 'a', 'of', 'and', 'edition', 'set',
  'collection', 'checklist', 'trading-card',
]);

const FORMAT_WORDS = ['hobby', 'blaster', 'mega', 'jumbo', 'value', 'bundle', 'tin', 'pack', 'packs', 'retail'];

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    // 2025/26 and 2025-26 are the same season.
    .replace(/(\d{4})\s*[/-]\s*(\d{2})\b/g, '$1-$2')
    .replace(/[^a-z0-9\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "hobby blaster" means blaster — the more specific word wins, since vendors
// write the retail format after the channel.
function formatSignature(title) {
  const normalized = normalizeTitle(title);
  const found = FORMAT_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(normalized));
  if (found.includes('blaster')) return 'blaster';
  if (found.includes('mega')) return 'mega';
  if (found.includes('jumbo')) return 'jumbo';
  if (found.includes('value')) return 'value';
  if (found.includes('bundle')) return 'bundle';
  if (found.includes('tin')) return 'tin';
  if (found.includes('hobby')) return 'hobby';
  return null;
}

function yearTokens(title) {
  return new Set(normalizeTitle(title).match(/\b\d{4}(?:-\d{2})?\b/g) || []);
}

function titleTokens(title) {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((w) => w && !NOISE_WORDS.has(w) && !FORMAT_WORDS.includes(w) && !/^\d{4}(-\d{2})?$/.test(w))
  );
}

function similarity(a, b) {
  const A = titleTokens(a);
  const B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const token of A) if (B.has(token)) shared += 1;
  return shared / Math.max(A.size, B.size);
}

// A format or year stated on both sides has to agree. Stated on only one
// side is allowed — a source often omits "(Hobby)" — but a disagreement is
// decisive, not a scoring penalty.
function compatible(a, b) {
  const formatA = formatSignature(a);
  const formatB = formatSignature(b);
  if (formatA && formatB && formatA !== formatB) return false;

  const yearsA = yearTokens(a);
  const yearsB = yearTokens(b);
  if (yearsA.size && yearsB.size) {
    let overlap = false;
    for (const y of yearsA) if (yearsB.has(y)) overlap = true;
    if (!overlap) return false;
  }
  return true;
}

const MATCH_THRESHOLD = 0.7;
// Two calendar entries scoring within this of each other means the title
// doesn't identify one of them. Reported rather than guessed at.
const AMBIGUITY_MARGIN = 0.05;

function findMatch(candidate, calendar) {
  const candidateFormat = formatSignature(candidate.title);

  const scored = calendar
    .filter((entry) => compatible(candidate.title, entry.title))
    .map((entry) => {
      const entryFormat = formatSignature(entry.title);
      return {
        entry,
        score: similarity(candidate.title, entry.title),
        // An entry that states the same format as the source is a better
        // match than one that states none — "Bowman Chrome Hobby Box" should
        // land on our Hobby Box row, not on our format-less row, even though
        // both are compatible and score identically on words.
        exactFormat: Boolean(candidateFormat && entryFormat && candidateFormat === entryFormat),
      };
    })
    .filter((s) => s.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score || Number(b.exactFormat) - Number(a.exactFormat));

  if (!scored.length) return null;

  // Only genuinely indistinguishable when the top two tie on the word score
  // *and* neither is a better format fit.
  const [first, second] = scored;
  if (second && first.score - second.score < AMBIGUITY_MARGIN && first.exactFormat === second.exactFormat) {
    return { ambiguous: true, candidates: scored.slice(0, 3).map((s) => s.entry) };
  }
  return first;
}

// --- the check -------------------------------------------------------------

function isExcludedByPolicy(candidate) {
  if (candidate.dutchAuction) return 'dutch-auction';
  if (candidate.womensSport) return 'womens';
  // Belt and braces: the model sets the flags, but the site's own rule is
  // what actually governs, so apply it to the title too.
  if (/\b(women'?s|wnba|nwsl|w-?league|aflw|wsl)\b/i.test(candidate.title)) return 'womens';
  return null;
}

function buildDiff(candidates, calendar) {
  const missing = [];
  const dateMismatch = [];
  const skipped = [];
  const confirmed = [];
  const ambiguous = [];

  for (const candidate of candidates) {
    const excluded = isExcludedByPolicy(candidate);
    if (excluded) {
      skipped.push({ title: candidate.title, reason: excluded });
      continue;
    }

    const match = findMatch(candidate, calendar);
    if (!match) {
      missing.push(candidate);
      continue;
    }
    if (match.ambiguous) {
      ambiguous.push({ sourceTitle: candidate.title, sourceDate: candidate.releaseDate || null, couldBe: match.candidates.map((e) => e.title) });
      continue;
    }

    const ours = match.entry;
    const theirDate = candidate.releaseDate || null;

    if (theirDate && hasKnownDate(ours) && theirDate !== ours.releaseDate) {
      dateMismatch.push({ id: ours.id, title: ours.title, ourDate: ours.releaseDate, sourceDate: theirDate, sourceTitle: candidate.title });
    } else if (theirDate && !hasKnownDate(ours)) {
      // We list it as undated and the source now has a date — the single most
      // actionable result this check produces.
      dateMismatch.push({ id: ours.id, title: ours.title, ourDate: null, sourceDate: theirDate, sourceTitle: candidate.title });
    } else {
      confirmed.push({ id: ours.id, title: ours.title });
    }
  }

  return { missing, dateMismatch, skipped, confirmed, ambiguous };
}

async function runReleaseCheck({ notify = true, debug = false } = {}) {
  // Debug skips extraction entirely, so a source can be diagnosed without a
  // key configured and without spending tokens on a page that isn't parsing.
  if (!debug && !process.env.ANTHROPIC_API_KEY) {
    return { error: 'ANTHROPIC_API_KEY is not configured — extraction needs it.' };
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const calendar = loadReleases().releases;
  const sources = getSources();
  const results = [];

  for (const source of sources) {
    const fetched = await fetchSourceText(source);

    if (debug) {
      results.push({
        source: source.name,
        url: source.url,
        ok: fetched.ok,
        error: fetched.error || null,
        ...(fetched.diagnostics || {}),
      });
      continue;
    }

    if (!fetched.ok) {
      results.push({ source: source.name, url: source.url, error: fetched.error });
      continue;
    }

    let candidates;
    try {
      candidates = await extractReleases(source, fetched.text, todayISO);
    } catch (err) {
      results.push({ source: source.name, url: source.url, error: `Extraction failed: ${err.message}` });
      continue;
    }

    // An empty extraction from a page that fetched fine usually means the
    // page changed shape, not that a publisher shipped nothing. Surfaced as
    // a problem rather than as a clean bill of health.
    if (candidates.length === 0) {
      results.push({ source: source.name, url: source.url, error: 'Fetched the page but found no products — it may have changed.' });
      continue;
    }

    // Honour the source's own manufacturer when it has one: a vendor page
    // only lists that vendor, whatever the model guessed per row.
    if (source.manufacturer) {
      for (const c of candidates) c.manufacturer = source.manufacturer;
    }

    results.push({ source: source.name, url: source.url, found: candidates.length, ...buildDiff(candidates, calendar) });
  }

  const report = { ranAt: new Date().toISOString(), calendarSize: calendar.length, debug, sources: results };
  if (notify && !debug) await notifyDiscord(report);
  return report;
}

// --- delivery --------------------------------------------------------------

function summarize(report) {
  let missing = 0;
  let mismatched = 0;
  let errored = 0;
  for (const r of report.sources) {
    if (r.error) errored += 1;
    missing += (r.missing || []).length;
    mismatched += (r.dateMismatch || []).length;
  }
  return { missing, mismatched, errored };
}

function fieldLines(items, render, cap = 8) {
  if (!items.length) return null;
  const lines = items.slice(0, cap).map(render);
  if (items.length > cap) lines.push(`…and ${items.length - cap} more`);
  // Discord rejects a field value over 1024 characters outright.
  return lines.join('\n').slice(0, 1000);
}

async function notifyDiscord(report) {
  if (!WEBHOOK_URL) return;
  const { missing, mismatched, errored } = summarize(report);

  const fields = [];
  for (const r of report.sources) {
    if (r.error) {
      fields.push({ name: `⚠️ ${r.source}`, value: r.error.slice(0, 1000) });
      continue;
    }
    const parts = [];
    const missingLines = fieldLines(r.missing, (m) => `• ${m.title}${m.releaseDate ? ` — ${m.releaseDate}` : ' — no date given'}`);
    if (missingLines) parts.push(`**Not on our calendar:**\n${missingLines}`);
    const mismatchLines = fieldLines(
      r.dateMismatch,
      (m) => `• ${m.title}: ours ${m.ourDate || 'TBA'} → source ${m.sourceDate}`
    );
    if (mismatchLines) parts.push(`**Date differs:**\n${mismatchLines}`);
    const ambiguousLines = fieldLines(r.ambiguous || [], (m) => `• "${m.sourceTitle}" could be ${m.couldBe.length} of ours`);
    if (ambiguousLines) parts.push(`**Couldn't tell which entry:**\n${ambiguousLines}`);
    if (!parts.length) parts.push(`Nothing to action — ${r.confirmed.length} matched, ${r.skipped.length} excluded by policy.`);
    fields.push({ name: `${r.source} (${r.found} listed)`, value: parts.join('\n\n').slice(0, 1000) });
  }

  const clean = missing === 0 && mismatched === 0 && errored === 0;
  const allBlocked = errored === report.sources.length && report.sources.length > 0;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'PreorderCards Release Check',
        embeds: [
          {
            title: allBlocked
              ? '🔒 Weekly release check — every source refused the request'
              : clean
                ? '✅ Weekly release check — calendar matches the sources'
                : `📋 Weekly release check — ${missing} missing, ${mismatched} date change${mismatched === 1 ? '' : 's'}${errored ? `, ${errored} source error${errored === 1 ? '' : 's'}` : ''}`,
            description: allBlocked
              ? `These publishers block automated fetching. Open the calendar in a browser, copy the list, and paste it into the Release Check box in the admin panel — it runs the same comparison: ${SITE_URL}/marketplace-admin.html`
              : clean
                ? undefined
                : 'Nothing has been changed. Update data/releases.json yourself, then confirm the week in the Newsletter tab.',
            color: clean ? 0x1a7f37 : 0xd9a400,
            fields: fields.slice(0, 10),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Release check webhook failed:', err.message);
  }
}

// --- schedule --------------------------------------------------------------

function weekdayInTZ(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TARGET_TIMEZONE, weekday: 'short' }).format(date);
}

function hourInTZ(date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TARGET_TIMEZONE, hour: '2-digit', hour12: false }).format(date));
}

let lastRunAt = 0;
let running = false;

function startReleaseCheckSchedule() {
  if (!ENABLED) {
    console.log('Weekly release check is off (set RELEASE_CHECK_ENABLED=true to arm it).');
    return;
  }

  console.log(`Weekly release check armed: ${TARGET_WEEKDAY} ${TARGET_HOUR}:00 ${TARGET_TIMEZONE}.`);

  setInterval(() => {
    const now = new Date();
    if (weekdayInTZ(now) !== TARGET_WEEKDAY) return;
    if (hourInTZ(now) !== TARGET_HOUR) return;
    // The tick fires every 5 minutes through the whole hour; this keeps the
    // run to once. In-memory is enough — a restart mid-hour costing a second
    // run is a duplicate Discord post, not a duplicate write.
    if (running || Date.now() - lastRunAt < MIN_HOURS_BETWEEN_RUNS * 60 * 60 * 1000) return;

    running = true;
    lastRunAt = Date.now();
    runReleaseCheck()
      .then((report) => console.log('Release check finished:', JSON.stringify(summarize(report))))
      .catch((err) => console.error('Release check failed:', err.message))
      .finally(() => {
        running = false;
      });
  }, TICK_INTERVAL_MS);
}

// The publishers all block automated fetching (Panini and Topps answer 403;
// Blowout serves an Incapsula interstitial as a 200), so the fetch path is
// frequently a dead end. The extraction and diff either side of it are not:
// point them at text pasted from a browser and the whole check works, which
// is what the admin panel does. Same schema, same matching, same policy
// exclusions — only the transport differs.
async function checkPastedText({ text, manufacturer = null, sourceName = 'Pasted calendar' }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: 'ANTHROPIC_API_KEY is not configured — extraction needs it.' };
  }
  const cleaned = String(text || '').trim();
  if (cleaned.length < 40) {
    return { error: 'Paste the calendar text first — that was too short to read.' };
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const calendar = loadReleases().releases;
  const source = { id: 'pasted', name: sourceName, url: '(pasted)', manufacturer };

  let candidates;
  try {
    // Pasted text is already visible text, but running it through the same
    // stripper keeps behaviour identical whether someone pastes rendered
    // text or copied HTML.
    candidates = await extractReleases(source, htmlToText(cleaned) || cleaned.slice(0, MAX_TEXT_CHARS), todayISO);
  } catch (err) {
    return { error: `Extraction failed: ${err.message}` };
  }

  if (!candidates.length) {
    return { error: "Couldn't find any products in that text. Paste the release list itself, not the whole page." };
  }

  if (manufacturer) {
    for (const c of candidates) c.manufacturer = manufacturer;
  }

  return {
    ranAt: new Date().toISOString(),
    calendarSize: calendar.length,
    source: sourceName,
    found: candidates.length,
    ...buildDiff(candidates, calendar),
  };
}

module.exports = {
  blockSignal,
  getProxies,
  checkPastedText,
  runReleaseCheck,
  startReleaseCheckSchedule,
  getSources,
  htmlToText,
  buildDiff,
  similarity,
  summarize,
  ENABLED,
};
