import { NextResponse } from 'next/server';
import { markListingSold } from '../../../../../../lib/db';
import { requireSeller } from '../../../../../../lib/sellerAuthCore';

export async function POST(request, { params }) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const { id: idParam } = await params;
  const id = Number(idParam);
  const result = markListingSold.run({ id, sellerId: seller.id });
  if (result.changes === 0) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
