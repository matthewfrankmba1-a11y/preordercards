import { NextResponse } from 'next/server';
import { getAllListingsAdmin } from '../../../../../lib/db';
import { requireSeller } from '../../../../../lib/sellerAuthCore';
import { isSellerAdmin } from '../../../../../lib/marketplaceCore';

export async function GET(request) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  if (!isSellerAdmin(seller)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const listings = getAllListingsAdmin.all();
  return NextResponse.json({ listings });
}
