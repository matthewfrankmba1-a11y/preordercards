'use client';

import { useState } from 'react';

// Generic, original icon per sport (mirrors the header montage) — used to build
// a placeholder product image since we don't have licensed Topps box photography.
const SPORT_ICONS = {
  Baseball: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="32" cy="32" r="26" fill="rgba(255,255,255,0.14)"/>
    <path d="M14 14 Q32 28 14 50"/>
    <path d="M50 14 Q32 28 50 50"/>
  </svg>`,
  Basketball: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="32" cy="32" r="26" fill="rgba(255,255,255,0.14)"/>
    <line x1="32" y1="6" x2="32" y2="58"/>
    <line x1="6" y1="32" x2="58" y2="32"/>
    <path d="M10 14 Q32 32 10 50"/>
    <path d="M54 14 Q32 32 54 50"/>
  </svg>`,
  Football: `<svg viewBox="0 0 64 64" width="52" height="36" fill="none" stroke="#fff" stroke-width="2.5">
    <ellipse cx="32" cy="32" rx="28" ry="16" fill="rgba(255,255,255,0.22)"/>
    <line x1="14" y1="32" x2="50" y2="32"/>
    <line x1="26" y1="26" x2="26" y2="38"/>
    <line x1="32" y1="24" x2="32" y2="40"/>
    <line x1="38" y1="26" x2="38" y2="38"/>
  </svg>`,
  MMA: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <g transform="rotate(-20 20 32)">
      <ellipse cx="20" cy="26" rx="12" ry="14" fill="rgba(255,255,255,0.14)"/>
      <rect x="12" y="38" width="16" height="14" rx="4" fill="rgba(255,255,255,0.14)"/>
    </g>
    <g transform="rotate(20 44 32)">
      <ellipse cx="44" cy="26" rx="12" ry="14" fill="rgba(255,255,255,0.14)"/>
      <rect x="36" y="38" width="16" height="14" rx="4" fill="rgba(255,255,255,0.14)"/>
    </g>
  </svg>`,
  Soccer: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="32" cy="32" r="26" fill="rgba(255,255,255,0.14)"/>
    <polygon points="32,18 40,24 37,34 27,34 24,24" fill="rgba(255,255,255,0.3)"/>
    <line x1="32" y1="18" x2="32" y2="8"/>
    <line x1="40" y1="24" x2="50" y2="18"/>
    <line x1="37" y1="34" x2="44" y2="46"/>
    <line x1="27" y1="34" x2="20" y2="46"/>
    <line x1="24" y1="24" x2="14" y2="18"/>
  </svg>`,
  Golf: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="22" cy="20" r="9" fill="rgba(255,255,255,0.18)"/>
    <line x1="42" y1="8" x2="42" y2="54"/>
    <path d="M42 12 L26 18 L42 24" fill="rgba(255,255,255,0.3)"/>
    <line x1="34" y1="54" x2="50" y2="54"/>
  </svg>`,
  Entertainment: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2">
    <polygon points="32,4 38,22 58,20 44,34 50,54 32,42 14,54 20,34 6,20 26,22" fill="rgba(255,255,255,0.2)"/>
  </svg>`,
};

function sportSlug(sport) {
  return sport.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Undated releases show the manufacturer's own wording rather than a
// fabricated date — Panini lists a number of products as "coming soon" with
// no date attached, and guessing one would be a claim we can't stand behind.
function formatDate(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return 'Date to be announced';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function countText(count) {
  if (!count) return 'Be the first to register interest.';
  return `${count} collector${count === 1 ? '' : 's'} interested so far.`;
}

export default function ReleaseCard({ release, soldOut }) {
  const [quantity, setQuantity] = useState(1);
  const [contactType, setContactType] = useState('email');
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState({ text: '', kind: '' });
  const [submitting, setSubmitting] = useState(false);
  const [interestCount, setInterestCount] = useState(release.interestCount);

  const slug = sportSlug(release.sport);
  const icon = SPORT_ICONS[release.sport] || '';

  function handleToggle(type) {
    setContactType(type);
    setInputValue('');
    setMessage({ text: '', kind: '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const value = inputValue.trim();
    if (!value) {
      setMessage({ text: 'Enter a value first.', kind: 'error' });
      return;
    }

    setSubmitting(true);
    setMessage({ text: 'Submitting...', kind: '' });

    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: release.id,
          contactType,
          contactValue: value,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Something went wrong.', kind: 'error' });
      } else {
        setMessage({ text: "You're registered! We'll be in touch.", kind: 'success' });
        setInterestCount(data.interestCount);
      }
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  const cardInner = (
    <>
      <div className={`product-image tile-${slug}`}>
        <span className="product-image-brand">{(release.manufacturer || 'Topps').toUpperCase()}</span>
        <span dangerouslySetInnerHTML={{ __html: icon }} />
        <span className="product-image-format">{release.format}</span>
      </div>

      <div className="card-header">
        <span className="badge brand-badge">{release.manufacturer || 'Topps'}</span>
        <span className="badge sport-badge">{release.sport}</span>
        <span className="badge format-badge">{release.format}</span>
        {release.eql && <span className="badge eql-badge">EQL</span>}
      </div>
      <h3 className="card-title">{release.title}</h3>
      <p className="card-date">{formatDate(release.releaseDate)}</p>
      <p className="card-desc">{release.description || ''}</p>
      <p className="card-preorder-note">{release.isPreorderOpenDate ? 'This date is when preorders open, not the ship date.' : ''}</p>
      <p className="card-preorder-note">{release.eql ? 'Sold via EQL raffle entry, not first-come-first-served.' : ''}</p>
      <p className="card-count">{soldOut ? 'This release has already shipped.' : countText(interestCount)}</p>

      <form className="signup-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Quantity</span>
          <select className="quantity-select" disabled={soldOut} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>{i === 1 ? '1 item' : `${i} items`}</option>
            ))}
          </select>
        </label>

        <div className="contact-toggle">
          <button type="button" className={`toggle-btn${contactType === 'email' ? ' active' : ''}`} disabled={soldOut} onClick={() => handleToggle('email')}>Email</button>
          <button type="button" className={`toggle-btn${contactType === 'phone' ? ' active' : ''}`} disabled={soldOut} onClick={() => handleToggle('phone')}>Phone</button>
        </div>
        <div className="signup-row">
          <input
            type="text"
            className="contact-input"
            placeholder={contactType === 'email' ? 'you@example.com' : '(555) 555-5555'}
            autoComplete={contactType === 'email' ? 'email' : 'tel'}
            disabled={soldOut}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="notify-btn" disabled={soldOut || submitting}>{soldOut ? 'Sold Out' : 'Register Interest'}</button>
        </div>
        <p className={`form-message${message.kind ? ' ' + message.kind : ''}`} role="status">{message.text}</p>
        {/* Registering by email also joins the weekly roundup list (see
            lib/newsletter.js), so the form has to say so before the address
            is collected — not afterwards in the confirmation email. */}
        {contactType === 'email' && !soldOut && (
          <p className="signup-consent">
            Registering by email also gets you our free <a href="/newsletter.html">weekly release roundup</a>.
            Unsubscribe anytime.
          </p>
        )}
      </form>
    </>
  );

  // id doubles as a deep-link anchor: the weekly newsletter links each
  // release straight to its own card (/#<release id>) rather than dropping
  // readers at the top of the calendar.
  if (soldOut) {
    return (
      <article id={release.id} className="card sold-out">
        <div className="card-dim">{cardInner}</div>
        <div className="sold-out-ribbon">Sold Out</div>
      </article>
    );
  }

  return <article id={release.id} className="card">{cardInner}</article>;
}
