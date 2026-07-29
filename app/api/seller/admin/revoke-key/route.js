import { NextResponse } from 'next/server';
import { revokeInviteKey } from '../../../../../lib/sellerAuthCore';
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
  const result = revokeInviteKey(keyCode);
  if (!result.found) return NextResponse.json({ error: 'Key not found.' }, { status: 404 });

  return NextResponse.json({ success: true, hadSeller: result.hadSeller, alias: result.alias, removedListings: result.removedListings });
}
