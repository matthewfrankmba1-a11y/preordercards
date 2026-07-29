// Shared Resend-calling helper — was copy-pasted (with the same
// fetch/error-handling boilerplate) across server.js, sellerAuth.js, and
// marketplace.js. Callers still decide their own "not configured"/failure
// messaging, since some are admin-facing (fine to show Resend's raw error)
// and some are seller-facing (should stay generic) — this only removes the
// duplicated request/response plumbing, not each call site's own wording.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PreorderCards <admin@preordercards.com>';

function isEmailConfigured() {
  return Boolean(RESEND_API_KEY);
}

async function sendEmail({ to, subject, text, html, attachments }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        ...(text !== undefined ? { text } : {}),
        ...(html !== undefined ? { html } : {}),
        ...(attachments !== undefined ? { attachments } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Resend email failed:', res.status, body);
      return { ok: false, error: `Resend ${res.status}: ${body}` };
    }
    // { "id": "..." } — the Resend-assigned email ID, needed to match a
    // later bounce webhook (POST /api/webhooks/resend) back to this send.
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: body.id };
  } catch (err) {
    console.error('Resend email failed:', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail, isEmailConfigured, EMAIL_FROM };
