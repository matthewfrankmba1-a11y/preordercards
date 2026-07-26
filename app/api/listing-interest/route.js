import { NextResponse } from 'next/server';
import { getListingById, upsertListingInterest, getSellerById } from '../../../lib/db';
import { EMAIL_RE, normalizePhone, createRateLimiter } from '../../../lib/utils';
import { FEE_RATE, shippingFee, notifyMarketplaceDiscord, sendSellerAlertEmail } from '../../../lib/marketplaceCore';

// Own bucket, independent from the other route groups' limiters.
const rateLimit = createRateLimiter();

export async function POST(request) {
  const check = rateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { listingId, contactType, contactValue, quantity } = body || {};

  if (listingId === undefined || listingId === null) {
    return NextResponse.json({ error: 'Missing listingId.' }, { status: 400 });
  }
  const listing = getListingById.get(Number(listingId));
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }
  if (listing.status !== 'active') {
    return NextResponse.json({ error: 'This listing is no longer available.' }, { status: 410 });
  }

  const quantityNum = quantity === undefined ? 1 : Number(quantity);
  const maxQty = Math.min(10, listing.quantity);
  if (!Number.isInteger(quantityNum) || quantityNum < 1 || quantityNum > maxQty) {
    return NextResponse.json({ error: `Quantity must be a whole number between 1 and ${maxQty}.` }, { status: 400 });
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

  upsertListingInterest.run({
    listingId: listing.id,
    contactType,
    contactValue: normalizedValue,
    quantity: quantityNum,
  });

  const seller = getSellerById.get(listing.seller_id);
  notifyMarketplaceDiscord(
    { ...listing, sellerName: seller ? seller.display_name : 'Unknown seller', sellerEmail: seller ? seller.email : null },
    { contactType, contactValue: normalizedValue, quantity: quantityNum }
  );
  sendSellerAlertEmail(seller, listing, quantityNum);

  const buyerPays = listing.price * quantityNum * (1 + FEE_RATE) + shippingFee(quantityNum);
  return NextResponse.json({ success: true, buyerPays: Math.round(buyerPays * 100) / 100 }, { status: 201 });
}
