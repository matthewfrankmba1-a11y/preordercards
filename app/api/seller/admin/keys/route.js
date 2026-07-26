import { NextResponse } from 'next/server';
import { listInviteKeysWithAlias } from '../../../../../lib/db';
import { checkAdminSecret } from '../../../../../lib/utils';

// Read-only listing of every invite key ever generated, plus the real alias
// (display_name) if it's been used to sign up — for admin record-keeping.
export async function GET(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  return NextResponse.json({ keys: listInviteKeysWithAlias.all() });
}
