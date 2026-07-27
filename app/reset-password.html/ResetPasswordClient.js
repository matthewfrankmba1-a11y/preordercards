'use client';

import { useEffect, useState } from 'react';

export default function ResetPasswordClient() {
  const [token, setToken] = useState(undefined);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', kind: '' });
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    if (!t) {
      setMessage({ text: 'This reset link is missing its token. Request a new one from the seller dashboard.', kind: 'error' });
    }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Passwords do not match.', kind: 'error' });
      return;
    }

    setMessage({ text: 'Resetting...', kind: '' });

    try {
      const res = await fetch('/api/seller/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Could not reset password.', kind: 'error' });
        return;
      }
      setMessage({ text: 'Password reset! You can now log in with your new password.', kind: 'success' });
      setNewPassword('');
      setConfirmPassword('');
      setDone(true);
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Reset Password</h1>
          <p className="tagline">Set a new password for your seller account.</p>
          <a className="header-nav-link" href="/seller.html">← Back to Seller Dashboard</a>
        </div>
      </header>

      <main className="wrap">
        <form className="seller-auth-form" style={{ maxWidth: '420px' }} onSubmit={handleSubmit}>
          <label className="form-field">
            <span className="form-label">New Password</span>
            <input
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          <label className="form-field">
            <span className="form-label">Confirm New Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </label>
          <button type="submit" className="notify-btn" disabled={!token || done}>Reset Password</button>
          <p className={`form-message${message.kind ? ' ' + message.kind : ''}`}>{message.text}</p>
        </form>
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
