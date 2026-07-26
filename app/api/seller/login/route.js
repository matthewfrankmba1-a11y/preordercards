import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSellerByInviteKey } from '../../../../lib/db';
import { issueSessionCookie, sellerAuthRateLimit } from '../../../../lib/sellerAuthCore';

export async function POST(request) {
  const check = sellerAuthRateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { key, password } = body || {};
  if (typeof key !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Missing key or password.' }, { status: 400 });
  }

  const seller = getSellerByInviteKey.get(key.trim().toUpperCase());
  if (!seller || !bcrypt.compareSync(password, seller.password_hash)) {
    return NextResponse.json({ error: 'Invalid key or password.' }, { status: 401 });
  }

  const response = NextResponse.json({
    success: true,
    displayName: seller.display_name,
    isAdmin: Boolean(seller.is_admin),
    email: seller.email,
    profileComplete: Boolean(seller.profile_completed_at),
  });
  issueSessionCookie(response, seller.id);
  return response;
}
