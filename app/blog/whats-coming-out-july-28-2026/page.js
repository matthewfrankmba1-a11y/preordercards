import { headers } from 'next/headers';
import { BLOG_POSTS } from '../../../lib/blogPosts';

const POST = BLOG_POSTS.find((p) => p.slug === 'whats-coming-out-july-28-2026');

export const metadata = {
  title: `${POST.title} — PreorderCards Blog`,
  description: POST.description,
};

const ARTICLE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: POST.title,
  description: POST.description,
  datePublished: POST.datePublished,
  dateModified: POST.datePublished,
  author: { '@type': 'Organization', name: 'PreorderCards' },
  publisher: { '@type': 'Organization', name: 'PreorderCards' },
};

export default async function WhatsComingOutThisWeekPost() {
  const nonce = (await headers()).get('x-nonce');

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_JSONLD) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>{POST.title}</h1>
          <p className="tagline">Five releases land this week — here's what's dropping, when, and how to get in.</p>
          <a className="header-nav-link" href="/blog.html">← Back to Blog</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Published July 28, 2026 · 2 min read</p>

          <p>
            It's a loaded week on the calendar — five releases across four sports, including two
            EQL raffle-entry drops on the same day. Here's everything landing between July 28
            and July 31, straight from our <a href="/">release calendar</a>.
          </p>

          <h2>Monday, July 28 — a double EQL drop</h2>
          <p>
            <strong>2026 Topps Mint Marvel</strong> (Hobby Box) brings Topps's coin-embedded Mint
            format to the Marvel Comics universe. Same day, <strong>2026 Topps Chrome Black
            Basketball</strong> (Hobby Box) drops as a low-print-run Chrome Black set built around
            numbered parallels. Both are <strong>EQL raffle entry</strong> — no refreshing a
            checkout page at launch, you enter and wait to see if you're selected to buy at
            retail price.
          </p>

          <h2>Tuesday, July 29 — Tribute Baseball</h2>
          <p>
            <strong>2026 Topps Tribute Baseball</strong> (Hobby Box) is a standard-checkout
            release built around on-card autographs and relics — a high-end baseball release for
            collectors chasing hits over base sets.
          </p>

          <h2>Wednesday, July 30 — Inception UEFA Soccer</h2>
          <p>
            <strong>2025/26 Topps Inception UEFA Club Competitions</strong> (Hobby Box) brings the
            Inception brand's design language to UEFA club competition soccer — standard checkout,
            no raffle entry required.
          </p>

          <h2>Thursday, July 31 — UFC Freedom 250</h2>
          <p>
            Closing out the week, <strong>Topps UFC Freedom 250</strong> (Hobby Box) is a
            UFC-licensed release themed around the Freedom 250 card design — standard checkout.
          </p>

          <h2>How to get in before any of these drop</h2>
          <p>
            Register interest for free on the <a href="/">release calendar</a> — no payment
            collected upfront, and every release is clearly flagged as EQL raffle entry or
            standard checkout so you know exactly what to expect on drop day.
          </p>

          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Questions or a release we should be tracking? Email{' '}
            <a href="mailto:admin@preordercards.com">admin@preordercards.com</a>.
          </p>

          <p style={{ marginTop: '2rem' }}>
            <a href="/">← Back to the PreorderCards homepage</a>
          </p>
        </article>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service.
            It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL,
            the UFC, Disney, Marvel, or any other brand or league referenced here. All product
            names and trademarks belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
