import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { markWelcomeEmailBouncedByResendId } from '../../../../lib/db';

const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
// The verify() call needs a Resend client instance, but doesn't use the API
// key for anything — an empty client is fine here since this route never
// sends mail, only verifies inbound webhook signatures.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder');

// Resend delivery-event webhook (bounces, deliveries, etc. — see
// resend.com/docs/dashboard/webhooks). Must be registered in Resend's
// dashboard pointing at POST https://<site>/api/webhooks/resend, with
// RESEND_WEBHOOK_SECRET set to the signing secret it gives you there.
// Currently only acts on email.bounced, matched back to a discount_signups
// row via the Resend-assigned email ID stored at send time — other event
// types (delivered, opened, etc.) are accepted and ignored.
export async function POST(request) {
  if (!RESEND_WEBHOOK_SECRET) {
    // Not configured yet — ack without processing rather than 500ing on
    // every retry Resend sends for an unrecognized/unverifiable endpoint.
    console.error('Resend webhook received but RESEND_WEBHOOK_SECRET is not configured.');
    return NextResponse.json({ received: true });
  }

  // Signature verification needs the exact raw bytes Resend signed — must
  // read as text before any JSON parsing, and never re-stringify.
  const rawBody = await request.text();

  let event;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get('svix-id'),
        timestamp: request.headers.get('svix-timestamp'),
        signature: request.headers.get('svix-signature'),
      },
      webhookSecret: RESEND_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error('Resend webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  if (event.type === 'email.bounced') {
    markWelcomeEmailBouncedByResendId.run(event.data.email_id);
  }

  return NextResponse.json({ received: true });
}
