export const metadata = {
  title: 'Trust & Security — PreorderCards',
  description: 'How PreorderCards handles customer data, and independent verification that the site is safe.',
};

export default function TrustPage() {
  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Trust &amp; Security</h1>
          <p className="tagline">How we handle your information, and independent verification that this site is safe.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        <div className="legal">
          <h2>Our Commitment to Your Data</h2>
          <p>
            We hold the utmost respect for our customers&apos; information and understand the
            significant responsibility that comes with handling sensitive data. Every account
            and internal system we use is protected behind single sign-on with two-factor
            authentication on encrypted Google accounts. Once a drop is complete, related data
            is regularly purged from local machines rather than kept indefinitely.
          </p>

          <h2>Independent Safety Verification</h2>
          <p>
            We don&apos;t just say this site is safe — here&apos;s what independent, third-party
            scanners report.
          </p>

          <div className="photo-grid">
            <div className="photo-card">
              <img src="/images/trust/norton-safe-web.jpeg" alt="Norton Safe Web report for preordercards.com showing a Safe rating" loading="lazy" />
            </div>
            <div className="photo-card">
              <img src="/images/trust/google-transparency-report.jpeg" alt="Google Safe Browsing Transparency Report for preordercards.com showing no unsafe content found" loading="lazy" />
            </div>
            <div className="photo-card">
              <img src="/images/trust/ssltrust-scan.jpeg" alt="SSLTrust malware scan for preordercards.com showing 92 total checks with 0 positive matches" loading="lazy" />
            </div>
          </div>

          <ul>
            <li><strong>Norton Safe Web</strong> — rated Safe.</li>
            <li><strong>Google Safe Browsing</strong> (Transparency Report) — no unsafe content found.</li>
            <li><strong>SSLTrust malware scan</strong> — 92 total checks, 0 positive matches.</li>
          </ul>

          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Questions about how we handle data? Reach out to{' '}
            <a href="mailto:admin@preordercards.com">admin@preordercards.com</a>.
          </p>
        </div>
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
