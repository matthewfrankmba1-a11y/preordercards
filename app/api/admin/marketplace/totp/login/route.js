import { NextResponse } from 'next/server';
import { totpLoginRateLimit, verifyLoginCode, issueAdminSession } from '../../../../../../lib/marketplaceAdminAuth';

// No ADMIN_SECRET required here — a valid, currently-live Google
// Authenticator code IS the credential for day-to-day access. Rate-limited
// since a 6-digit code is far more brute-forceable than a random token.
export async function POST(request) {
  const check = totpLoginRateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  if (!verifyLoginCode(body?.code)) {
    return NextResponse.json({ error: 'Incorrect or expired code.' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  issueAdminSession(response);
  return response;
}
