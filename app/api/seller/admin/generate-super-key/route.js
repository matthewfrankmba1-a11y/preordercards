import { NextResponse } from 'next/server';
import { countSuperKeys, insertInviteKey } from '../../../../../lib/db';
import { checkAdminSecret } from '../../../../../lib/utils';
import { generateInviteKeyCode } from '../../../../../lib/sellerAuthCore';

// Mints the one-and-only super key that creates an admin seller account on
// signup. Rejects if a super key already exists — only one may ever be made.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  if (countSuperKeys.get().c > 0) {
    return NextResponse.json({ error: 'A super key has already been generated. Only one may ever exist.' }, { status: 409 });
  }
  const key = generateInviteKeyCode();
  insertInviteKey.run({ keyCode: key, keyType: 'admin', expiresAt: null });
  return NextResponse.json({ key });
}
