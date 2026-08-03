import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';
import { cancelListingInterest, restoreListingInterest } from '../../../../../../lib/db';

// Toggles an inquiry's cancelled state — never deletes the row. "cancelled:
// true" greys it out (inquiry didn't turn into a sale); "false" restores it.
export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Missing or invalid id.' }, { status: 400 });
  }

  if (body?.cancelled === false) {
    restoreListingInterest.run(id);
  } else {
    cancelListingInterest.run(id);
  }
  return NextResponse.json({ success: true });
}
