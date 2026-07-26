import { NextResponse } from 'next/server';
import { insertSlotSubmission } from '../../../lib/db';
import { checkAdminSecret } from '../../../lib/utils';

// Called by the Slot Details Google Form's Apps Script alongside its Discord
// post, purely to log a count for the stats-summary — never triggers a
// notification itself.
export async function POST(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  insertSlotSubmission.run();
  return NextResponse.json({ success: true });
}
