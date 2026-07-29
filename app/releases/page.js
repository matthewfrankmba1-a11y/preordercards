import { headers } from 'next/headers';
import { getReleasesWithInterestCounts, todayISO } from '../../lib/releases';
import { SITE_URL } from '../../lib/seo';

// Full index of every release, upcoming and past. Two jobs: it's the internal
// crawl path to release pages the homepage doesn't link (the homepage caps
// sold-out cards at one, which would otherwise leave every shipped release an
// orphan URL in the sitemap), and it gives /releases a real page instead of a
// 404 for anyone who trims a release URL back to its parent.

export const metadata = {
  title: 'All Topps Release Dates — Full Calendar Archive | PreorderCards',
  description:
    'Every Topps trading card release PreorderCards tracks, upcoming and past — sorted by date, with release dates, sport, and format for each.',
  alternates: { canonical: '/releases' },
};

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatGroupLabel(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function ReleaseGroups({ releases }) {
  const groups = [];
  releases.forEach((release) => {
    const label = formatGroupLabel(release.releaseDate);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(release);
    else groups.push({ label, items: [release] });
  });

  return groups.map((group) => (
    <div key={group.label}>
      <h3>{group.label}</h3>
      <ul>
        {group.items.map((release) => (
          <li key={release.id}>
            <a href={`/releases/${release.id}`}>{release.title}</a> — {formatDate(release.releaseDate)}
            {' · '}
            {release.sport} · {release.format}
          </li>
        ))}
      </ul>
    </div>
  ));
}

export default async function ReleasesIndexPage() {
  const nonce = (await headers()).get('x-nonce');

  let data;
  try {
    data = getReleasesWithInterestCounts();
  } catch {
    data = null;
  }

  const all = data ? data.releases : [];
  const today = todayISO();
  const upcoming = all.filter((r) => r.releaseDate >= today && r.soldOut !== true);
  const past = all
    .filter((r) => r.releaseDate < today || r.soldOut === true)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Release Calendar', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'All Releases', item: `${SITE_URL}/releases` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>All Topps Release Dates</h1>
          <p className="tagline">
            Every release we track, upcoming and past — {all.length} in total.
          </p>
          <a className="header-nav-link" href="/">← Back to Release Calendar</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          {all.length === 0 && (
            <div className="status">Could not load release data. Please refresh the page.</div>
          )}

          {upcoming.length > 0 && (
            <>
              <h2>Upcoming releases</h2>
              <ReleaseGroups releases={upcoming} />
            </>
          )}

          {past.length > 0 && (
            <>
              <h2>Past releases</h2>
              <p>
                These have already shipped and are closed for registration, kept here as a
                dated record of what released and when.
              </p>
              <ReleaseGroups releases={past} />
            </>
          )}

          <p style={{ marginTop: '2rem' }}>
            Release dates are compiled from public trackers including{' '}
            <a href="https://www.beckett.com/" target="_blank" rel="noopener">Beckett</a> and Waxstat,
            and can change without notice — always confirm on Topps.com before buying.
          </p>
        </article>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service. It is not
            affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL, the UFC, Disney,
            Marvel, or any other brand or league referenced here. All product names and trademarks
            belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
