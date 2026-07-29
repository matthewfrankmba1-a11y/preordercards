import { NextResponse } from 'next/server';
import { checkAdminSecret } from '../../../../../../lib/utils';
import { beginEnrollmentWithQr } from '../../../../../../lib/marketplaceAdminAuth';

// Gated by the existing ADMIN_SECRET (not TOTP — bootstraps trust for a page
// that doesn't have a TOTP secret yet, and re-running this always issues a
// fresh un-enrolled secret, so it also works as a "reset 2FA" flow if the
// owner loses their authenticator). Returns the raw secret and a QR code;
// nothing is usable to log in until POST /confirm verifies a real code.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { secret, otpauthUrl, qrDataUrl } = await beginEnrollmentWithQr();
  return NextResponse.json({ success: true, secret, otpauthUrl, qrDataUrl });
}
