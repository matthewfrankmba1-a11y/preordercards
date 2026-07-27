'use client';

import { useEffect, useState } from 'react';
import ListingCard from './ListingCard';

export default function MarketplaceClient() {
  const [listings, setListings] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/marketplace')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setListings(data.listings);
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
    status = 'Could not load marketplace listings. Please refresh the page.';
  } else if (listings && listings.length === 0) {
    status = 'No listings available right now — check back soon.';
  }

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Marketplace</h1>
          <p className="tagline">In-hand inventory from trusted sellers, priced below eBay. No offers — register interest at the listed price.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        <div className="verified-seller-cta">
          <a className="notify-btn verified-seller-btn" href="/verified-seller.html">Apply to be a verified seller</a>
        </div>
        {status && <div className="status">{status}</div>}
        <div className="marketplace-grid">
          {listings && listings.map((listing) => <ListingCard listing={listing} key={listing.id} />)}
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
