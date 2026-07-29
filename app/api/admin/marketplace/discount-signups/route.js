import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { listDiscountSignupsForAdmin } from '../../../../../lib/db';

// Homepage discount-banner ("Get 5% off your first order") email signups —
// same TOTP-gated marketplace admin surface as the other tabs.
export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const signups = listDiscountSignupsForAdmin.all().map((row) => ({
    id: row.id,
    email: row.email,
    createdAt: row.createdAt,
    welcomeEmailSentAt: row.welcomeEmailSentAt || null,
    welcomeEmailStatus: row.welcomeEmailStatus || null,
  }));
  return NextResponse.json({ signups });
}
