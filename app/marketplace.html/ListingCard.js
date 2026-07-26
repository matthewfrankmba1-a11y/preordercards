'use client';

import { useState } from 'react';

const FEE_RATE = 0.025;
const SHIPPING_FEE_BASE = 6;
const SHIPPING_FEE_PER_ADDITIONAL_BOX = 1;
function shippingFee(quantity) {
  return SHIPPING_FEE_BASE + (quantity - 1) * SHIPPING_FEE_PER_ADDITIONAL_BOX;
}

export default function ListingCard({ listing }) {
  const maxQty = Math.min(10, listing.quantity);
  const [quantity, setQuantity] = useState(1);
  const [contactType, setContactType] = useState('email');
  const [inputValue, setInputValue] = useState('');
  const [message, setMessage] = useState({ text: '', kind: '' });
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState(false);

  const total = listing.price * quantity * (1 + FEE_RATE) + shippingFee(quantity);

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
      const res = await fetch('/api/listing-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          contactType,
          contactValue: value,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Something went wrong.', kind: 'error' });
        setSubmitting(false);
      } else {
        setMessage({ text: "You're registered! We'll be in touch.", kind: 'success' });
        setRegistered(true);
      }
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <article className="card">
      {listing.imageUrl && <div className="listing-image"><img src={listing.imageUrl} alt={listing.description} loading="lazy" /></div>}
      <h3 className="card-title">{listing.description}</h3>
      <p className="card-desc listing-sku">{listing.sku ? `SKU: ${listing.sku}` : ''}</p>
      <p className="card-date listing-price">${Number(listing.price).toFixed(2)} each</p>
      <p className="card-desc listing-seller">Seller: {listing.sellerName}</p>

      <form className="signup-form listing-interest-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Quantity</span>
          <select className="listing-quantity-select" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
            {Array.from({ length: maxQty }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>{i === 1 ? '1 item' : `${i} items`}</option>
            ))}
          </select>
        </label>
        <p className="fee-preview listing-total-preview">
          You&apos;ll pay ${total.toFixed(2)} total (incl. 2.5% fee + ${shippingFee(quantity)} shipping).
        </p>

        <div className="contact-toggle">
          <button type="button" className={`toggle-btn${contactType === 'email' ? ' active' : ''}`} onClick={() => handleToggle('email')}>Email</button>
          <button type="button" className={`toggle-btn${contactType === 'phone' ? ' active' : ''}`} onClick={() => handleToggle('phone')}>Phone</button>
        </div>
        <div className="signup-row">
          <input
            type="text"
            className="contact-input"
            placeholder={contactType === 'email' ? 'you@example.com' : '(555) 555-5555'}
            autoComplete={contactType === 'email' ? 'email' : 'tel'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="notify-btn" disabled={submitting}>{registered ? 'Registered' : 'Register Interest'}</button>
        </div>
        <p className={`form-message${message.kind ? ' ' + message.kind : ''}`} role="status">{message.text}</p>
      </form>
    </article>
  );
}
