import { NextResponse } from 'next/server';
import { clearAdminSession } from '../../../../../../lib/marketplaceAdminAuth';

export async function POST(request) {
  const response = NextResponse.json({ success: true });
  clearAdminSession(request, response);
  return response;
}
