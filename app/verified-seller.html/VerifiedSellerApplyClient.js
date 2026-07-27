'use client';

import { useState } from 'react';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export default function VerifiedSellerApplyClient() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [availability, setAvailability] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [itemsToSell, setItemsToSell] = useState('');
  const [quantities, setQuantities] = useState('');
  const [whyGoodSeller, setWhyGoodSeller] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [message, setMessage] = useState({ text: '', kind: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleScreenshotChange(e) {
    const file = e.target.files && e.target.files[0];
    if (file && file.size > MAX_SCREENSHOT_BYTES) {
      setMessage({ text: 'Screenshot is too large (max 5MB).', kind: 'error' });
      setScreenshot(null);
      e.target.value = '';
      return;
    }
    setScreenshot(file || null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!screenshot) {
      setMessage({ text: 'Upload a screenshot of your StockX sales history.', kind: 'error' });
      return;
    }

    setSubmitting(true);
    setMessage({ text: 'Submitting...', kind: '' });

    const formData = new FormData();
    formData.append('name', name);
    formData.append('phone', phone);
    formData.append('availability', availability);
    formData.append('referredBy', referredBy);
    formData.append('itemsToSell', itemsToSell);
    formData.append('quantities', quantities);
    formData.append('whyGoodSeller', whyGoodSeller);
    formData.append('screenshot', screenshot);

    try {
      const res = await fetch('/api/verified-seller-apply', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Something went wrong.', kind: 'error' });
        setSubmitting(false);
      } else {
        setMessage({ text: "Thanks! We'll review your application and be in touch to schedule a call.", kind: 'success' });
        setSubmitted(true);
      }
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Become a Verified Seller</h1>
          <p className="tagline">Tell us about yourself and what you&apos;d like to sell on the marketplace.</p>
          <a className="header-nav-link" href="/marketplace.html">← Back to Marketplace</a>
        </div>
      </header>

      <main className="wrap">
        <div className="card verified-seller-card">
          <p className="card-desc integrity-note">
            The marketplace only works if buyers can trust that sellers ship exactly what they list, on time and as
            described — that integrity is the entire product. Because of that, we operate under a strict one-strike
            policy: a single confirmed instance of misrepresenting inventory, failing to ship, or defrauding a buyer
            results in permanent removal, no exceptions. We review every application, but if you were referred by an
            existing verified seller, mention their name below and your application goes to the front of the line.
          </p>

          {!submitted ? (
            <form className="signup-form" onSubmit={handleSubmit} encType="multipart/form-data">
              <label className="form-field">
                <span className="form-label">Name</span>
                <input type="text" className="contact-input" placeholder="Your name" autoComplete="name" required
                  value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">Phone number</span>
                <input type="text" className="contact-input" placeholder="(555) 555-5555" autoComplete="tel" required
                  value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">Good time to reach you for a call</span>
                <input type="text" className="contact-input" placeholder="e.g. Weekdays after 5pm ET" required
                  value={availability} onChange={(e) => setAvailability(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">Referred by (optional)</span>
                <input type="text" className="contact-input" placeholder="Name of an existing verified seller"
                  value={referredBy} onChange={(e) => setReferredBy(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">What do you want to sell on the site?</span>
                <textarea className="contact-input" rows={2} placeholder="e.g. 2026 Topps Chrome Baseball hobby boxes" required
                  value={itemsToSell} onChange={(e) => setItemsToSell(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">Quantities</span>
                <input type="text" className="contact-input" placeholder="e.g. 10-15 boxes per release" required
                  value={quantities} onChange={(e) => setQuantities(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">Why would you be a good seller?</span>
                <textarea className="contact-input" rows={3} placeholder="Your sourcing, experience, track record, etc." required
                  value={whyGoodSeller} onChange={(e) => setWhyGoodSeller(e.target.value)} />
              </label>
              <label className="form-field">
                <span className="form-label">Screenshot of your StockX sales history</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" required onChange={handleScreenshotChange} />
              </label>

              <div className="signup-row">
                <button type="submit" className="notify-btn" disabled={submitting}>Submit application</button>
              </div>
              <p className={`form-message${message.kind ? ' ' + message.kind : ''}`} role="status">{message.text}</p>
            </form>
          ) : (
            <p className={`form-message${message.kind ? ' ' + message.kind : ''}`} role="status">{message.text}</p>
          )}
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
