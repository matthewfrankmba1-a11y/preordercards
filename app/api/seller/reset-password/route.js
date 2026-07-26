import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  getPasswordReset,
  updateSellerPassword,
  deletePasswordResetsBySeller,
  deleteSessionsBySeller,
} from '../../../../lib/db';
import { sellerAuthRateLimit } from '../../../../lib/sellerAuthCore';

// Completes a password reset using the token emailed by /forgot-password.
// Also invalidates the account's active sessions, forcing a fresh login.
export async function POST(request) {
  const check = sellerAuthRateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { token, newPassword } = body || {};
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'Missing reset token.' }, { status: 400 });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }
  const resetRow = getPasswordReset.get(token);
  if (!resetRow || new Date(resetRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  updateSellerPassword.run({ sellerId: resetRow.seller_id, passwordHash });
  deletePasswordResetsBySeller.run(resetRow.seller_id);
  deleteSessionsBySeller.run(resetRow.seller_id);

  return NextResponse.json({ success: true });
}
