import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { EMAIL_RE } from '../../../../../lib/utils';
import {
  APPROVAL_SUBJECT,
  buildApplicationApprovedEmail,
  issueApprovedSellerInvite,
} from '../../../../../lib/sellerAuthCore';

// Sends an approved applicant their invite key and login instructions.
// Gated by the TOTP admin session like the rest of /api/admin/marketplace —
// unlike /api/seller/admin/invite-trusted-seller, which does a similar job
// behind the shared ADMIN_SECRET header for curl/script use. This one exists
// so the panel can do it without the operator holding the secret.
//
// `preview: true` composes the exact same body from the same builder and
// returns it without minting a key or sending anything, so what the admin
// reads in the modal is what the applicant receives — not a lookalike.

const EXPIRY_CHOICES = new Set([24, 168, 0]); // 24h · 7 days · never
const PREVIEW_KEY = 'XXXX-XXXX-XXXX';
const MAX_NOTE = 2000;

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const preview = Boolean(body?.preview);
  const email = String(body?.email || '').trim().toLowerCase();
  const note = String(body?.note || '').slice(0, MAX_NOTE);

  const expiryHours = Number(body?.expiryHours);
  if (!EXPIRY_CHOICES.has(expiryHours)) {
    return NextResponse.json({ error: 'Pick a valid key expiry.' }, { status: 400 });
  }

  if (preview) {
    const expiresAt = expiryHours > 0 ? new Date(Date.now() + expiryHours * 60 * 60 * 1000) : null;
    return NextResponse.json({
      subject: APPROVAL_SUBJECT,
      body: buildApplicationApprovedEmail({ keyCode: PREVIEW_KEY, expiresAt, note }),
    });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const result = await issueApprovedSellerInvite({ email, expiryHours, note });
  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        keyCode: result.keyCode,
        expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
      },
      { status: result.status }
    );
  }

  return NextResponse.json({
    success: true,
    email,
    keyCode: result.keyCode,
    expiresAt: result.expiresAt ? result.expiresAt.toISOString() : null,
  });
}
