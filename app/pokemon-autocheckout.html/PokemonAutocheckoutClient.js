'use client';

import { useState } from 'react';

const PASSWORD = 'SIFTS2026';

export default function PokemonAutocheckoutClient() {
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (input === PASSWORD) {
      setUnlocked(true);
    } else {
      setError(true);
    }
  }

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Pokemon Center Autocheckout</h1>
          <p className="tagline">Never miss a random restock again.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        {!unlocked ? (
          <form className="seller-auth-form" style={{ maxWidth: '420px' }} onSubmit={handleSubmit}>
            <label className="form-field">
              <span className="form-label">Password</span>
              <input
                type="password"
                autoComplete="off"
                required
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(false);
                }}
              />
            </label>
            <button type="submit" className="notify-btn">Unlock</button>
            {error && <p className="form-message error">Incorrect password.</p>}
          </form>
        ) : (
          <div className="legal">
            <h2>How it works</h2>
            <p>
              Pokemon Center restocks its inventory <strong>randomly</strong>, often with little
              to no warning. By the time a restock is publicly announced, it's usually already
              sold out.
            </p>
            <p>
              Autocheckout means we watch for a restock and check out on your behalf the moment
              it happens — fast enough to actually beat the sellout. To do that, we need a{' '}
              <strong>card on file</strong> ahead of time, since there's no time to collect
              payment details after a restock goes live.
            </p>

            <h2>Ready to sign up?</h2>
            <p>
              Fill out the Autocheckout form to get started — it's the same kind of form used
              for Slot submissions elsewhere on the site.
            </p>
            <p>
              <a className="notify-btn" href="https://forms.gle/zRXJWZqKi3uqMJPa7" target="_blank" rel="noopener">Submit Autocheckout Details →</a>
            </p>

            <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
              Questions? Reach out to <a href="mailto:admin@preordercards.com">admin@preordercards.com</a>.
            </p>
          </div>
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service.
            It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL,
            the UFC, Disney, Marvel, Pokemon, The Pokemon Company, Nintendo, or any other brand
            or league referenced here. All product names and trademarks belong to their
            respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
