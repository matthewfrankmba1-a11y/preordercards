// Sending a one-off message to a customer from the admin panel, out of the
// same admin@ mailbox everything else uses.
//
// Deliberately not a mailing tool: recipients are capped, each message is
// its own send, and there's no list-selection. Mailing everyone is what the
// weekly newsletter is for, and it has the machinery that goes with it —
// unsubscribe links, suppression, per-issue tracking. This is for replying
// to a person.
const crypto = require('crypto');
const db = require('./db');
const { sendEmail, isEmailConfigured, EMAIL_FROM } = require('./email');
const { escapeHtml } = require('./releases');
const { EMAIL_RE } = require('./utils');

const MAX_RECIPIENTS = 50;
const MAX_SUBJECT = 200;
const MAX_BODY = 10000;
const SITE_URL = process.env.SITE_URL || 'https://preordercards.com';

// Splits on commas, semicolons, whitespace and newlines, so a pasted column
// of addresses works as well as a typed list.
function parseRecipients(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
  const seen = new Set();
  const valid = [];
  const invalid = [];

  for (const entry of raw) {
    const email = String(entry || '').trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    if (EMAIL_RE.test(email) && email.length <= 254) valid.push(email);
    else invalid.push(email);
  }

  return { valid, invalid };
}

// The body is typed by the admin, but it's still escaped before it reaches
// the HTML part: an unescaped ampersand or angle bracket in a price or a
// comparison would otherwise break the markup around it.
function renderBody(body) {
  const escaped = escapeHtml(body);
  // Escaping has already neutralised markup, so linkifying afterwards can't
  // reintroduce any — a pasted URL just becomes clickable.
  const linked = escaped.replace(
    /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
    '<a href="$1" style="color:#24406f;">$1</a>'
  );
  return linked
    .split(/\n{2,}/)
    .map((para) => `<p style="margin:0 0 1em;">${para.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function renderEmail(subject, body, { unsubscribeUrl = null } = {}) {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1f26;line-height:1.6;">
    <div style="background:#131a3e;color:#ffffff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700;">PreorderCards</div>
    <div style="background:#ffffff;padding:20px 18px;border:1px solid #e3e5ea;border-top:none;border-radius:0 0 10px 10px;">
      ${renderBody(body)}
    </div>
    <p style="font-size:12px;color:#6b7280;margin:14px 2px 0;">
      Sent by PreorderCards · <a href="${SITE_URL}" style="color:#6b7280;">${SITE_URL.replace(/^https?:\/\//, '')}</a><br />
      Reply to this email to reach us directly.${
        unsubscribeUrl
          ? `<br /><a href="${unsubscribeUrl}" style="color:#6b7280;">Unsubscribe from these updates</a>`
          : ''
      }
    </p>
  </div>
</body></html>`;

  const text =
    `${body}\n\n—\nPreorderCards · ${SITE_URL}\nReply to this email to reach us directly.` +
    (unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : '');
  return { subject, html, text };
}

// Returns { error } for anything that stops the whole send, or a per-recipient
// breakdown. Each address gets its own message rather than one message with
// many recipients: customers must not see each other's addresses.
async function sendAdminEmail({ to, subject, body, allowUnsubscribed = false }) {
  if (!isEmailConfigured()) return { error: 'RESEND_API_KEY is not configured, so nothing can be sent.' };

  const subjectText = String(subject || '').trim();
  if (subjectText.length < 1 || subjectText.length > MAX_SUBJECT) {
    return { error: `A subject is required (up to ${MAX_SUBJECT} characters).` };
  }

  const bodyText = String(body || '').trim();
  if (bodyText.length < 1 || bodyText.length > MAX_BODY) {
    return { error: `A message is required (up to ${MAX_BODY} characters).` };
  }

  const { valid, invalid } = parseRecipients(to);
  if (invalid.length > 0) {
    return { error: `Not a valid email address: ${invalid.slice(0, 5).join(', ')}` };
  }
  if (valid.length === 0) return { error: 'Add at least one recipient.' };
  if (valid.length > MAX_RECIPIENTS) {
    return { error: `${valid.length} recipients — this form sends to at most ${MAX_RECIPIENTS} at a time.` };
  }

  // Unsubscribing is a standing instruction about marketing, not about a
  // direct reply to something the person asked. So it's surfaced rather than
  // enforced: skipped by default, sendable with an explicit acknowledgement.
  const unsubscribed = valid.filter((email) => db.isNewsletterUnsubscribed.get(email));
  const recipients = allowUnsubscribed ? valid : valid.filter((email) => !unsubscribed.includes(email));
  if (recipients.length === 0) {
    return { error: 'Every address on that list has unsubscribed. Tick the box below to send anyway.' };
  }

  const message = renderEmail(subjectText, bodyText);
  const results = [];

  for (const email of recipients) {
    const result = await sendEmail({
      to: email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    db.insertAdminEmail.run({
      toEmail: email,
      subject: subjectText,
      body: bodyText,
      status: result.ok ? 'sent' : 'failed',
      resendEmailId: result.id || null,
      error: result.ok ? null : String(result.error || '').slice(0, 500),
    });
    results.push({ email, ok: result.ok, error: result.ok ? null : String(result.error || '').slice(0, 200) });
  }

  return {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
    skippedUnsubscribed: allowUnsubscribed ? [] : unsubscribed,
    from: EMAIL_FROM,
  };
}

// Validates a composed message and parks it for approval in Discord rather
// than sending it now. One recipient only: the Discord card names who it's
// going to, and a card that stood for twenty people would be approving a
// mailshot by reflex. Groups go through the Send button, where the count is
// in front of you.
function queueEmail({ to, subject, body, allowUnsubscribed = false }) {
  if (!isEmailConfigured()) return { error: 'RESEND_API_KEY is not configured, so nothing can be sent.' };

  const subjectText = String(subject || '').trim();
  if (subjectText.length < 1 || subjectText.length > MAX_SUBJECT) {
    return { error: `A subject is required (up to ${MAX_SUBJECT} characters).` };
  }

  const bodyText = String(body || '').trim();
  if (bodyText.length < 1 || bodyText.length > MAX_BODY) {
    return { error: `A message is required (up to ${MAX_BODY} characters).` };
  }

  const { valid, invalid } = parseRecipients(to);
  if (invalid.length > 0) return { error: `Not a valid email address: ${invalid.slice(0, 5).join(', ')}` };
  if (valid.length === 0) return { error: 'Add a recipient.' };
  if (valid.length > 1) {
    return { error: 'Approving from Discord is for one recipient at a time. Use Send for a group.' };
  }

  const [email] = valid;
  if (!allowUnsubscribed && db.isNewsletterUnsubscribed.get(email)) {
    return { error: `${email} has unsubscribed. Tick the box to send anyway.` };
  }

  const { id } = db.insertPendingEmail.get({ toEmail: email, subject: subjectText, body: bodyText });
  return { id, toEmail: email, subject: subjectText, body: bodyText };
}

// What the Discord button calls. Returns { ok, error } rather than throwing,
// because the bot reports the reason back to whoever tapped it.
async function sendQueuedEmail(id) {
  const row = db.getPendingEmail.get(Number(id));
  if (!row) return { ok: false, error: 'That queued email no longer exists.' };
  if (row.sentAt) return { ok: false, error: `Already sent, at ${row.sentAt}.` };
  if (!isEmailConfigured()) return { ok: false, error: 'RESEND_API_KEY is not configured.' };

  // Claimed before the send, so two taps a second apart can't both mail it —
  // the second finds no unsent row to claim.
  const claimed = db.markPendingEmailSent.run({ id: row.id, sentAt: new Date().toISOString() });
  if (claimed.changes !== 1) return { ok: false, error: 'That one was already sent.' };

  const message = renderEmail(row.subject, row.body);
  const result = await sendEmail({
    to: row.toEmail,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  db.insertAdminEmail.run({
    toEmail: row.toEmail,
    subject: row.subject,
    body: row.body,
    status: result.ok ? 'sent' : 'failed',
    resendEmailId: result.id || null,
    error: result.ok ? null : String(result.error || '').slice(0, 500),
  });

  // A failed send is released, so the Discord button can be tried again
  // rather than the message being stuck as sent when it never arrived.
  if (!result.ok) {
    db.db.prepare('UPDATE pending_emails SET sent_at = NULL WHERE id = ?').run(row.id);
    return { ok: false, error: String(result.error || 'Send failed.').slice(0, 300) };
  }

  return { ok: true, toEmail: row.toEmail };
}

// --- broadcast to every subscriber ----------------------------------------

// A send to the whole list is bulk mail whatever the subject says, so it
// gets what bulk mail owes people: a working unsubscribe link in the body
// and in the List-Unsubscribe header, addresses that have opted out left
// out with no override, and a row per recipient so a bounce weeks later
// can still be traced to the message that caused it.
//
// Runs in the background — hundreds of messages spaced apart takes minutes,
// longer than a request should be held open — and is resumable: a recipient
// who already has a row for this broadcast is skipped, so a crash or a
// redeploy mid-run costs nothing.
// Guards against a second start from the panel. It is per module instance,
// and Next bundles a copy of this file per route, so it is a convenience
// rather than a lock — the real protection against double-mailing is the
// row per recipient, which a second run skips.
let broadcastRunning = false;

function isBroadcastRunning() {
  return broadcastRunning;
}

// Everyone currently on the newsletter list. The query behind this already
// drops unsubscribes, hard bounces and spam complaints.
function broadcastRecipients() {
  const { listRecipients } = require('./newsletter');
  return listRecipients('9999-12-31');
}

async function sendBroadcast({ subject, body, broadcastId = null }) {
  if (!isEmailConfigured()) return { error: 'RESEND_API_KEY is not configured, so nothing can be sent.' };
  const { adminUnsubscribeLink } = require('./newsletter');
  if (!process.env.NEWSLETTER_SECRET && !process.env.ADMIN_SECRET) {
    return { error: 'NEWSLETTER_SECRET (or ADMIN_SECRET) must be set — it signs the unsubscribe links.' };
  }
  if (broadcastRunning) return { error: 'A broadcast is already running.' };

  const subjectText = String(subject || '').trim();
  if (subjectText.length < 1 || subjectText.length > MAX_SUBJECT) {
    return { error: `A subject is required (up to ${MAX_SUBJECT} characters).` };
  }
  const bodyText = String(body || '').trim();
  if (bodyText.length < 1 || bodyText.length > MAX_BODY) {
    return { error: `A message is required (up to ${MAX_BODY} characters).` };
  }

  const recipients = broadcastRecipients();
  if (recipients.length === 0) return { error: 'There is nobody on the subscriber list.' };

  const id = broadcastId || crypto.randomBytes(8).toString('hex');
  broadcastRunning = true;

  const run = (async () => {
    const already = new Map(db.listBroadcastRecipients.all(id).map((r) => [r.toEmail, r.status]));
    const delayMs = Number(process.env.NEWSLETTER_SEND_DELAY_MS || 150);
    let sent = 0;
    let failed = 0;

    for (const email of recipients) {
      // 'failed' is worth another attempt — Resend rejected the request,
      // not the mailbox. Anything else is final for this broadcast.
      const existing = already.get(email);
      if (existing && existing !== 'failed') continue;

      // A retry reopens the recipient's existing row; a first attempt makes
      // one. Either way there is exactly one row per person per broadcast,
      // so the delivered and bounced counts mean what they say.
      const reopened = existing === 'failed' ? db.reopenFailedBroadcastRow.get({ broadcastId: id, toEmail: email }) : null;
      const rowId =
        reopened?.id ||
        db.insertPendingAdminEmail.get({ toEmail: email, subject: subjectText, body: bodyText, broadcastId: id }).id;

      const message = renderEmail(subjectText, bodyText, { unsubscribeUrl: adminUnsubscribeLink(rowId) });
      const result = await sendEmail({
        to: email,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          'List-Unsubscribe': `<${adminUnsubscribeLink(rowId)}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      db.markAdminEmailResult.run({
        id: rowId,
        status: result.ok ? 'sent' : 'failed',
        resendEmailId: result.id || null,
        error: result.ok ? null : String(result.error || '').slice(0, 500),
      });

      if (result.ok) sent += 1;
      else failed += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }

    return { broadcastId: id, subject: subjectText, recipients: recipients.length, sent, failed };
  })()
    .finally(() => {
      broadcastRunning = false;
    });

  return { started: true, broadcastId: id, recipients: recipients.length, run };
}

module.exports = {
  MAX_BODY,
  MAX_RECIPIENTS,
  MAX_SUBJECT,
  parseRecipients,
  broadcastRecipients,
  isBroadcastRunning,
  queueEmail,
  renderEmail,
  sendBroadcast,
  sendAdminEmail,
  sendQueuedEmail,
};
