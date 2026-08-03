import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';
import { cancelInterest, restoreInterest } from '../../../../../../lib/db';

// Shades a registration out to indicate it was never fulfilled — soft, same
// as the marketplace listing-interests cancel toggle. Never deletes the
// row; see /delete for the separate hard-delete path (test records).
export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Missing or invalid id.' }, { status: 400 });
  }

  if (body?.cancelled === false) {
    restoreInterest.run(id);
  } else {
    cancelInterest.run(id);
  }
  return NextResponse.json({ success: true });
}
