import db from '../../lib/db';
import NewsletterSignupForm from './NewsletterSignupForm';

export const metadata = {
  title: 'Weekly Release Roundup — PreorderCards',
  description:
    "One email a week covering every trading card release dropping that week — dates, formats, which drops are EQL raffle entries, and what's worth watching.",
};

// Reads the post archive, and the unsubscribe route redirects here with a
// query flag — neither survives static rendering.
export const dynamic = 'force-dynamic';

function formatPublished(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function NewsletterPage({ searchParams }) {
  const params = await searchParams;
  // Set by /api/newsletter/unsubscribe: '1' when the signed link resolved to
  // a real subscriber, '0' when it didn't (expired, edited, or already gone).
  const unsubscribed = params?.unsubscribed;
  // The archive is the blog itself — each weekly issue is a published post,
  // so there's no separate list of issues to keep in step with it.
  const issues = db.listBlogPosts.all().slice(0, 12);

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>The Weekly Release Roundup</h1>
          <p className="tagline">One email a week: every card release dropping, in order, before it drops.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          {unsubscribed === '1' && (
            <p
              style={{
                padding: '0.9rem 1rem',
                borderRadius: '8px',
                background: 'rgba(26,127,55,0.09)',
                color: '#1a7f37',
                fontWeight: 600,
              }}
            >
              You've been unsubscribed. You won't get the weekly roundup any more — no further action needed.
            </p>
          )}
          {unsubscribed === '0' && (
            <p
              style={{
                padding: '0.9rem 1rem',
                borderRadius: '8px',
                background: 'rgba(210,31,60,0.09)',
                color: '#d21f3c',
                fontWeight: 600,
              }}
            >
              That unsubscribe link couldn't be matched to a subscription — it may already have been used. Email{' '}
              <a href="mailto:admin@preordercards.com">admin@preordercards.com</a> and we'll take care of it by hand.
            </p>
          )}

          <p>
            Every week we send one email covering the trading card releases dated for that week: the date each one
            drops, the format, whether it's an EQL raffle entry or standard checkout, and a link straight to the
            release on our calendar so you can register interest in a click.
          </p>

          <p>
            It's free, it's one email a week, and every issue has a one-click unsubscribe at the bottom. We don't sell
            or share the list.
          </p>

          <NewsletterSignupForm />

          <h2>Recent issues</h2>
          {issues.length ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {issues.map((issue) => (
                <li key={issue.slug} style={{ padding: '1rem 0', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.25rem' }}>
                    {formatPublished(issue.datePublished)}
                  </p>
                  <h3 style={{ margin: '0 0 0.4rem' }}>
                    <a href={`/blog/${issue.slug}`}>{issue.title}</a>
                  </h3>
                  <p style={{ margin: 0 }}>{issue.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              The first issue hasn't gone out yet. Subscribe above and you'll get it with the next batch of drops — in
              the meantime, the <a href="/blog.html">blog</a> has our previous release roundups.
            </p>
          )}

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
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a> · <a href="/newsletter.html">Newsletter</a>
          </p>
        </div>
      </footer>
    </>
  );
}
