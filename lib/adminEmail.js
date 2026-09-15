// Sending a one-off message to a customer from the admin panel, out of the
// same admin@ mailbox everything else uses.
//
// Deliberately not a mailing tool: recipients are capped, each message is
// its own send, and there's no list-selection. Mailing everyone is what the
// weekly newsletter is for, and it has the machinery that goes with it —
// unsubscribe links, suppression, per-issue tracking. This is for replying
// to a person.
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

function renderEmail(subject, body) {
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
  <div style="max-width:560px;margin:0 auto;padding:24px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1f26;line-height:1.6;">
    <div style="background:#131a3e;color:#ffffff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:700;">PreorderCards</div>
    <div style="background:#ffffff;padding:20px 18px;border:1px solid #e3e5ea;border-top:none;border-radius:0 0 10px 10px;">
      ${renderBody(body)}
    </div>
    <p style="font-size:12px;color:#6b7280;margin:14px 2px 0;">
      Sent by PreorderCards · <a href="${SITE_URL}" style="color:#6b7280;">${SITE_URL.replace(/^https?:\/\//, '')}</a><br />
      Reply to this email to reach us directly.
    </p>
  </div>
</body></html>`;

  const text = `${body}\n\n—\nPreorderCards · ${SITE_URL}\nReply to this email to reach us directly.`;
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

module.exports = { MAX_BODY, MAX_RECIPIENTS, MAX_SUBJECT, parseRecipients, renderEmail, sendAdminEmail };
