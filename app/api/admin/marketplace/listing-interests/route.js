import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { getAllListingInterestsForAdmin } from '../../../../../lib/db';

// Marketplace buyer interest — distinct from preorder-registrations (that's
// homepage release calendar signups; this is buyers interested in a
// seller's fixed-price listing). dollarValue = listingPrice * quantity, the
// same total math used for the Discord marketplace-interest alert.
export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const rows = getAllListingInterestsForAdmin.all().map((row) => ({
    ...row,
    dollarValue: row.listingPrice * row.quantity,
    cancelled: Boolean(row.cancelledAt),
  }));
  return NextResponse.json({ interests: rows });
}
