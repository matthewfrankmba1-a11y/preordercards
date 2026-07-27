'use client';

import { useState } from 'react';

export default function VerifiedSellerApply() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [availability, setAvailability] = useState('');
  const [message, setMessage] = useState({ text: '', kind: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage({ text: 'Submitting...', kind: '' });

    try {
      const res = await fetch('/api/verified-seller-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, availability }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Something went wrong.', kind: 'error' });
        setSubmitting(false);
      } else {
        setMessage({ text: "Thanks! We'll be in touch to schedule a call.", kind: 'success' });
        setSubmitted(true);
      }
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="notify-btn verified-seller-btn" onClick={() => setOpen(true)}>
        Apply to be a verified seller
      </button>
    );
  }

  return (
    <div className="card verified-seller-card">
      <h3 className="card-title">Apply to be a verified seller</h3>
      <p className="card-desc">
        Tell us how to reach you and we&apos;ll call to talk through getting you set up.
      </p>
      <form className="signup-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Name</span>
          <input
            type="text"
            className="contact-input"
            placeholder="Your name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitted}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Phone number</span>
          <input
            type="text"
            className="contact-input"
            placeholder="(555) 555-5555"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={submitted}
          />
        </label>
        <label className="form-field">
          <span className="form-label">Good time to reach you for a call</span>
          <input
            type="text"
            className="contact-input"
            placeholder="e.g. Weekdays after 5pm ET"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
            disabled={submitted}
          />
        </label>
        <div className="signup-row">
          <button type="submit" className="notify-btn" disabled={submitting || submitted}>
            {submitted ? 'Submitted' : 'Submit application'}
          </button>
          {!submitted && (
            <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
          )}
        </div>
        <p className={`form-message${message.kind ? ' ' + message.kind : ''}`} role="status">{message.text}</p>
      </form>
    </div>
  );
}
