// Compares a release calendar against data/releases.json and reports what
// differs. It never writes to the data file: the newsletter's accuracy gate
// rests on a human having checked the week's dates, and a job that rewrote
// the calendar underneath it would hollow that out.
//
// Input is text you paste in, not a page this fetches. An earlier version
// fetched the publishers' calendars on a schedule; all three refuse
// automated clients — Panini and Topps answer 403, Blowout serves an
// Imperva interstitial as a 200 — so the fetching, the proxy pool built to
// get around it, and the schedule that drove them were removed. What
// survived is the half that always worked: extract products from text,
// match them against our calendar, report the differences.
//
// Used by the Release check box in the marketplace admin panel.
const Anthropic = require('@anthropic-ai/sdk');
const { loadReleases, hasKnownDate } = require('./releases');

const MODEL = 'claude-opus-5';
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

// Runs the whole comparison over pasted text: open a publisher's calendar in
// a browser, copy the list, paste it in. Reports only — nothing here edits
// data/releases.json.
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
  checkPastedText,
  htmlToText,
  buildDiff,
  similarity,
};
