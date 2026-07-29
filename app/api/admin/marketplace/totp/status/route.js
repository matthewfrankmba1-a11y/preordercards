import { NextResponse } from 'next/server';
import { getEnrollmentStatus, requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';

// Public (no secret required) — only returns booleans, never the TOTP
// secret itself. The client uses this to decide which of three screens to
// show: setup, code entry, or the sellers table.
export async function GET(request) {
  const { enrolled } = getEnrollmentStatus();
  const authenticated = enrolled ? !requireMarketplaceAdmin(request).error : false;
  return NextResponse.json({ enrolled, authenticated });
}
