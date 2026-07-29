import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../../lib/marketplaceAdminAuth';
import { deleteInterestById } from '../../../../../../lib/db';

// Permanently removes a registration row — meant for test/junk records, not
// real unfulfilled ones (use /cancel to shade those out instead). No undo.
export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Missing or invalid id.' }, { status: 400 });
  }

  deleteInterestById.run(id);
  return NextResponse.json({ success: true });
}
