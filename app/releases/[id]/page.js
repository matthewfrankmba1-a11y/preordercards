import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getReleasesWithInterestCounts, todayISO } from '../../../lib/releases';
import { SITE_URL } from '../../../lib/seo';
import ReleaseCard from '../../ReleaseCard';

// One indexable page per release. The homepage lists all 49 at a single URL,
// which gives Google nothing to rank against the searches collectors actually
// type ("2026 topps chrome baseball release date"). These pages carry the
// release name in the title, URL, and H1, which is what that query matches.

function findRelease(id) {
  const data = getReleasesWithInterestCounts();
  const release = data.releases.find((r) => r.id === id);
  return release ? { release, all: data.releases } : null;
}

function isSoldOut(release) {
  return release.releaseDate < todayISO() || release.soldOut === true;
}

function formatDate(isoDate) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// Whole days from today to the release date, floored — used for the
// human-readable countdown line that gives each page a sentence of copy no
// other page on the site has.
function daysUntil(isoDate) {
  const MS_PER_DAY = 86400000;
  const target = Date.parse(`${isoDate}T00:00:00Z`);
  const today = Date.parse(`${todayISO()}T00:00:00Z`);
  return Math.round((target - today) / MS_PER_DAY);
}

function countdownText(release, soldOut) {
  if (soldOut) return `${release.title} has already released.`;
  const days = daysUntil(release.releaseDate);
  if (days === 0) return `${release.title} releases today.`;
  if (days === 1) return `${release.title} releases tomorrow.`;
  return `${release.title} releases in ${days} days.`;
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const found = findRelease(id);
  if (!found) return { title: 'Release Not Found — PreorderCards' };

  const { release } = found;
  const dateStr = formatDate(release.releaseDate);
  const dateLabel = release.isPreorderOpenDate ? 'Preorders open' : 'Release date';
  const title = `${release.title} — Release Date & Preorder | PreorderCards`;
  const description =
    `${dateLabel}: ${dateStr}. ${release.description || ''} ` +
    `Register interest in ${release.title} (${release.format}) for free on PreorderCards — no upfront payment.`.replace(
      /\s+/g,
      ' '
    );

  return {
    title,
    description,
    alternates: { canonical: `/releases/${release.id}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: `/releases/${release.id}`,
    },
  };
}

export default async function ReleaseDetailPage({ params }) {
  const { id } = await params;
  const found = findRelease(id);
  if (!found) notFound();

  const { release, all } = found;
  const nonce = (await headers()).get('x-nonce');
  const soldOut = isSoldOut(release);
  const dateLabel = release.isPreorderOpenDate ? 'Preorders open' : 'Release date';

  // Same sport, still upcoming, nearest dates first — internal links that give
  // crawlers a path between release pages instead of leaving each one a
  // dead end reachable only from the homepage.
  const related = all
    .filter((r) => r.sport === release.sport && r.id !== release.id && !isSoldOut(r))
    .slice(0, 6);

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Release Calendar', item: `${SITE_URL}/` },
      {
        '@type': 'ListItem',
        position: 2,
        name: `${release.sport} Releases`,
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: release.title,
        item: `${SITE_URL}/releases/${release.id}`,
      },
    ],
  };

  // Deliberately NOT schema.org/Product: a Product entity without an `offers`
  // price would be invalid structured data, and PreorderCards genuinely has no
  // price at interest-registration time. WebPage + about/Thing describes what
  // the page actually is without asserting anything untrue.
  const pageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: `${release.title} — Release Date & Preorder`,
    url: `${SITE_URL}/releases/${release.id}`,
    description: release.description || `${release.title} release date and free preorder interest registration.`,
    isPartOf: { '@type': 'WebSite', name: 'PreorderCards', url: `${SITE_URL}/` },
    about: {
      '@type': 'Thing',
      name: release.title,
      description: release.description || undefined,
    },
  };

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(pageJsonLd) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>{release.title}</h1>
          <p className="tagline">
            {dateLabel}: {formatDate(release.releaseDate)} · {release.sport} · {release.format}
          </p>
          <a className="header-nav-link" href="/">← Back to Release Calendar</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <p>{countdownText(release, soldOut)}</p>

          {release.description && <p>{release.description}</p>}

          <h2>Key details</h2>
          <ul>
            <li><strong>{dateLabel}:</strong> {formatDate(release.releaseDate)}</li>
            <li><strong>Sport / category:</strong> {release.sport}</li>
            <li><strong>Format:</strong> {release.format}</li>
            <li>
              <strong>Availability:</strong>{' '}
              {soldOut ? 'Already released — registration closed.' : 'Open for free interest registration.'}
            </li>
            {release.eql && (
              <li><strong>Purchase method:</strong> Sold via EQL raffle entry, not first-come-first-served.</li>
            )}
            {release.isPreorderOpenDate && (
              <li><strong>Note:</strong> This date is when preorders open, not the ship date.</li>
            )}
          </ul>

          <h2>{soldOut ? 'This release has shipped' : `Register interest in ${release.title}`}</h2>
          <p>
            {soldOut
              ? 'Registration is closed for this release. Browse the calendar for releases that are still open.'
              : 'Registering is free and collects no payment — pick a quantity and leave an email or phone number, and we\'ll be in touch as the date approaches.'}
          </p>
        </article>

        <div className="releases">
          <ReleaseCard release={release} soldOut={soldOut} linkTitle={false} />
        </div>

        {related.length > 0 && (
          <article className="legal">
            <h2>Other upcoming {release.sport} releases</h2>
            <ul>
              {related.map((r) => (
                <li key={r.id}>
                  <a href={`/releases/${r.id}`}>{r.title}</a> — {formatDate(r.releaseDate)}
                </li>
              ))}
            </ul>
          </article>
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            Release dates are compiled from public trackers including{' '}
            <a href="https://www.beckett.com/" target="_blank" rel="noopener">Beckett</a> and Waxstat —
            always confirm on Topps.com before buying.
          </p>
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
