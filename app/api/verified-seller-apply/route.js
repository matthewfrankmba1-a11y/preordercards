import { NextResponse } from 'next/server';
import { normalizePhone, createRateLimiter } from '../../../lib/utils';
import { sendEmail, isEmailConfigured } from '../../../lib/email';
import { notifyVerifiedSellerApplicationDiscord } from '../../../lib/marketplaceCore';

const ADMIN_EMAIL = 'admin@preordercards.com';
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

// Own bucket, independent from the other route groups' limiters.
const rateLimit = createRateLimiter();

function requiredField(value, max) {
  const trimmed = String(value || '').trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

export async function POST(request) {
  const check = rateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Invalid submission.' }, { status: 400 });
  }

  const name = requiredField(formData.get('name'), 200);
  if (!name) {
    return NextResponse.json({ error: 'Enter your name.' }, { status: 400 });
  }

  const normalizedPhone = normalizePhone(String(formData.get('phone') || ''));
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  const availability = requiredField(formData.get('availability'), 300);
  if (!availability) {
    return NextResponse.json({ error: 'Let us know a good time to reach you.' }, { status: 400 });
  }

  const itemsToSell = requiredField(formData.get('itemsToSell'), 500);
  if (!itemsToSell) {
    return NextResponse.json({ error: 'Tell us what you want to sell.' }, { status: 400 });
  }

  const quantities = requiredField(formData.get('quantities'), 200);
  if (!quantities) {
    return NextResponse.json({ error: 'Tell us the quantities you can supply.' }, { status: 400 });
  }

  const whyGoodSeller = requiredField(formData.get('whyGoodSeller'), 1000);
  if (!whyGoodSeller) {
    return NextResponse.json({ error: "Tell us why you'd be a good seller." }, { status: 400 });
  }

  const referredBy = requiredField(formData.get('referredBy'), 200);

  const screenshot = formData.get('screenshot');
  if (!screenshot || typeof screenshot === 'string') {
    return NextResponse.json({ error: 'Upload a screenshot of your StockX sales history.' }, { status: 400 });
  }
  if (screenshot.size > MAX_SCREENSHOT_BYTES) {
    return NextResponse.json({ error: 'Screenshot is too large (max 5MB).' }, { status: 400 });
  }
  if (!SCREENSHOT_MIME_TYPES.has(screenshot.type)) {
    return NextResponse.json({ error: 'Screenshot must be a PNG, JPEG, or WEBP image.' }, { status: 400 });
  }

  const application = { name, phone: normalizedPhone, availability, itemsToSell, quantities, whyGoodSeller, referredBy };

  await notifyVerifiedSellerApplicationDiscord(application, screenshot);

  if (isEmailConfigured()) {
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: 'New verified seller application',
      text: [
        `Name: ${name}`,
        `Phone: ${normalizedPhone}`,
        `Best time to call: ${availability}`,
        referredBy ? `Referred by: ${referredBy}` : null,
        `Wants to sell: ${itemsToSell}`,
        `Quantities: ${quantities}`,
        `Why they'd be a good seller: ${whyGoodSeller}`,
        'StockX screenshot: sent to Discord, not attached to this email.',
      ].filter(Boolean).join('\n'),
    });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
