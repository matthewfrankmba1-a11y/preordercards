import { NextResponse } from 'next/server';
import { clearSessionCookie } from '../../../../lib/sellerAuthCore';

export async function POST(request) {
  const response = NextResponse.json({ success: true });
  clearSessionCookie(request, response);
  return response;
}
