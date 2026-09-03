import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { checkPastedText } from '../../../../../lib/releaseCheck';

// Compares a pasted release calendar against data/releases.json.
//
// Open a publisher's calendar in a browser, copy the list, paste it here.
// Reports what differs and writes nothing — acting on it means editing
// data/releases.json yourself, which is what keeps the newsletter's
// accuracy gate meaningful.
export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const manufacturer = body?.manufacturer === 'Topps' || body?.manufacturer === 'Panini' ? body.manufacturer : null;

  const report = await checkPastedText({
    text: body?.text,
    manufacturer,
    sourceName: manufacturer ? `Pasted ${manufacturer} calendar` : 'Pasted calendar',
  });

  if (report.error) return NextResponse.json({ error: report.error }, { status: 400 });
  return NextResponse.json({ success: true, ...report });
}
