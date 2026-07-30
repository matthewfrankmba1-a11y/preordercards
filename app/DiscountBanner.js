'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'discountBannerState'; // 'dismissed' | 'signed-up'

export default function DiscountBanner() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [formHidden, setFormHidden] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== 'dismissed' && stored !== 'signed-up') {
      setVisible(true);
    }
  }, []);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'dismissed');
    setVisible(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    setSubmitting(true);

    try {
      const res = await fetch('/api/discount-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setFormHidden(true);
      setMessage(data.alreadySignedUp ? "You're already signed up!" : "You're in! Check your inbox for details on free seller fees.");
      localStorage.setItem(STORAGE_KEY, 'signed-up');
    } catch (err) {
      setMessage('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="discount-banner">
      <div className="wrap discount-banner-inner">
        <p className="discount-banner-text"><strong>Free seller fees for a limited time</strong> — sign up to receive newsletters and promotions.</p>
        {!formHidden && (
          <form className="discount-banner-form" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="you@example.com"
              aria-label="Email address"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="discount-banner-btn" disabled={submitting}>Sign Up</button>
          </form>
        )}
        {message && <p className="discount-banner-message">{message}</p>}
        <button type="button" className="discount-banner-dismiss" aria-label="Dismiss" onClick={handleDismiss}>×</button>
      </div>
    </div>
  );
}
