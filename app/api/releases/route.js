import { NextResponse } from 'next/server';
import { countByRelease } from '../../../lib/db';
import { loadReleases } from '../../../lib/releases';

export async function GET() {
  const data = loadReleases();
  const counts = Object.fromEntries(countByRelease.all().map((r) => [r.releaseId, r.count]));
  const releases = data.releases
    .map((r) => ({ ...r, interestCount: counts[r.id] || 0 }))
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return NextResponse.json({ lastUpdated: data.lastUpdated, sourceNote: data.sourceNote, releases });
}
