import RequestPreorderForm from './RequestPreorderForm';

export const metadata = {
  title: 'Request a Preorder — PreorderCards',
  description:
    "Want something we don't list — a signed record, a console edition, an older release? Tell us what you're after and we'll try to secure it. Free to ask, no upfront payment.",
};

export default function RequestPreorderPage() {
  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Request a Preorder</h1>
          <p className="tagline">
            Cards or not — tell us what you're after and we'll try to secure it.
          </p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal" style={{ paddingBottom: '0.5rem' }}>
          <p>
            The calendar covers the Topps and Panini releases we track. This form is for everything else — a signed
            record, a console anniversary edition, a sealed case, an older release, a brand we don't list. Send it
            through and we'll tell you whether we can get it and what it would cost.
          </p>
          <p>
            <strong>Asking costs nothing.</strong> No payment is collected here and nothing is committed on your side.
            We'll come back to you with an answer either way.
          </p>
        </article>

        <RequestPreorderForm />

        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1.25rem auto 2rem', maxWidth: '760px' }}>
          Already on the calendar? Register interest on the{' '}
          <a href="/">release you want</a> instead — that way you're in the queue for our allocation.
        </p>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service. It is not affiliated with,
            endorsed by, or sponsored by Topps, Panini, MLB, the NBA, the NFL, the UFC, Disney, Marvel, or any other
            brand or league referenced here. All product names and trademarks belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> ·{' '}
            <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
