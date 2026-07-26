const fs = require('fs');
const path = require('path');
const { SPORT_EMOJI } = require('./utils');
const { sendEmail, isEmailConfigured } = require('./email');

const RELEASES_PATH = path.join(process.cwd(), 'data', 'releases.json');
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const SLOT_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScFl_nJ4tvYHxAmU6X-cQ5RoheIe4GJxTJnbQI5zUxqj4Ea3Q/viewform?usp=sharing&ouid=105723711896896295891';

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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
  if (!isEmailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  return sendEmail({
    to: contactValue,
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
  });
}

// Batch reminder sent to everyone who already registered interest by email
// for a release, as its date approaches — distinct from sendConfirmationEmail
// above, which fires once per registrant via the Discord button.
async function sendDropReminderEmail(release, { contactValue, quantity }) {
  if (!isEmailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  return sendEmail({
    to: contactValue,
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
  });
}

module.exports = {
  SLOT_FORM_URL,
  loadReleases,
  todayISO,
  escapeHtml,
  notifyDiscord,
  sendConfirmationEmail,
  sendDropReminderEmail,
};
