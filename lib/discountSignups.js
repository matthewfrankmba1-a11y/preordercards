const { sendEmail, isEmailConfigured } = require('./email');

const SITE_URL = process.env.SITE_URL || 'https://preordercards.com';

// Auto-fires when someone signs up via the homepage discount banner ("Get
// 5% off your first order"). Same tone/structure as the release-interest
// confirmation email in lib/releases.js — plain acknowledgment, no payment
// language, links to the parts of the site that matter next.
async function sendWelcomeEmail(email) {
  if (!isEmailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  return sendEmail({
    to: email,
    subject: "Welcome to PreorderCards — here's your 5% off",
    text: [
      "Thanks for signing up — you're locked in for 5% off your first order.",
      '',
      "Browse the release calendar to see what's dropping next and register interest for free, no payment required upfront:",
      `${SITE_URL}/`,
      '',
      'Looking for factory-sealed inventory available now instead of a future release? Check the Marketplace:',
      `${SITE_URL}/marketplace.html`,
      '',
      "We're also opening up our Verified Seller program — 0% introduction fees through the end of 2026 for our first authorized sellers. If you'd rather sell than buy, apply here:",
      `${SITE_URL}/verified-seller.html`,
      '',
      'Questions? Just reply to this email.',
      '',
      '— PreorderCards',
      '',
      'PreorderCards is an independent tracker and is not affiliated with Topps or any league/brand referenced.',
    ].join('\n'),
    html: `
      <p>Thanks for signing up — you're locked in for <strong>5% off your first order</strong>.</p>
      <p>Browse the <a href="${SITE_URL}/">release calendar</a> to see what's dropping next and register
      interest for free, no payment required upfront.</p>
      <p>Looking for factory-sealed inventory available now instead of a future release? Check the
      <a href="${SITE_URL}/marketplace.html">Marketplace</a>.</p>
      <p>We're also opening up our <strong>Verified Seller program</strong> — 0% introduction fees
      through the end of 2026 for our first authorized sellers. If you'd rather sell than buy,
      <a href="${SITE_URL}/verified-seller.html">apply here</a>.</p>
      <p>Questions? Just reply to this email.</p>
      <p>— PreorderCards</p>
      <p style="color:#888;font-size:12px">PreorderCards is an independent tracker and is
      not affiliated with Topps or any league/brand referenced.</p>
    `,
  });
}

module.exports = { sendWelcomeEmail };
