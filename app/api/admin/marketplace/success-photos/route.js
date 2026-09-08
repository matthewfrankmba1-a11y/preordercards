import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import {
  MAX_UPLOAD_BYTES,
  deleteUploadedPhoto,
  listSuccessPhotos,
  saveUploadedPhoto,
} from '../../../../../lib/successPhotos';

// Uploads for the Success Stories page. Files go to the mounted data disk
// rather than into public/, which is part of the deploy and replaced by it,
// so an upload survives the next redeploy.
const MAX_FILES_PER_REQUEST = 10;

export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ photos: listSuccessPhotos() });
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  let form;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'That upload could not be read.' }, { status: 400 });
  }

  const files = form.getAll('photos').filter((entry) => typeof entry === 'object' && entry !== null && 'arrayBuffer' in entry);
  if (files.length === 0) return NextResponse.json({ error: 'No files were attached.' }, { status: 400 });
  if (files.length > MAX_FILES_PER_REQUEST) {
    return NextResponse.json({ error: `Up to ${MAX_FILES_PER_REQUEST} files at a time.` }, { status: 400 });
  }

  const results = [];
  for (const file of files) {
    const name = file.name || 'image';
    // Checked before the bytes are read, so an oversized file is rejected
    // rather than pulled into memory first.
    if (file.size > MAX_UPLOAD_BYTES) {
      results.push({ name, error: `${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.` });
      continue;
    }
    const saved = saveUploadedPhoto(Buffer.from(await file.arrayBuffer()));
    results.push(saved.error ? { name, error: saved.error } : { name, filename: saved.filename, url: saved.url });
  }

  return NextResponse.json({
    added: results.filter((r) => !r.error).length,
    rejected: results.filter((r) => r.error),
    photos: listSuccessPhotos(),
  });
}

export async function DELETE(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const filename = new URL(request.url).searchParams.get('filename');
  if (!deleteUploadedPhoto(filename)) {
    // Either it isn't there or it's a repo photo, which isn't ours to remove
    // at runtime — the next deploy would restore it.
    return NextResponse.json(
      { error: 'That photo could not be removed. Photos committed to the repo have to be deleted there.' },
      { status: 404 }
    );
  }
  return NextResponse.json({ deleted: filename, photos: listSuccessPhotos() });
}
