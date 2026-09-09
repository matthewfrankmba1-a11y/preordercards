import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import {
  listPreorderRequestsForAdmin,
  setPreorderRequestHandled,
  deletePreorderRequest,
} from '../../../../../lib/db';

// Special preorder requests from /request-preorder.html. They arrive in
// Discord as they come in; this is the record that outlives the channel
// scrollback, and where they get marked off once answered.
export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const requests = listPreorderRequestsForAdmin.all().map((row) => ({
    ...row,
    handled: Boolean(row.handledAt),
  }));
  return NextResponse.json({ requests });
}

export async function POST(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: 'A valid id is required.' }, { status: 400 });
  }

  const action = body?.action;
  if (action === 'handled') {
    setPreorderRequestHandled.run({ id, handled: body?.handled ? 1 : 0 });
  } else if (action === 'delete') {
    deletePreorderRequest.run({ id });
  } else {
    return NextResponse.json({ error: 'action must be one of: handled, delete.' }, { status: 400 });
  }

  const requests = listPreorderRequestsForAdmin.all().map((row) => ({ ...row, handled: Boolean(row.handledAt) }));
  return NextResponse.json({ requests });
}
