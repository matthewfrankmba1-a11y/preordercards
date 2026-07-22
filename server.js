require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { upsertInterest, countByRelease, getInterestByReleaseAndContact } = require('./db');
const bot = require('./bot');

const app = express();
// Render (and most PaaS hosts) put the app behind a reverse proxy. Without this,
// req.ip returns the proxy's address for every request, so the rate limiter below
// would count all visitors as one IP instead of limiting per real client.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const RELEASES_PATH = path.join(__dirname, 'data', 'releases.json');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PreorderCards <notifications@preordercards.com>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SPORT_EMOJI = {
  Baseball: '⚾',
  Basketball: '🏀',
  Football: '🏈',
  MMA: '🥊',
  Soccer: '⚽',
  Entertainment: '🎬',
};

// Fire-and-forget Discord alert — never let a webhook hiccup block or fail the signup itself.
async function notifyDiscord(release, { contactType, contactValue, quantity }) {
  if (!DISCORD_WEBHOOK_URL) return;
  const emoji = SPORT_EMOJI[release.sport] || '📦';
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: `${emoji} New interest registration`,
            color: 0xd21f3c,
            fields: [
              { name: 'Release', value: release.title },
              { name: 'Sport', value: release.sport, inline: true },
              { name: 'Release date', value: release.releaseDate, inline: true },
              { name: 'Quantity', value: String(quantity), inline: true },
              { name: contactType === 'email' ? 'Email' : 'Phone', value: contactValue },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Discord webhook failed:', err.message);
  }
}

// Sends the acknowledgment email via Resend. Returns { ok, error } rather than
// throwing, since the Discord bot needs to report failures back to whoever
// clicked "Send Confirmation Email" (e.g. "domain not verified").
async function sendConfirmationEmail(release, { contactType, contactValue, quantity }) {
  if (contactType !== 'email') return { ok: false, error: 'No email address on file.' };
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [contactValue],
        subject: `You're registered: ${release.title}`,
        text: [
          `You've registered interest in ${release.title} (releasing ${release.releaseDate}), quantity ${quantity}.`,
          '',
          "No payment was collected — this just registers your interest. We'll be in touch when preorders open.",
          '',
          '— PreorderCards',
          '',
          'PreorderCards is an independent tracker and is not affiliated with Topps or any league/brand referenced.',
        ].join('\n'),
        html: `
          <p>You've registered interest in <strong>${escapeHtml(release.title)}</strong>
          (releasing ${release.releaseDate}), quantity ${quantity}.</p>
          <p>No payment was collected — this just registers your interest. We'll be in touch
          when preorders open.</p>
          <p>— PreorderCards</p>
          <p style="color:#888;font-size:12px">PreorderCards is an independent tracker and is
          not affiliated with Topps or any league/brand referenced.</p>
        `,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend email failed:', res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('Resend email failed:', err.message);
    return { ok: false, error: err.message };
  }
}

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function loadReleases() {
  const raw = fs.readFileSync(RELEASES_PATH, 'utf8');
  return JSON.parse(raw);
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (hasPlus ? '+' : '') + digits;
}

// Simple in-memory rate limiter: N requests per window per IP, to slow down
// signup abuse without adding an external dependency for this small app.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const hitsByIp = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const hits = (hitsByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests from this address. Try again later.' });
  }
  hits.push(now);
  hitsByIp.set(ip, hits);
  next();
}

app.get('/api/releases', (req, res) => {
  const data = loadReleases();
  const counts = Object.fromEntries(countByRelease.all().map((r) => [r.releaseId, r.count]));
  const releases = data.releases
    .map((r) => ({ ...r, interestCount: counts[r.id] || 0 }))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  res.json({ lastUpdated: data.lastUpdated, sourceNote: data.sourceNote, releases });
});

app.post('/api/interest', rateLimit, (req, res) => {
  const { releaseId, contactType, contactValue, quantity } = req.body || {};

  if (
    typeof releaseId !== 'string' ||
    typeof contactType !== 'string' ||
    typeof contactValue !== 'string'
  ) {
    return res.status(400).json({ error: 'Missing or invalid fields.' });
  }

  const data = loadReleases();
  const release = data.releases.find((r) => r.id === releaseId);
  if (!release) {
    return res.status(404).json({ error: 'Unknown release.' });
  }

  if (release.releaseDate < todayISO() || release.soldOut === true) {
    return res.status(410).json({ error: 'This release has already shipped and is no longer accepting registrations.' });
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    return res.status(400).json({ error: 'quantity must be a whole number between 1 and 10.' });
  }

  let normalizedValue;
  if (contactType === 'email') {
    const email = contactValue.trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    normalizedValue = email;
  } else if (contactType === 'phone') {
    const phone = normalizePhone(contactValue);
    if (!phone) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    normalizedValue = phone;
  } else {
    return res.status(400).json({ error: 'contactType must be "email" or "phone".' });
  }

  upsertInterest.run({
    releaseId,
    contactType,
    contactValue: normalizedValue,
    quantity: qty,
  });

  const row = getInterestByReleaseAndContact.get(releaseId, normalizedValue);

  // Prefer the bot (posts a "Send Confirmation Email" button); fall back to the
  // plain webhook — with no button, since incoming webhooks can't route
  // interactions — if the bot isn't configured.
  if (bot.isConfigured()) {
    bot.postInterestAlert(release, row);
  } else {
    notifyDiscord(release, { contactType, contactValue: normalizedValue, quantity: qty });
  }

  const counts = Object.fromEntries(countByRelease.all().map((r) => [r.releaseId, r.count]));
  res.status(201).json({ success: true, interestCount: counts[releaseId] || 1 });
});

bot.init({ loadReleases, sendConfirmationEmail });

app.listen(PORT, () => {
  console.log(`Topps release tracker running at http://localhost:${PORT}`);
});
