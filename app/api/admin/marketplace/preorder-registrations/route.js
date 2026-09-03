import { NextResponse } from 'next/server';
import { requireMarketplaceAdmin } from '../../../../../lib/marketplaceAdminAuth';
import { listAllInterestsForAdmin } from '../../../../../lib/db';
import { loadReleases } from '../../../../../lib/releases';

// Web-UI equivalent of GET /api/admin/interests-report (which requires
// ADMIN_SECRET + curl) — same underlying interests table, browsable from the
// TOTP-gated marketplace admin page instead. registrationCount is how many
// total registrations that same contact has made across every release, not
// just this one — a repeat-registrant signal.
export async function GET(request) {
  const { error } = requireMarketplaceAdmin(request);
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const rows = listAllInterestsForAdmin.all();
  const releasesById = new Map(loadReleases().releases.map((r) => [r.id, r]));

  const countByContact = new Map();
  for (const row of rows) {
    countByContact.set(row.contactValue, (countByContact.get(row.contactValue) || 0) + 1);
  }

  const registrations = rows.map((row) => {
    const release = releasesById.get(row.releaseId);
    return {
      id: row.id,
      contactType: row.contactType,
      contactValue: row.contactValue,
      quantity: row.quantity,
      createdAt: row.createdAt,
      releaseId: row.releaseId,
      releaseTitle: release ? release.title : row.releaseId,
      // The release's own street date (or preorder-open date), so the admin
      // table can sort by when a release actually lands rather than only by
      // when the customer happened to register.
      releaseDate: release ? release.releaseDate : null,
      isPreorderOpenDate: release ? Boolean(release.isPreorderOpenDate) : false,
      registrationCount: countByContact.get(row.contactValue),
      cancelled: Boolean(row.cancelledAt),
      outcome: row.outcome || null,
      outcomeNotifiedAt: row.outcomeNotifiedAt || null,
      emailSentAt: row.emailSentAt || null,
    };
  });

  return NextResponse.json({ registrations });
}
