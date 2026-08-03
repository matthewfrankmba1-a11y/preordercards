const { sendEmail, isEmailConfigured } = require('./email');

const SITE_URL = process.env.SITE_URL || 'https://preordercards.com';

// Auto-fires when someone signs up via the homepage banner ("Free seller
// fees for a limited time"). Same tone/structure as the release-interest
// confirmation email in lib/releases.js — plain acknowledgment, no payment
// language, links to the parts of the site that matter next.
async function sendWelcomeEmail(email) {
  if (!isEmailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  return sendEmail({
    to: email,
    subject: 'Welcome to PreorderCards — free seller fees for a limited time',
    text: [
      "Thanks for signing up. We're opening our Verified Seller program with 0% introduction fees through the end of 2026 for our first authorized sellers. If you'd like to sell on PreorderCards, apply here:",
      `${SITE_URL}/verified-seller.html`,
      '',
      "Buying instead? Browse the release calendar to see what's dropping next and register interest for free, no payment required upfront:",
      `${SITE_URL}/`,
      '',
      'Looking for factory-sealed inventory available now instead of a future release? Check the Marketplace:',
      `${SITE_URL}/marketplace.html`,
      '',
      'Questions? Just reply to this email.',
      '',
      '— PreorderCards',
      '',
      'PreorderCards is an independent tracker and is not affiliated with Topps or any league/brand referenced.',
    ].join('\n'),
    html: `
      <p>Thanks for signing up. We're opening our <strong>Verified Seller program</strong> with
      0% introduction fees through the end of 2026 for our first authorized sellers. If you'd
      like to sell on PreorderCards, <a href="${SITE_URL}/verified-seller.html">apply here</a>.</p>
      <p>Buying instead? Browse the <a href="${SITE_URL}/">release calendar</a> to see what's
      dropping next and register interest for free, no payment required upfront.</p>
      <p>Looking for factory-sealed inventory available now instead of a future release? Check the
      <a href="${SITE_URL}/marketplace.html">Marketplace</a>.</p>
      <p>Questions? Just reply to this email.</p>
      <p>— PreorderCards</p>
      <p style="color:#888;font-size:12px">PreorderCards is an independent tracker and is
      not affiliated with Topps or any league/brand referenced.</p>
    `,
  });
}

module.exports = { sendWelcomeEmail };
