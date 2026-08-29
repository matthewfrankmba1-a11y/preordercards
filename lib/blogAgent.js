// Blog agent: writes a weekly release-roundup post, publishes it to the live
// site, and posts the link plus a ready-to-send tweet to Discord.
//
// Publishing is DB-backed rather than git-backed on purpose. The two
// hand-written posts are committed page.js files under app/blog/<slug>/, but
// an unattended agent can't push and wait on a Render redeploy — so posts go
// into the blog_posts table and app/blog/[slug] renders them at request time.
// Next resolves static route segments before the dynamic one, so the two
// committed posts keep working untouched.
//
// The tweet is deliberately assembled here from typed fields (hook, bullets,
// hashtags) rather than asked for as one free-text blob: that's what keeps
// its shape consistent week to week, and it's what lets us enforce the
// 280-character limit before the link ever reaches Discord.
const Anthropic = require('@anthropic-ai/sdk');
const { BLOG_POSTS } = require('./blogPosts');
const { loadReleases, todayISO } = require('./releases');

const MODEL = 'claude-opus-5';
const SITE_URL = (process.env.SITE_URL || 'https://preordercards.com').replace(/\/+$/, '');
const WEBHOOK_URL = process.env.BLOG_AGENT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;

// How far ahead to look for releases to write about. A week of drops is the
// subject of the post; the extra days give the model something to tease at
// the end when the current week is thin.
const LOOKAHEAD_DAYS = 14;

// Wall-clock schedule, checked on a 5-minute tick rather than a 7-day
// setInterval so the run lands on a real Monday morning instead of drifting
// with every redeploy — same approach as lib/statsSummary.js.
const TICK_INTERVAL_MS = 5 * 60 * 1000;
const TARGET_HOUR = 8; // 8am
// Sunday rather than Monday: the weekly newsletter (lib/newsletter.js) mails
// this post to both of its send-day cohorts, and the earlier one goes out
// Sunday at 10am — the post has to exist by then, and both cohorts have to
// get the same one for the send-day comparison to mean anything.
const TARGET_WEEKDAY = 'Sun';
const TARGET_TIMEZONE = 'America/New_York';
// A restart shouldn't be able to publish a second post for the same week, so
// runs are gated on elapsed time since the last one rather than on "is it
// Monday" alone.
const MIN_DAYS_BETWEEN_RUNS = 6;

// Twitter counts every link as 23 characters no matter its real length.
const TWEET_LIMIT = 280;
const TWEET_URL_WEIGHT = 23;

function hourInTZ(date, timeZone) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hour12: false }).format(date));
}

function weekdayInTZ(date, timeZone) {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
}

function sqliteUtcNow(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLongDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// --- Grounding data -------------------------------------------------------

// The model only ever sees releases that actually exist in data/releases.json,
// so it can describe and order them but can't invent a product.
function collectUpcomingReleases() {
  const today = todayISO();
  const horizon = addDaysISO(today, LOOKAHEAD_DAYS);
  const { releases } = loadReleases();
  return releases
    .filter((r) => r.releaseDate >= today && r.releaseDate <= horizon && !r.soldOut)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
    .map((r) => ({
      title: r.title,
      sport: r.sport,
      format: r.format,
      releaseDate: r.releaseDate,
      weekday: formatLongDate(r.releaseDate),
      checkout: r.eql ? 'EQL raffle entry' : 'standard checkout',
      description: r.description,
    }));
}

// --- Slugs ----------------------------------------------------------------

function slugify(title) {
  const base = String(title)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
  return base || 'post';
}

// Collides against the committed posts as well as the stored ones — both
// share the /blog/<slug> namespace, and a DB slug that shadows a committed
// one would be unreachable (Next resolves the static segment first).
function uniqueSlug(db, title) {
  const taken = new Set(BLOG_POSTS.map((p) => p.slug));
  const base = slugify(title);
  let candidate = base;
  for (let n = 2; taken.has(candidate) || db.getBlogPostBySlug.get(candidate); n += 1) {
    candidate = `${base}-${n}`;
  }
  return candidate;
}

// --- Model call -----------------------------------------------------------

const POST_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    tagline: { type: 'string' },
    description: { type: 'string' },
    readMinutes: { type: 'integer' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          paragraphs: { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'paragraphs'],
        additionalProperties: false,
      },
    },
    tweetHook: { type: 'string' },
    tweetBullets: { type: 'array', items: { type: 'string' } },
    tweetHashtags: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'tagline', 'description', 'readMinutes', 'sections', 'tweetHook', 'tweetBullets', 'tweetHashtags'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = [
  'You write the PreorderCards blog — a release calendar for sports and entertainment trading cards.',
  '',
  'Voice: plain, specific, and useful to a collector deciding what to chase this week. No hype, no',
  'filler, no emoji in the post body. Write like the two posts already on the site: short paragraphs,',
  'one section per drop day, concrete details about format and checkout mechanics.',
  '',
  'Ground every factual claim in the release data you are given. Never invent a product, a date, a',
  'price, a print run, or a checkout mechanic. If the data does not say something, do not say it.',
  '',
  'Always explain the EQL distinction where it applies: EQL raffle entry means the collector enters and',
  'waits to be selected to buy at retail price, rather than refreshing a checkout page at launch.',
  '',
  'Structure requirements:',
  '- title: under 70 characters, no colon-heavy clickbait.',
  '- tagline: one sentence, under 120 characters, shown under the post title.',
  '- description: 1-2 sentences, 150-250 characters, used as the meta description and blog-index blurb.',
  '- readMinutes: realistic whole-minute read time for the body you wrote (usually 2 or 3).',
  '- sections: 3-6 sections. Each heading is short and scannable. Each section has 1-3 paragraphs of',
  '  plain prose. Write plain text only — no markdown, no HTML, no bullet characters, no links.',
  '- The final section should tell readers they can register interest for free on the release calendar,',
  '  with no payment collected upfront.',
  '',
  'Tweet requirements (assembled into one tweet elsewhere, so write the pieces, not the whole tweet):',
  '- tweetHook: one line, under 80 characters, states what is dropping this week. No hashtags, no link.',
  '- tweetBullets: 2-4 lines, each under 55 characters, one drop per line, formatted like',
  '  "Mon 7/28 - Topps Mint Marvel (EQL)". Use the real dates and titles. No hashtags, no link.',
  '- tweetHashtags: 2-3 hashtags without the # character, e.g. ["ToppsCards", "TheHobby"].',
].join('\n');

function buildUserPrompt(releases) {
  const today = todayISO();
  return [
    `Today is ${formatLongDate(today)} (${today}).`,
    '',
    'Write this week\'s release roundup post for the PreorderCards blog.',
    '',
    'These are the only releases on the calendar in the next two weeks. Build the post around the ones',
    'landing in the next seven days; you may briefly mention later ones as what is coming up next.',
    '',
    JSON.stringify(releases, null, 2),
  ].join('\n');
}

async function generatePost(releases) {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: 'json_schema', schema: POST_SCHEMA } },
    messages: [{ role: 'user', content: buildUserPrompt(releases) }],
  });

  // Opus 5 can decline a request outright, which comes back as a normal 200
  // with an empty content array — check before indexing into content.
  if (response.stop_reason === 'refusal') {
    throw new Error(`Model declined the request (${response.stop_details?.category || 'no category'}).`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Model response hit max_tokens before finishing — post not published.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Model returned no text content.');

  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`Model returned unparseable JSON: ${err.message}`);
  }
  return parsed;
}

// --- Validation -----------------------------------------------------------

// Structured outputs guarantee the shape but not the sizes — JSON Schema
// length and item-count constraints aren't enforced by the API — so the
// limits stated in the prompt are re-checked here before anything is stored.
function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function validatePost(raw) {
  const title = cleanText(raw.title);
  const description = cleanText(raw.description);
  if (!title) throw new Error('Model returned an empty title.');
  if (!description) throw new Error('Model returned an empty description.');

  const sections = (Array.isArray(raw.sections) ? raw.sections : [])
    .map((s) => ({
      heading: cleanText(s.heading),
      paragraphs: (Array.isArray(s.paragraphs) ? s.paragraphs : []).map(cleanText).filter(Boolean),
    }))
    .filter((s) => s.heading && s.paragraphs.length > 0);
  if (sections.length === 0) throw new Error('Model returned no usable body sections.');

  const readMinutes = Number.isInteger(raw.readMinutes) && raw.readMinutes > 0 ? raw.readMinutes : 2;

  return {
    title,
    tagline: cleanText(raw.tagline),
    description,
    readMinutes,
    sections,
  };
}

// Weighted length: the link always costs 23 characters on X regardless of how
// long the URL actually is.
function tweetLength(text) {
  return text.replace(/https?:\/\/\S+/g, 'x'.repeat(TWEET_URL_WEIGHT)).length;
}

function composeTweet(raw, url) {
  const hook = cleanText(raw.tweetHook);
  const bullets = (Array.isArray(raw.tweetBullets) ? raw.tweetBullets : []).map(cleanText).filter(Boolean);
  const hashtags = (Array.isArray(raw.tweetHashtags) ? raw.tweetHashtags : [])
    .map((h) => cleanText(h).replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 3)
    .map((h) => `#${h}`)
    .join(' ');

  // Drop the least important content first (trailing bullets, then hashtags)
  // until the tweet fits, so we never hand over something X would reject.
  const build = (usedBullets, usedHashtags) =>
    [hook, usedBullets.map((b) => `• ${b}`).join('\n'), `${url}${usedHashtags ? `\n${usedHashtags}` : ''}`]
      .filter(Boolean)
      .join('\n\n');

  let kept = bullets.slice(0, 4);
  let tweet = build(kept, hashtags);
  while (tweetLength(tweet) > TWEET_LIMIT && kept.length > 1) {
    kept = kept.slice(0, -1);
    tweet = build(kept, hashtags);
  }
  if (tweetLength(tweet) > TWEET_LIMIT) tweet = build(kept, '');
  if (tweetLength(tweet) > TWEET_LIMIT) tweet = `${hook}\n\n${url}`;

  // Last resort: the hook alone overran the limit, which means the model
  // badly ignored its length instruction. Truncate rather than hand over a
  // tweet that X would reject outright.
  if (tweetLength(tweet) > TWEET_LIMIT) {
    const room = TWEET_LIMIT - TWEET_URL_WEIGHT - 3 /* ellipsis */ - 2 /* blank line */;
    tweet = `${hook.slice(0, room)}…\n\n${url}`;
  }
  return tweet;
}

// --- Delivery -------------------------------------------------------------

async function notifyDiscord({ title, description, url, tweet }) {
  if (!WEBHOOK_URL) return { delivered: false, reason: 'No webhook configured.' };

  const composeUrl = `https://x.com/intent/post?text=${encodeURIComponent(tweet)}`;

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'PreorderCards Blog',
        embeds: [
          {
            title: `📝 New blog post published — ${title}`,
            url,
            description,
            color: 0xd21f3c,
            fields: [
              { name: 'Live at', value: url },
              // Fenced so Discord renders it as one copyable block with the
              // line breaks intact.
              { name: `Tweet (${tweetLength(tweet)}/${TWEET_LIMIT} chars)`, value: `\`\`\`\n${tweet}\n\`\`\`` },
              { name: 'Post it', value: `[Open X with this tweet pre-filled](${composeUrl})` },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Blog agent Discord post failed:', res.status, body);
      return { delivered: false, reason: `Discord returned ${res.status}.` };
    }
    return { delivered: true };
  } catch (err) {
    console.error('Blog agent Discord post failed:', err.message);
    return { delivered: false, reason: err.message };
  }
}

// --- Entry point ----------------------------------------------------------

// Required lazily so importing this module never triggers db.js's initDb()
// as a side effect — the same reason lib/releases.js defers its require.
function runBlogAgent() {
  const db = require('./db');
  return runWithDb(db);
}

async function runWithDb(db) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  const releases = collectUpcomingReleases();
  if (releases.length === 0) {
    db.setBlogAgentState.run({ lastRunAt: sqliteUtcNow() });
    return { published: false, reason: 'No upcoming releases in the next two weeks — nothing to write about.' };
  }

  const raw = await generatePost(releases);
  const post = validatePost(raw);

  const slug = uniqueSlug(db, post.title);
  const url = `${SITE_URL}/blog/${slug}`;
  const tweet = composeTweet(raw, url);
  const datePublished = todayISO();

  db.insertBlogPost.run({
    slug,
    title: post.title,
    description: post.description,
    tagline: post.tagline || null,
    bodyJson: JSON.stringify(post.sections),
    tweet,
    readMinutes: post.readMinutes,
    datePublished,
  });
  db.setBlogAgentState.run({ lastRunAt: sqliteUtcNow() });

  const delivery = await notifyDiscord({ title: post.title, description: post.description, url, tweet });

  return {
    published: true,
    slug,
    url,
    title: post.title,
    tweet,
    tweetLength: tweetLength(tweet),
    releasesCovered: releases.length,
    notified: delivery.delivered,
    notifyError: delivery.reason,
  };
}

function startBlogAgentSchedule() {
  setInterval(() => {
    const now = new Date();
    if (weekdayInTZ(now, TARGET_TIMEZONE) !== TARGET_WEEKDAY) return;
    if (hourInTZ(now, TARGET_TIMEZONE) !== TARGET_HOUR) return;

    const db = require('./db');
    const state = db.getBlogAgentState.get();
    if (state && state.lastRunAt) {
      const lastRun = new Date(state.lastRunAt.replace(' ', 'T') + 'Z');
      const daysSince = (now.getTime() - lastRun.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSince < MIN_DAYS_BETWEEN_RUNS) return;
    }

    runBlogAgent()
      .then((result) => console.log('Blog agent run finished:', JSON.stringify(result)))
      .catch((err) => console.error('Blog agent run failed:', err.message));
  }, TICK_INTERVAL_MS);
}

module.exports = { runBlogAgent, startBlogAgentSchedule, composeTweet, tweetLength, slugify };
