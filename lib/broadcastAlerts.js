// Discord notices for a broadcast: one when the send finishes, and one each
// time a bounce or spam complaint comes back from Resend afterwards.
//
// The two are separate on purpose. Delivery is known the moment the send
// ends; bounces arrive minutes to hours later, over the webhook, so a
// bounce count in the completion notice would always read zero and teach
// the owner to ignore it. The bounce notice carries the running total for
// that broadcast instead, which is the number that actually matters for
// the sending domain's reputation.
const db = require('./db');

const SITE_URL = process.env.SITE_URL || 'https://preordercards.com';

function webhookUrl() {
  return process.env.NEWSLETTER_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
}

async function post(body) {
  const webhook = webhookUrl();
  if (!webhook) return false;
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Everything here is the owner's own text, but mentions are parsed
      // off anyway: a subject line with "@everyone" in it shouldn't ping.
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
    });
    return res.ok;
  } catch (err) {
    console.error('Broadcast Discord alert failed:', err.message);
    return false;
  }
}

async function notifyBroadcastFinished(result) {
  // Counted from the rows rather than from the run, so a broadcast finished
  // across two runs reports the whole send and not just the last pass.
  const summary = db.broadcastSummary.get({ broadcastId: result.broadcastId }) || {};
  const sent = summary.sent ?? result.sent;
  const failed = summary.failed ?? result.failed;
  const delivered = sent > 0;
  const fields = [
    { name: 'Delivered', value: String(sent), inline: true },
    { name: 'Subscribers', value: String(result.recipients), inline: true },
  ];
  if (failed > 0) fields.push({ name: 'Failed', value: String(failed), inline: true });
  if (summary.pending > 0) {
    fields.push({ name: 'Not attempted', value: `${summary.pending} — send again to finish`, inline: true });
  }
  fields.push({ name: 'Bounces', value: 'Reported here as they come in', inline: false });

  return post({
    username: 'PreorderCards Email',
    embeds: [
      {
        title: delivered ? '📣 Broadcast sent to subscribers' : '⚠️ Broadcast failed to send',
        description: result.subject,
        color: delivered ? 0x1a7f37 : 0xb3261e,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

// Posted per event rather than batched: a bounce is rare and individually
// worth seeing, and the running total next to it answers "is this one bad
// address or is something wrong with the send?" without opening the panel.
async function notifyBroadcastBounce({ email, broadcastId, kind }) {
  const summary = broadcastId ? db.broadcastSummary.get({ broadcastId }) : null;
  const fields = [{ name: kind === 'complaint' ? 'Marked as spam by' : 'Bounced', value: email }];

  if (summary) {
    const rate = summary.sent > 0 ? ((summary.bounced / summary.sent) * 100).toFixed(1) : '0.0';
    fields.push(
      { name: 'Bounces in this send', value: `${summary.bounced} of ${summary.sent} (${rate}%)`, inline: true },
      { name: 'Complaints', value: String(summary.complained), inline: true },
      { name: 'Subject', value: summary.subject }
    );
  }

  return post({
    username: 'PreorderCards Email',
    embeds: [
      {
        title: kind === 'complaint' ? '🚩 Spam complaint' : '📪 Bounce',
        color: 0xd9a400,
        fields,
        // A complaint also unsubscribes them, which the owner should know
        // happened without having to remember the rule.
        footer: { text: kind === 'complaint' ? 'Unsubscribed automatically' : `${SITE_URL}/marketplace-admin.html` },
        timestamp: new Date().toISOString(),
      },
    ],
  });
}

module.exports = { notifyBroadcastBounce, notifyBroadcastFinished };
