import { NextResponse } from 'next/server';
import { getListingById, deleteListingInterestsByListing, deleteListingByIdAdmin } from '../../../../../../../lib/db';
import { requireSeller } from '../../../../../../../lib/sellerAuthCore';
import { isSellerAdmin } from '../../../../../../../lib/marketplaceCore';

export async function POST(request, { params }) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  if (!isSellerAdmin(seller)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  const listing = getListingById.get(id);
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }
  deleteListingInterestsByListing.run(id);
  deleteListingByIdAdmin.run(id);
  return NextResponse.json({ success: true });
}
