'use client';

import { useState } from 'react';

const FEE_RATE = 0.025;

export default function SellerListingCard({ listing, onChanged }) {
  const [marking, setMarking] = useState(false);

  async function handleMarkSold() {
    setMarking(true);
    await fetch(`/api/seller/listings/${listing.id}/sold`, { method: 'POST' });
    onChanged();
  }

  return (
    <div className="card seller-listing-card">
      <h3 className="card-title">{listing.description}</h3>
      {listing.sku && <p className="card-desc">SKU: {listing.sku}</p>}
      <p className="card-date">
        ${Number(listing.price).toFixed(2)} each — you receive ${(Number(listing.price) * (1 - FEE_RATE)).toFixed(2)} each after fee
      </p>
      <p className="card-desc">Quantity: {listing.quantity}</p>
      <p className="card-desc">{listing.status === 'sold' ? 'Sold' : 'Active'}</p>
      {listing.status === 'active' && (
        <button type="button" className="stock-toggle-btn" disabled={marking} onClick={handleMarkSold}>Mark Sold</button>
      )}
    </div>
  );
}
