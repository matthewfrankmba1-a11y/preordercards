import { NextResponse } from 'next/server';
import { getListingById, getSellerById } from '../../../../../../../lib/db';
import { requireSeller } from '../../../../../../../lib/sellerAuthCore';
import { isSellerAdmin, LABEL_MIME_TYPES } from '../../../../../../../lib/marketplaceCore';
import { sendEmail, isEmailConfigured } from '../../../../../../../lib/email';

const MAX_LABEL_BYTES = 5 * 1024 * 1024;

// Emails a shipping label (uploaded by the admin, e.g. purchased via a
// carrier) directly to the listing's seller as an attachment. The label
// legitimately contains the buyer's shipping address — unlike the generic
// interest alert, this is a deliberate, manual admin action, not automated.
export async function POST(request, { params }) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });
  if (!isSellerAdmin(seller)) {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }

  const { id: idParam } = await params;
  const id = Number(idParam);
  const listing = getListingById.get(id);
  if (!listing) {
    return NextResponse.json({ error: 'Listing not found.' }, { status: 404 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('label');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }
  if (file.size > MAX_LABEL_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 5MB).' }, { status: 400 });
  }
  if (!LABEL_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'File must be a PDF, PNG, or JPEG.' }, { status: 400 });
  }

  const listingSeller = getSellerById.get(listing.seller_id);
  if (!listingSeller || !listingSeller.email) {
    return NextResponse.json(
      { error: 'This seller has no alert email on file — ask them to set one on their dashboard first.' },
      { status: 400 }
    );
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: 'Email sending is not configured.' }, { status: 500 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await sendEmail({
    to: listingSeller.email,
    subject: `Shipping label for your listing: ${listing.description}`,
    text: `Attached is the shipping label for your listing "${listing.description}". Please print it, attach it to the package, and ship as soon as possible.\n\n— PreorderCards`,
    attachments: [
      {
        filename: file.name || 'shipping-label',
        content: buffer.toString('base64'),
      },
    ],
  });
  if (!result.ok) {
    return NextResponse.json({ error: 'Failed to send the shipping label email.' }, { status: 502 });
  }
  return NextResponse.json({ success: true });
}
