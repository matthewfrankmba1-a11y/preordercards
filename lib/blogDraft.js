const Anthropic = require('@anthropic-ai/sdk');
const { loadListableReleases, todayISO } = require('./releases');

// Structured-output schema for the draft — keeps the model's output in a
// shape the template renderer can drop straight into a page.js module
// without any freeform-text parsing.
const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Post title, e.g. "What\'s Coming Out This Week (Jul 28-31)"' },
    slug: { type: 'string', description: 'URL slug: lowercase, hyphenated, no dates removed (e.g. whats-coming-out-july-28-2026)' },
    description: { type: 'string', description: 'One-sentence meta description / index-page excerpt' },
    tagline: { type: 'string', description: 'One-sentence subheading shown under the title in the page header' },
    intro: { type: 'string', description: 'Opening paragraph, 1-3 sentences' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string', description: 'One paragraph of plain text, no markdown/HTML' },
        },
        required: ['heading', 'body'],
        additionalProperties: false,
      },
    },
    closing: { type: 'string', description: 'Closing paragraph pointing readers to the release calendar' },
  },
  required: ['title', 'slug', 'description', 'tagline', 'intro', 'sections', 'closing'],
  additionalProperties: false,
};

// Kept short and specific so the model can't drift into review-site "hot
// takes" — only the facts in the provided release list are fair game.
const SYSTEM_PROMPT = `You are the blog writer for PreorderCards, an independent Topps trading card release-tracking site. Write in the same voice as the site's existing posts: factual, concise, collector-focused, no hype. Only use the release facts given to you — never invent releases, dates, or details. Every post should mention which releases are EQL raffle-entry vs standard checkout, and close by pointing readers to the release calendar at "/".`;

function buildUserPrompt(releases, since, until) {
  const releaseLines = releases
    .map((r) => `- ${r.releaseDate}: ${r.title} (${r.sport}, ${r.format}${r.eql ? ', EQL raffle entry' : ', standard checkout'}) — ${r.description}`)
    .join('\n');

  return `Draft a "what's coming out this week" roundup blog post covering releases dropping between ${since} and ${until}.

Releases in this window:
${releaseLines || '(none scheduled)'}

Write 2-4 sections grouping releases sensibly (e.g. by date or by notable drops), plus a short intro and closing paragraph.`;
}

// Pulls every release whose date falls in [since, until] (inclusive), sorted
// chronologically — the same window shape used elsewhere in the app (see
// lib/statsSummary.js and the admin interests-report route).
function getReleasesInWindow(sinceISO, untilISO) {
  const data = loadListableReleases();
  return data.releases
    .filter((r) => r.releaseDate >= sinceISO && r.releaseDate <= untilISO)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

async function generateBlogDraftForWeek({ days = 7 } = {}) {
  const since = todayISO();
  const untilDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const until = untilDate.toISOString().slice(0, 10);

  const releases = getReleasesInWindow(since, until);

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 4096,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: DRAFT_SCHEMA },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(releases, since, until) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Draft generation was declined by the model safety classifiers.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in the model response.');
  }

  const draft = JSON.parse(textBlock.text);
  return { draft, releases, since, until, servedByModel: response.model };
}

module.exports = { generateBlogDraftForWeek, getReleasesInWindow };
