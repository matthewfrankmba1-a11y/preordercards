'use client';

import { useState } from 'react';

export default function RequestPreorderForm() {
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [contactType, setContactType] = useState('email');
  const [contactValue, setContactValue] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/request-preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product, quantity, contactType, contactValue, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        style={{
          maxWidth: '760px',
          margin: '0 auto',
          padding: '1rem 1.1rem',
          borderRadius: '8px',
          background: 'rgba(26,127,55,0.09)',
          color: '#1a7f37',
          fontWeight: 600,
        }}
      >
        Request received. We'll get back to you {contactType === 'email' ? 'by email' : 'by phone'} once we know whether
        we can secure it — no payment was collected and nothing is committed on your side.
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit} style={{ padding: '1.25rem', maxWidth: '760px', margin: '0 auto' }}>
      <label className="form-label" htmlFor="request-product">
        What are you after?
      </label>
      <input
        id="request-product"
        className="contact-input"
        style={{ width: '100%', marginBottom: '1rem' }}
        placeholder="2026 Topps Chrome Baseball — Hobby Box"
        maxLength={200}
        required
        value={product}
        onChange={(e) => setProduct(e.target.value)}
      />

      <label className="form-label" htmlFor="request-quantity">
        How many?
      </label>
      <select
        id="request-quantity"
        className="quantity-select"
        style={{ marginBottom: '1rem' }}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
      >
        {[1, 2, 3, 4, 5, 6, 8, 10, 12, 20, 50, 100].map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? 'item' : 'items'}
          </option>
        ))}
      </select>

      <label className="form-label">How should we reach you?</label>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.4rem 0 0.6rem' }}>
        <button
          type="button"
          className={`toggle-btn${contactType === 'email' ? ' active' : ''}`}
          onClick={() => setContactType('email')}
        >
          Email
        </button>
        <button
          type="button"
          className={`toggle-btn${contactType === 'phone' ? ' active' : ''}`}
          onClick={() => setContactType('phone')}
        >
          Phone
        </button>
      </div>
      <input
        className="contact-input"
        style={{ width: '100%', marginBottom: '0.4rem' }}
        type={contactType === 'email' ? 'email' : 'tel'}
        inputMode={contactType === 'email' ? 'email' : 'tel'}
        placeholder={contactType === 'email' ? 'you@example.com' : '(555) 123-4567'}
        autoComplete={contactType === 'email' ? 'email' : 'tel'}
        required
        value={contactValue}
        onChange={(e) => setContactValue(e.target.value)}
      />
      {contactType === 'email' && (
        <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0 0 1rem' }}>
          Requesting by email also gets you our free{' '}
          <a href="/newsletter.html">weekly release roundup</a>. Unsubscribe anytime.
        </p>
      )}

      <label className="form-label" htmlFor="request-notes">
        Anything else? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
      </label>
      <textarea
        id="request-notes"
        className="contact-input"
        rows={4}
        maxLength={1000}
        style={{ width: '100%', marginBottom: '1rem', fontFamily: 'inherit', resize: 'vertical' }}
        placeholder="A price you have in mind, a release window, a specific configuration…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      {error && <div className="status">{error}</div>}

      <button type="submit" className="notify-btn" disabled={submitting || !product.trim() || !contactValue.trim()}>
        {submitting ? 'Sending…' : 'Send request'}
      </button>
    </form>
  );
}
