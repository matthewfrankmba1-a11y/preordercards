import { NextResponse } from 'next/server';
import { requireSeller } from '../../../../lib/sellerAuthCore';

export async function GET(request) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({
    sellerId: seller.id,
    displayName: seller.displayName,
    isAdmin: seller.isAdmin,
    email: seller.email,
    profileComplete: seller.profileComplete,
  });
}
