import { NextResponse } from 'next/server';
import { getActiveListings } from '../../../lib/db';

export async function GET() {
  const listings = getActiveListings.all();
  return NextResponse.json({ listings });
}
