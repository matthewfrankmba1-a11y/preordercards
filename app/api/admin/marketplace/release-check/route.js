import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { checkPastedText } from '../../../../../lib/releaseCheck';

// Compares a pasted release calendar against data/releases.json.
//
// The scheduled fetch (lib/releaseCheck.js) is blocked by every publisher —
// Panini and Topps answer 403, Blowout serves an Incapsula interstitial — so
// this is the path that actually works: open the calendar in a browser, copy
// the list, paste it here. Same extraction, same matching, same policy
// exclusions as the scheduled run, and it writes nothing either.
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
