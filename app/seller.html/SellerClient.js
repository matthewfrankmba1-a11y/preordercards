'use client';

import { useEffect, useState } from 'react';
import AuthSection from './AuthSection';
import DashboardSection from './DashboardSection';

export default function SellerClient() {
  const [seller, setSeller] = useState(null);

  useEffect(() => {
    fetch('/api/seller/me')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setSeller({
          displayName: data.displayName,
          isAdmin: data.isAdmin,
          email: data.email,
          profileComplete: data.profileComplete,
        });
      })
      .catch(() => {});
  }, []);

  function handleAuthed(data) {
    setSeller({
      displayName: data.displayName,
      isAdmin: data.isAdmin,
      email: data.email,
      profileComplete: data.profileComplete,
    });
  }

  function handleProfileSaved() {
    setSeller((prev) => ({ ...prev, profileComplete: true }));
  }

  async function handleLogout() {
    await fetch('/api/seller/logout', { method: 'POST' });
    setSeller(null);
  }

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Seller Dashboard</h1>
          <p className="tagline">List inventory for buyers to discover and register interest in.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        {!seller && <AuthSection onAuthed={handleAuthed} />}

        {seller && (
          <section id="dashboard-section">
            <div className="seller-welcome">
              <p>Signed in as <strong>{seller.displayName}{seller.isAdmin ? ' (Admin)' : ''}</strong></p>
              <button type="button" className="stock-toggle-btn" onClick={handleLogout}>Log Out</button>
            </div>
            <DashboardSection seller={seller} onProfileSaved={handleProfileSaved} />
          </section>
        )}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service.
            It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL,
            the UFC, Disney, Marvel, or any other brand or league referenced here. All product
            names and trademarks belong to their respective owners.
          </p>
        </div>
      </footer>
    </>
  );
}
