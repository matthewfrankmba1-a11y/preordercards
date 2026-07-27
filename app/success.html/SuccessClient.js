'use client';

import { useEffect, useState } from 'react';

export default function SuccessClient() {
  const [photos, setPhotos] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/success-photos')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPhotos(data.photos);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let status = null;
  if (error) {
    status = 'Could not load photos. Please refresh the page.';
  } else if (photos && photos.length === 0) {
    status = 'No success stories posted yet — check back soon.';
  }

  return (
    <>
      <header className="site-header">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Success Stories</h1>
          <p className="tagline">Real orders, delivered. A look at collectors who registered interest and got their boxes.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        {status && <div className="status">{status}</div>}
        <div className="photo-grid">
          {photos && photos.map((photo) => (
            <div className="photo-card" key={photo.url}>
              <img src={photo.url} alt="Order confirmation screenshot" loading="lazy" />
            </div>
          ))}
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
