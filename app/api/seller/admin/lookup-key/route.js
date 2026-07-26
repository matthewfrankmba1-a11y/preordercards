import { NextResponse } from 'next/server';
import { getInviteKey, getSellerByInviteKey, countListingsBySeller } from '../../../../../lib/db';
import { checkAdminSecret } from '../../../../../lib/utils';

// Read-only: look up a key + its seller (if used) and their listing count,
// so the admin can decide what a revoke would affect before doing it.
export async function GET(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const keyCode = String(searchParams.get('key') || '').trim().toUpperCase();
  const keyRow = getInviteKey.get(keyCode);
  if (!keyRow) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });

  const seller = keyRow.used_by_seller_id ? getSellerByInviteKey.get(keyCode) : null;
  return NextResponse.json({
    keyCode,
    keyType: keyRow.key_type,
    used: Boolean(keyRow.used),
    alias: seller ? seller.display_name : null,
    listingCount: seller ? countListingsBySeller.get(seller.id).c : 0,
  });
}
