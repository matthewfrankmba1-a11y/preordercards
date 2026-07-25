require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const {
  upsertInterest,
  countByRelease,
  getInterestByReleaseAndContact,
  insertSlotSubmission,
  getPendingReminderInterestsByRelease,
  markReminderSent,
  markAllPendingRemindersSentExcept,
  insertDiscountSignup,
} = require('./db');
const bot = require('./bot');
const { runStatsSummary, startStatsSummarySchedule } = require('./statsSummary');

const app = express();
// Render (and most PaaS hosts) put the app behind a reverse proxy. Without this,
// req.ip returns the proxy's address for every request, so the rate limiter below
// would count all visitors as one IP instead of limiting per real client.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const RELEASES_PATH = path.join(__dirname, 'data', 'releases.json');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCOUNT_SIGNUP_WEBHOOK_URL = process.env.DISCOUNT_SIGNUP_WEBHOOK_URL;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PreorderCards <admin@preordercards.com>';
const SLOT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScFl_nJ4tvYHxAmU6X-cQ5RoheIe4GJxTJnbQI5zUxqj4Ea3Q/viewform?usp=sharing&ouid=105723711896896295891';

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
        subject: `We've received your inquiry — ${release.title}`,
        text: [
          `We've received your inquiry about ${release.title} (releasing ${release.releaseDate}), quantity ${quantity}.`,
          '',
          "No payment was collected — this acknowledges your inquiry. We'll be in touch when the product is released and we've secured our allocation.",
          '',
          "For Slots: you'll know the service fee per successful box checkout ahead of the scheduled release. Orders ship directly from the retailer to you — the retailer handles product billing, and the service fee is paid separately via PayPal, Venmo, or Stripe.",
          '',
          'For Preorder: the price per box is set once the market has established an average from the first 5-10 public sales, discounted 6-7% off that average, with free shipping.',
          '',
          "If you're looking to lock in a slot, fill out our Slot Details form here:",
          SLOT_FORM_URL,
          '',
          'You can also find this same link anytime at the top of our homepage under "Submit Slot Details."',
          '',
          '— PreorderCards',
          '',
          'PreorderCards is an independent tracker and is not affiliated with Topps or any league/brand referenced.',
        ].join('\n'),
        html: `
          <p>We've received your inquiry about <strong>${escapeHtml(release.title)}</strong>
          (releasing ${release.releaseDate}), quantity ${quantity}.</p>
          <p>No payment was collected — this acknowledges your inquiry. We'll be in touch
          when the product is released and we've secured our allocation.</p>
          <p><strong>For Slots:</strong> you'll know the service fee per successful box checkout
          ahead of the scheduled release. Orders ship directly from the retailer to you — the
          retailer handles product billing, and the service fee is paid separately via PayPal,
          Venmo, or Stripe.</p>
          <p><strong>For Preorder:</strong> the price per box is set once the market has
          established an average from the first 5-10 public sales, discounted 6-7% off that
          average, with free shipping.</p>
          <p>If you're looking to lock in a slot, fill out our
          <a href="${SLOT_FORM_URL}">Slot Details form</a>.
          You can also find this same link anytime at the top of our homepage under
          "Submit Slot Details."</p>
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

// Batch reminder sent to everyone who already registered interest by email
// for a release, as its date approaches — distinct from sendConfirmationEmail
// above, which fires once per registrant via the Discord button.
async function sendDropReminderEmail(release, { contactValue, quantity }) {
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
        subject: `${release.title} drops soon — here's what's next`,
        text: [
          `This confirms we've received your preorder inquiry for ${release.title} (quantity ${quantity}) — the drop is coming up on ${release.releaseDate}.`,
          '',
          "You've got two options:",
          '',
          'SLOTS — less expensive than a traditional preorder. If you\'d rather run a slot, fill out our Slot Details form:',
          SLOT_FORM_URL,
          '',
          "TRADITIONAL PREORDER — no action needed. We'll send an allocation email once the release is out and we've secured stock.",
          '',
          'Questions? Just reply to this email.',
          '',
          '— PreorderCards',
          '',
          'PreorderCards is an independent tracker and is not affiliated with Topps or any league/brand referenced.',
        ].join('\n'),
        html: `
          <p>This confirms we've received your preorder inquiry for <strong>${escapeHtml(release.title)}</strong>
          (quantity ${quantity}) — the drop is coming up on ${release.releaseDate}.</p>
          <p>You've got two options:</p>
          <p><strong>Slots</strong> — less expensive than a traditional preorder. If you'd rather run a
          slot, fill out our <a href="${SLOT_FORM_URL}">Slot Details form</a>.</p>
          <p><strong>Traditional preorder</strong> — no action needed. We'll send an allocation email
          once the release is out and we've secured stock.</p>
          <p>Questions? Just reply to this email.</p>
          <p>— PreorderCards</p>
          <p style="color:#888;font-size:12px">PreorderCards is an independent tracker and is
          not affiliated with Topps or any league/brand referenced.</p>
        `,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Drop reminder email failed:', res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('Drop reminder email failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// Extend the default CSP (script-src 'self' etc.) just enough to allow Google
// Analytics' script and beacon requests — everything else stays locked down.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", 'https://www.googletagmanager.com'],
        'connect-src': [
          "'self'",
          'https://www.google-analytics.com',
          'https://*.google-analytics.com',
          'https://*.analytics.google.com',
        ],
        // 'https:' (not specific domains) because sellers paste arbitrary stock
        // photo URLs for marketplace listings — we can't allowlist hosts in advance.
        'img-src': ["'self'", 'data:', 'https:'],
      },
    },
  })
);
app.use(express.json({ limit: '10kb' }));
app.use('/api/seller', require('./sellerAuth').router);
app.use('/api', require('./marketplace'));
app.use(express.static(path.join(__dirname, 'public')));

function loadReleases() {
  const raw = fs.readFileSync(RELEASES_PATH, 'utf8');
  return JSON.parse(raw);
}

const SUCCESS_PHOTOS_DIR = path.join(__dirname, 'public', 'success');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

// Auto-discovers whatever image files have been dropped into public/success/ —
// no manifest to maintain, just add a file and it shows up, newest first.
app.get('/api/success-photos', (req, res) => {
  let photos = [];
  try {
    photos = fs
      .readdirSync(SUCCESS_PHOTOS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => {
        const fullPath = path.join(SUCCESS_PHOTOS_DIR, entry.name);
        return { filename: entry.name, url: `/success/${entry.name}`, mtimeMs: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map(({ filename, url }) => ({ filename, url }));
  } catch (err) {
    // Directory missing is fine — just means no photos yet.
  }
  res.json({ photos });
});

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

// Homepage banner: "5% off your first order" email capture. Not tied to any
// specific release — just a lead list, posted to its own dedicated webhook.
app.post('/api/discount-signup', rateLimit, async (req, res) => {
  const { email } = req.body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 254) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const result = insertDiscountSignup.run(normalizedEmail);
  const isNew = result.changes > 0;

  if (isNew && DISCOUNT_SIGNUP_WEBHOOK_URL) {
    try {
      await fetch(DISCOUNT_SIGNUP_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'New Preorder!',
          embeds: [
            {
              title: '🎉 New 5% discount signup',
              color: 13770556,
              fields: [{ name: 'Email', value: normalizedEmail }],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
    } catch (err) {
      console.error('Discount signup Discord webhook failed:', err.message);
    }
  }

  res.status(201).json({ success: true, alreadySignedUp: !isNew });
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

// Called by the Slot Details Google Form's Apps Script alongside its Discord
// post, purely to log a count for the stats-summary — never triggers a
// notification itself.
app.post('/api/slot-submission-ping', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  insertSlotSubmission.run();
  res.json({ success: true });
});

// Manually fires the 6-hourly stats summary early, for testing — does not
// affect the schedule (still runs every INTERVAL_MS from server start).
app.post('/api/admin/stats-summary/run', async (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const result = await runStatsSummary();
  res.json({ success: true, ...result });
});

// Batch-sends the "drop is coming up" reminder to everyone who registered
// interest by email in a specific release and hasn't already received it.
// Deliberately manual (per release, admin-triggered) rather than scheduled.
app.post('/api/admin/send-drop-reminder', async (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const releaseId = req.body?.releaseId;
  if (!releaseId) return res.status(400).json({ error: 'Missing releaseId.' });

  const data = loadReleases();
  const release = data.releases.find((r) => r.id === releaseId);
  if (!release) return res.status(404).json({ error: 'Release not found.' });
  if (release.soldOut === true || release.releaseDate < todayISO()) {
    return res.status(400).json({ error: 'This release is already sold out or past its release date.' });
  }

  const pending = getPendingReminderInterestsByRelease.all(releaseId);
  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await sendDropReminderEmail(release, { contactValue: row.contactValue, quantity: row.quantity });
    if (result.ok) {
      markReminderSent.run({ id: row.id, sentAt: new Date().toISOString() });
      sent += 1;
    } else {
      failed += 1;
    }
  }
  res.json({ success: true, releaseId, releaseTitle: release.title, sent, failed, totalPending: pending.length });
});

// Skips everyone else pending for a release (marks reminded without
// emailing) so a single address can be tested in isolation before firing
// a real batch send to everyone.
app.post('/api/admin/skip-drop-reminder-except', (req, res) => {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  const { releaseId, exceptContactValue } = req.body || {};
  if (!releaseId || !exceptContactValue) {
    return res.status(400).json({ error: 'Missing releaseId or exceptContactValue.' });
  }
  const result = markAllPendingRemindersSentExcept.run({
    releaseId,
    excludeContactValue: String(exceptContactValue).trim().toLowerCase(),
    sentAt: new Date().toISOString(),
  });
  res.json({ success: true, skipped: result.changes });
});

bot.init({ loadReleases, sendConfirmationEmail });
startStatsSummarySchedule();

app.listen(PORT, () => {
  console.log(`Topps release tracker running at http://localhost:${PORT}`);
});
