import { NextResponse } from 'next/server';
import { readUploadedPhoto } from '../../../../lib/successPhotos';

// Serves photos uploaded from the admin panel. Photos committed to the repo
// are served straight out of public/ by the static handler and never reach
// this route — these live on the data disk, which nothing serves on its own.
export async function GET(request, { params }) {
  const { filename } = await params;
  const photo = readUploadedPhoto(filename);
  if (!photo) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return new NextResponse(photo.body, {
    headers: {
      // Decided from the file's own bytes when it was stored, not from
      // anything the uploader sent, and nosniff so the browser can't be
      // talked into treating it as something else.
      'Content-Type': photo.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      // The name is a random hex digest of the stored file, so a given URL
      // always means the same bytes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
