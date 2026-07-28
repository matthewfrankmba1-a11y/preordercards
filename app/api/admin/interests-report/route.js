import { NextResponse } from 'next/server';
import { checkAdminSecret, isLikelyTestContact } from '../../../../lib/utils';
import { loadReleases } from '../../../../lib/releases';
import { listInterestsSince } from '../../../../lib/db';

// SQLite's CURRENT_TIMESTAMP (used by created_at everywhere in this app)
// stores 'YYYY-MM-DD HH:MM:SS' in UTC with no 'T'/'Z' — match that format so
// the string comparison in listInterestsSince's WHERE clause actually works
// (see the identical note in lib/statsSummary.js).
function sqliteUtcNow(date = new Date()) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Reports who has registered interest (and in what quantity) across all
// releases within a lookback window — admin-only, read via header secret
// like the other /api/admin routes. Defaults to a rolling 7 days ("this
// week") since release drops don't line up with a fixed Mon-Sun boundary.
export async function GET(request) {
  if (!checkAdminSecret(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const daysParam = Number(searchParams.get('days'));
  const days = Number.isFinite(daysParam) && daysParam > 0 ? daysParam : 7;
  const sinceParam = searchParams.get('since');
  const sinceSql = sinceParam
    ? sqliteUtcNow(new Date(sinceParam))
    : sqliteUtcNow(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

  const excludeTest = ['1', 'true'].includes((searchParams.get('excludeTest') || '').toLowerCase());

  const allRows = listInterestsSince.all(sinceSql);
  const rows = excludeTest ? allRows.filter((r) => !isLikelyTestContact(r.contactValue)) : allRows;
  const excludedRows = excludeTest ? allRows.length - rows.length : 0;

  const releasesById = new Map(loadReleases().releases.map((r) => [r.id, r]));

  const byRelease = new Map();
  for (const row of rows) {
    if (!byRelease.has(row.releaseId)) {
      const release = releasesById.get(row.releaseId);
      byRelease.set(row.releaseId, {
        releaseId: row.releaseId,
        title: release ? release.title : row.releaseId,
        sport: release ? release.sport : null,
        releaseDate: release ? release.releaseDate : null,
        totalQuantity: 0,
        registrantCount: 0,
        registrants: [],
      });
    }
    const bucket = byRelease.get(row.releaseId);
    bucket.totalQuantity += row.quantity;
    bucket.registrantCount += 1;
    bucket.registrants.push({
      contactType: row.contactType,
      contactValue: row.contactValue,
      quantity: row.quantity,
      createdAt: row.createdAt,
      // Only meaningful when excludeTest isn't set (otherwise these rows
      // were already dropped) — kept so an unfiltered pull still shows
      // which entries a filtered pull would have excluded.
      likelyTest: isLikelyTestContact(row.contactValue),
    });
  }

  const releases = [...byRelease.values()].sort((a, b) => b.totalQuantity - a.totalQuantity);
  const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);

  return NextResponse.json({
    success: true,
    since: sinceSql,
    sinceUtc: `${sinceSql.replace(' ', 'T')}Z`,
    now: new Date().toISOString(),
    excludeTest,
    excludedCount: excludedRows,
    totalRegistrants: rows.length,
    totalQuantity,
    releaseCount: releases.length,
    releases,
  });
}
