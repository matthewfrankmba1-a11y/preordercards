import { NextResponse } from 'next/server';
import { updateSellerProfile } from '../../../../lib/db';
import { normalizePhone } from '../../../../lib/utils';
import { requireSeller } from '../../../../lib/sellerAuthCore';

// Required before a seller can create any listings: full name, phone, and
// at least one payout method (Venmo, CashApp, or Zelle). Also doubles as
// the identifying info used by /recover-account if they lose their key.
export async function POST(request) {
  const { seller, error } = requireSeller(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const body = await request.json().catch(() => ({}));
  const { fullName, phone, venmo, cashapp, zelle } = body || {};

  if (typeof fullName !== 'string' || !fullName.trim()) {
    return NextResponse.json({ error: 'Full name is required.' }, { status: 400 });
  }
  if (fullName.trim().length > 200) {
    return NextResponse.json({ error: 'Full name is too long.' }, { status: 400 });
  }
  if (typeof phone !== 'string' || !phone.trim()) {
    return NextResponse.json({ error: 'Phone number is required.' }, { status: 400 });
  }
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 });
  }

  const trimmedVenmo = venmo ? String(venmo).trim() : '';
  const trimmedCashapp = cashapp ? String(cashapp).trim() : '';
  const trimmedZelle = zelle ? String(zelle).trim() : '';
  if (!trimmedVenmo && !trimmedCashapp && !trimmedZelle) {
    return NextResponse.json({ error: 'Provide at least one of Venmo, CashApp, or Zelle.' }, { status: 400 });
  }
  for (const [label, value] of [['Venmo', trimmedVenmo], ['CashApp', trimmedCashapp], ['Zelle', trimmedZelle]]) {
    if (value.length > 100) {
      return NextResponse.json({ error: `${label} is too long (max 100 characters).` }, { status: 400 });
    }
  }

  updateSellerProfile.run({
    sellerId: seller.id,
    fullName: fullName.trim(),
    phone: normalizedPhone,
    venmo: trimmedVenmo || null,
    cashapp: trimmedCashapp || null,
    zelle: trimmedZelle || null,
  });

  return NextResponse.json({ success: true, profileComplete: true });
}
