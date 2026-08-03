import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';
import { revokeInviteKey } from '../../../../../../lib/sellerAuthCore';

// Same irreversible operation as /api/seller/admin/revoke-key, just gated
// by the marketplace admin TOTP session instead of ADMIN_SECRET — this is
// the button on the marketplace-admin.html page, which can't easily attach
// a custom header from a plain form submit.
export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const keyCode = String(body?.keyCode || '').trim().toUpperCase();
  const result = revokeInviteKey(keyCode);
  if (!result.found) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });

  return NextResponse.json({ success: true, hadSeller: result.hadSeller, alias: result.alias, removedListings: result.removedListings });
}
