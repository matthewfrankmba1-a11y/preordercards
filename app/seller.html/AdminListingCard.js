'use client';

import { useRef, useState } from 'react';

export default function AdminListingCard({ listing, onChanged }) {
  const [labelMessage, setLabelMessage] = useState({ text: '', kind: '' });
  const [sendingLabel, setSendingLabel] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef(null);

  const detailRows = [
    ['Full Name', listing.sellerFullName],
    ['Phone', listing.sellerPhone],
    ['Email', listing.sellerEmail],
    ['Venmo', listing.sellerVenmo],
    ['CashApp', listing.sellerCashapp],
    ['Zelle', listing.sellerZelle],
  ];

  async function handleLabelSubmit(e) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setLabelMessage({ text: 'Choose a file first.', kind: 'error' });
      return;
    }
    setLabelMessage({ text: 'Sending...', kind: '' });
    setSendingLabel(true);
    const formData = new FormData();
    formData.append('label', file);
    try {
      const res = await fetch(`/api/seller/admin/listings/${listing.id}/shipping-label`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setLabelMessage({ text: data.error || 'Failed to send label.', kind: 'error' });
        return;
      }
      setLabelMessage({ text: 'Shipping label emailed to the seller!', kind: 'success' });
      setFileInputKey((k) => k + 1);
    } catch (err) {
      setLabelMessage({ text: 'Network error. Please try again.', kind: 'error' });
    } finally {
      setSendingLabel(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove "${listing.description}" by ${listing.sellerName}? This cannot be undone.`)) return;
    setRemoving(true);
    await fetch(`/api/seller/admin/listings/${listing.id}/remove`, { method: 'POST' });
    onChanged();
  }

  return (
    <div className="card seller-listing-card">
      <h3 className="card-title">{listing.description}</h3>
      <p className="card-desc">Seller: {listing.sellerName}</p>
      {listing.sku && <p className="card-desc">SKU: {listing.sku}</p>}
      <p className="card-date">${Number(listing.price).toFixed(2)} each × {listing.quantity}</p>
      <p className="card-desc">{listing.status === 'sold' ? 'Sold' : 'Active'}</p>

      <details className="admin-seller-details">
        <summary>Seller Details</summary>
        {detailRows.map(([label, value]) => (
          <p className="card-desc" key={label}>{label}: {value || 'Not provided'}</p>
        ))}
      </details>

      <form className="admin-label-form" onSubmit={handleLabelSubmit}>
        <input key={fileInputKey} type="file" accept="application/pdf,image/png,image/jpeg" ref={fileInputRef} />
        <button type="submit" className="stock-toggle-btn" disabled={sendingLabel}>Send Shipping Label</button>
        <p className={`form-message${labelMessage.kind ? ' ' + labelMessage.kind : ''}`}>{labelMessage.text}</p>
      </form>

      <button type="button" className="notify-btn" disabled={removing} onClick={handleRemove}>Remove Listing</button>
    </div>
  );
}
