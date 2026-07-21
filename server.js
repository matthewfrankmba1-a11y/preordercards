require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const { upsertInterest, countByRelease } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const RELEASES_PATH = path.join(__dirname, 'data', 'releases.json');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Fire-and-forget Discord alert — never let a webhook hiccup block or fail the signup itself.
async function notifyDiscord(release, { contactType, contactValue, quantity }) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [
          {
            title: 'New interest registration',
            color: 0xd21f3c,
            fields: [
              { name: 'Release', value: release.title },
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

  if (release.releaseDate < todayISO()) {
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

  notifyDiscord(release, { contactType, contactValue: normalizedValue, quantity: qty });

  const counts = Object.fromEntries(countByRelease.all().map((r) => [r.releaseId, r.count]));
  res.status(201).json({ success: true, interestCount: counts[releaseId] || 1 });
});

app.listen(PORT, () => {
  console.log(`Topps release tracker running at http://localhost:${PORT}`);
});
