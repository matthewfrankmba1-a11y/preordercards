'use client';

import { useState } from 'react';

// Same shape as the homepage discount banner's form, pointed at
// /api/newsletter/subscribe so the welcome email matches what this page
// promised — a weekly roundup, not the seller-fee promo.
export default function NewsletterSignupForm() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ text: '', kind: '' });
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ text: '', kind: '' });

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Something went wrong. Please try again.', kind: 'error' });
        setSubmitting(false);
        return;
      }
      setDone(true);
      setMessage({
        text: data.alreadySignedUp
          ? "You're already on the list — the next roundup is on its way."
          : "You're in. Check your inbox for a confirmation, and watch for the first roundup this weekend.",
        kind: 'success',
      });
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <form className="signup-form" onSubmit={handleSubmit} style={{ marginTop: '1rem' }}>
      {!done && (
        <div className="signup-row">
          <input
            type="email"
            className="contact-input"
            placeholder="you@example.com"
            aria-label="Email address"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit" className="notify-btn" disabled={submitting}>
            {submitting ? 'Signing up…' : 'Subscribe'}
          </button>
        </div>
      )}
      <p className={`form-message${message.kind ? ' ' + message.kind : ''}`} role="status">{message.text}</p>
    </form>
  );
}
