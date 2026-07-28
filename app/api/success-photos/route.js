import { NextResponse } from 'next/server';
import { listSuccessPhotos } from '../../../lib/successPhotos';

export async function GET() {
  return NextResponse.json({ photos: listSuccessPhotos() });
}
