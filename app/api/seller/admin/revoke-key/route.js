import { NextResponse } from 'next/server';
import {
  getInviteKey,
  getSellerByInviteKey,
  countListingsBySeller,
  deleteListingInterestsBySeller,
  deleteListingsBySeller,
  deleteSessionsBySeller,
  deleteSellerById,
  deleteInviteKeyByCode,
} from '../../../../../lib/db';
import { checkAdminSecret } from '../../../../../lib/utils';

// Permanently revokes a key: deletes the seller account it created (if any),
// their listings, listing interests, and sessions, then deletes the key
// itself. Irreversible — meant to be called after the admin has confirmed
// what it will affect via /admin/lookup-key.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const keyCode = String(body?.keyCode || '').trim().toUpperCase();
  const keyRow = getInviteKey.get(keyCode);
  if (!keyRow) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });

  const seller = keyRow.used_by_seller_id ? getSellerByInviteKey.get(keyCode) : null;
  let removedListings = 0;
  if (seller) {
    removedListings = countListingsBySeller.get(seller.id).c;
    deleteListingInterestsBySeller.run(seller.id);
    deleteListingsBySeller.run(seller.id);
    deleteSessionsBySeller.run(seller.id);
    deleteSellerById.run(seller.id);
  }
  deleteInviteKeyByCode.run(keyCode);

  return NextResponse.json({ success: true, hadSeller: Boolean(seller), alias: seller ? seller.display_name : null, removedListings });
}
