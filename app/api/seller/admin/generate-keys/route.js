import { NextResponse } from 'next/server';
import { insertInviteKey } from '../../../../../lib/db';
import { checkAdminSecret } from '../../../../../lib/utils';
import { generateInviteKeyCode } from '../../../../../lib/sellerAuthCore';

// Lets new (regular) invite keys be minted against the live database without
// shell access to the host — protected by a shared secret, not seller auth.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const count = Math.min(Math.max(Number(body?.count) || 10, 1), 100);
  const keys = [];
  for (let i = 0; i < count; i++) {
    const key = generateInviteKeyCode();
    insertInviteKey.run({ keyCode: key, keyType: 'seller', expiresAt: null });
    keys.push(key);
  }
  return NextResponse.json({ keys });
}
