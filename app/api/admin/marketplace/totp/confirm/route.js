import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../../lib/utils';
import { confirmEnrollment } from '../../../../../../lib/marketplaceAdminAuth';

// Still gated by ADMIN_SECRET, not just the code — otherwise anyone who saw
// the QR code on screen during setup (before the owner finished scanning
// it) could race to confirm their own scan first.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ok = confirmEnrollment(body?.code);
  if (!ok) {
    return NextResponse.json({ error: 'Incorrect code. Scan the QR code again and try the current 6-digit code.' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
