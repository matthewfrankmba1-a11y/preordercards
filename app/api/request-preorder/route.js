import { NextResponse } from 'next/server';
import { insertPreorderRequest } from '../../../lib/db';
import { EMAIL_RE, normalizePhone, createRateLimiter } from '../../../lib/utils';

// Own bucket, independent from the other route groups' limiters.
const rateLimit = createRateLimiter();

const MAX_PRODUCT = 200;
const MAX_NOTES = 1000;
const MAX_QUANTITY = 100;

// A request for something that isn't on the calendar. Unlike interest
// registration there's no release to validate against — the product is
// whatever the customer typed — so the guards here are about length and
// contactability rather than matching an id.
export async function POST(request) {
  const check = rateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { product, contactType, contactValue, quantity, notes, releaseDate } = body || {};

  const productText = String(product || '').trim();
  if (productText.length < 3 || productText.length > MAX_PRODUCT) {
    return NextResponse.json(
      { error: `Tell us which product you're after (up to ${MAX_PRODUCT} characters).` },
      { status: 400 }
    );
  }

  const notesText = String(notes || '').trim();
  if (notesText.length > MAX_NOTES) {
    return NextResponse.json({ error: `Keep the details under ${MAX_NOTES} characters.` }, { status: 400 });
  }

  // Optional, and the customer's claim rather than ours — nothing is
  // scheduled off it. Round-tripping through Date catches a well-formed date
  // that doesn't exist, like 2026-02-31, which the regex alone would pass.
  const dateText = String(releaseDate || '').trim();
  let requestedDate = null;
  if (dateText) {
    // The round-trip catches a well-formed date that doesn't exist, like
    // 2026-02-31. The isNaN check has to come first: a month of 13 makes an
    // Invalid Date, whose toISOString() throws rather than returning
    // something that fails the comparison.
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T00:00:00Z`) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateText;
    if (!valid) {
      return NextResponse.json({ error: 'That release date is not a valid date.' }, { status: 400 });
    }
    requestedDate = dateText;
  }

  const qty = quantity === undefined || quantity === '' ? 1 : Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
    return NextResponse.json(
      { error: `Quantity must be a whole number between 1 and ${MAX_QUANTITY}.` },
      { status: 400 }
    );
  }

  let normalizedValue;
  if (contactType === 'email') {
    const email = String(contactValue || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    normalizedValue = email;
  } else if (contactType === 'phone') {
    const phone = normalizePhone(String(contactValue || ''));
    if (!phone) {
      return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
    }
    normalizedValue = phone;
  } else {
    return NextResponse.json({ error: 'contactType must be "email" or "phone".' }, { status: 400 });
  }

  insertPreorderRequest.run({
    product: productText,
    quantity: qty,
    contactType,
    contactValue: normalizedValue,
    notes: notesText,
    releaseDate: requestedDate,
  });

  // Fire-and-forget, like the interest alert: a webhook hiccup must not fail
  // a request we've already recorded.
  notifyPreorderRequest({
    product: productText,
    quantity: qty,
    contactType,
    contactValue: normalizedValue,
    notes: notesText,
    releaseDate: requestedDate,
  });

  return NextResponse.json({ success: true }, { status: 201 });
}

async function notifyPreorderRequest({ product, quantity, contactType, contactValue, notes, releaseDate }) {
  const webhook = process.env.PREORDER_REQUEST_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;

  const fields = [
    { name: 'Product', value: product },
    { name: 'Quantity', value: String(quantity), inline: true },
    { name: contactType === 'email' ? 'Email' : 'Phone', value: contactValue, inline: true },
  ];
  if (releaseDate) fields.push({ name: 'Release date (per customer)', value: releaseDate, inline: true });
  if (notes) fields.push({ name: 'Details', value: notes });

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Every field here is text a stranger typed into a public form, so
        // mentions are disarmed outright — otherwise "@everyone" in the
        // product box would ping the whole server.
        allowed_mentions: { parse: [] },
        embeds: [
          {
            title: '🙋 Preorder request',
            color: 0x24406f,
            fields,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Preorder request webhook failed:', err.message);
  }
}
