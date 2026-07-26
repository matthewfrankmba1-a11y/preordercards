import { NextResponse } from 'next/server';
import { insertListing, getListingsBySeller } from '../../../../lib/db';
import { requireSeller } from '../../../../lib/sellerAuthCore';

export async function POST(request) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  if (!seller.profileComplete) {
    return NextResponse.json(
      { error: 'Complete your seller profile (name, phone, and a payout method) before creating listings.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { description, sku, imageUrl, price, quantity } = body || {};

  if (typeof description !== 'string' || !description.trim()) {
    return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
  }
  if (description.length > 500) {
    return NextResponse.json({ error: 'Description is too long (max 500 characters).' }, { status: 400 });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return NextResponse.json({ error: 'Enter a valid price greater than 0.' }, { status: 400 });
  }
  const quantityNum = quantity === undefined ? 1 : Number(quantity);
  if (!Number.isInteger(quantityNum) || quantityNum < 1 || quantityNum > 10) {
    return NextResponse.json({ error: 'Quantity must be a whole number between 1 and 10.' }, { status: 400 });
  }
  if (imageUrl) {
    try {
      new URL(imageUrl);
    } catch {
      return NextResponse.json({ error: 'Image URL is not a valid URL.' }, { status: 400 });
    }
  }
  if (sku && String(sku).length > 100) {
    return NextResponse.json({ error: 'SKU is too long (max 100 characters).' }, { status: 400 });
  }

  const result = insertListing.run({
    sellerId: seller.id,
    description: description.trim(),
    sku: sku ? String(sku).trim() : null,
    imageUrl: imageUrl ? String(imageUrl).trim() : null,
    price: priceNum,
    quantity: quantityNum,
  });

  return NextResponse.json({ success: true, id: result.lastInsertRowid }, { status: 201 });
}

export async function GET(request) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const listings = getListingsBySeller.all(seller.id);
  return NextResponse.json({ listings });
}
