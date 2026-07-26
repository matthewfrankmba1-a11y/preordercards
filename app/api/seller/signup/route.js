import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getInviteKey, markInviteKeyUsed, insertSeller } from '../../../../lib/db';
import { EMAIL_RE } from '../../../../lib/utils';
import { generateSellerName, issueSessionCookie, sellerAuthRateLimit } from '../../../../lib/sellerAuthCore';

export async function POST(request) {
  const check = sellerAuthRateLimit(request);
  if (!check.allowed) {
    return NextResponse.json({ error: check.message }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const { key, password, email } = body || {};
  if (typeof key !== 'string' || typeof password !== 'string') {
    return NextResponse.json({ error: 'Missing key or password.' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  }

  let normalizedEmail = null;
  if (email) {
    normalizedEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(normalizedEmail) || normalizedEmail.length > 254) {
      return NextResponse.json({ error: 'Enter a valid email address, or leave it blank.' }, { status: 400 });
    }
  }

  const normalizedKey = key.trim().toUpperCase();
  const keyRow = getInviteKey.get(normalizedKey);
  if (!keyRow) return NextResponse.json({ error: 'Invalid invite key.' }, { status: 400 });
  if (keyRow.used) return NextResponse.json({ error: 'This invite key has already been used.' }, { status: 400 });
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite key has expired.' }, { status: 400 });
  }

  const isAdmin = keyRow.key_type === 'admin';
  const passwordHash = bcrypt.hashSync(password, 10);
  const displayName = generateSellerName();
  const result = insertSeller.run({
    inviteKey: normalizedKey,
    passwordHash,
    displayName,
    isAdmin: isAdmin ? 1 : 0,
    email: normalizedEmail,
  });
  markInviteKeyUsed.run({ sellerId: result.lastInsertRowid, keyCode: normalizedKey });

  const response = NextResponse.json(
    { success: true, displayName, isAdmin, email: normalizedEmail, profileComplete: false },
    { status: 201 }
  );
  issueSessionCookie(response, result.lastInsertRowid);
  return response;
}
