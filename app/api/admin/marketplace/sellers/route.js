import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { getSellerStatsForAdmin } from '../../../../../lib/db';

export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const sellers = getSellerStatsForAdmin.all().map((s) => ({
    ...s,
    loggedIn: s.loginCount > 0,
  }));
  return NextResponse.json({ sellers });
}
