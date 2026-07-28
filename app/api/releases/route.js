import { NextResponse } from 'next/server';
import { getReleasesWithInterestCounts } from '../../../lib/releases';

export async function GET() {
  return NextResponse.json(getReleasesWithInterestCounts());
}
