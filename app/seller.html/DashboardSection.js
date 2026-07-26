'use client';

import { useEffect, useState } from 'react';
import SellerListingCard from './SellerListingCard';
import AdminListingCard from './AdminListingCard';

const FEE_RATE = 0.025;
const SHIPPING_FEE_BASE = 6;
const SHIPPING_FEE_PER_ADDITIONAL_BOX = 1;
function shippingFee(quantity) {
  return SHIPPING_FEE_BASE + (quantity - 1) * SHIPPING_FEE_PER_ADDITIONAL_BOX;
}

function ProfileGate({ onSaved }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [venmo, setVenmo] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [zelle, setZelle] = useState('');
  const [message, setMessage] = useState({ text: '', kind: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage({ text: 'Saving...', kind: '' });
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim(),
          venmo: venmo.trim() || undefined,
          cashapp: cashapp.trim() || undefined,
          zelle: zelle.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Could not save profile.', kind: 'error' });
        return;
      }
      onSaved();
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  return (
    <section id="profile-gate-section">
      <div className="legal-notice">
        Before you can create any listings, we need a few details: your name, a phone
        number, and at least one way for us to send you payment — Venmo, CashApp, or
        Zelle. This also doubles as how you can recover your account if you ever lose
        your invite key.
      </div>
      <form className="seller-listing-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span className="form-label">Full Name</span>
          <input type="text" autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="form-field">
          <span className="form-label">Phone Number</span>
          <input type="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <p className="card-desc">Provide at least one of the following:</p>
        <label className="form-field">
          <span className="form-label">Venmo (optional)</span>
          <input type="text" placeholder="@your-venmo" value={venmo} onChange={(e) => setVenmo(e.target.value)} />
        </label>
        <label className="form-field">
          <span className="form-label">CashApp (optional)</span>
          <input type="text" placeholder="$your-cashapp" value={cashapp} onChange={(e) => setCashapp(e.target.value)} />
        </label>
        <label className="form-field">
          <span className="form-label">Zelle (optional)</span>
          <input type="text" placeholder="Zelle email or phone" value={zelle} onChange={(e) => setZelle(e.target.value)} />
        </label>
        <button type="submit" className="notify-btn">Save &amp; Continue</button>
        <p className={`form-message${message.kind ? ' ' + message.kind : ''}`}>{message.text}</p>
      </form>
    </section>
  );
}

function EmailForm({ initialEmail }) {
  const [email, setEmail] = useState(initialEmail || '');
  const [message, setMessage] = useState({ text: '', kind: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage({ text: 'Saving...', kind: '' });
    try {
      const res = await fetch('/api/seller/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Could not save email.', kind: 'error' });
        return;
      }
      setMessage({ text: data.email ? 'Alert email saved!' : 'Alert email removed.', kind: 'success' });
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  return (
    <form className="seller-listing-form" onSubmit={handleSubmit}>
      <h3>Alert Email</h3>
      <p className="card-desc">Get notified when one of your listings gets interest. No buyer contact info is included — that stays with us. Leave blank and save to remove it.</p>
      <label className="form-field">
        <span className="form-label">Email</span>
        <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="submit" className="notify-btn">Save Email</button>
      <p className={`form-message${message.kind ? ' ' + message.kind : ''}`}>{message.text}</p>
    </form>
  );
}

function ListingForm({ onAdded }) {
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState({ text: '', kind: '' });

  const priceNum = Number(price);
  let feePreview = '';
  if (priceNum > 0) {
    const net = priceNum * (1 - FEE_RATE);
    const shipping = shippingFee(quantity);
    const totalIfAllSold = net * quantity - shipping;
    feePreview = `You'll receive $${net.toFixed(2)} per unit after the 2.5% fee. A shipping fee also applies once per completed sale — $${SHIPPING_FEE_BASE} for 1 box, plus $${SHIPPING_FEE_PER_ADDITIONAL_BOX} per additional box (e.g. $${shipping} if a buyer orders all ${quantity}), deducted from your payout. If one buyer purchases all ${quantity}, you'd receive $${net.toFixed(2)} × ${quantity} − $${shipping} = $${totalIfAllSold.toFixed(2)} total.`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage({ text: 'Adding listing...', kind: '' });
    try {
      const res = await fetch('/api/seller/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          sku: sku.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          price: priceNum,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error || 'Could not add listing.', kind: 'error' });
        return;
      }
      setMessage({ text: 'Listing added!', kind: 'success' });
      setDescription('');
      setSku('');
      setImageUrl('');
      setQuantity(1);
      setPrice('');
      onAdded();
    } catch (err) {
      setMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  return (
    <form className="seller-listing-form" onSubmit={handleSubmit}>
      <h3>New Listing</h3>
      <label className="form-field">
        <span className="form-label">Description</span>
        <textarea maxLength={500} rows={3} required value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="form-label">SKU (optional)</span>
        <input type="text" maxLength={100} value={sku} onChange={(e) => setSku(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="form-label">Image URL (optional, stock photo link)</span>
        <input type="url" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
      </label>
      <label className="form-field">
        <span className="form-label">Quantity available</span>
        <select value={quantity} onChange={(e) => setQuantity(Number(e.target.value))}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => (
            <option key={i} value={i}>{i === 1 ? '1 item' : `${i} items`}</option>
          ))}
        </select>
      </label>
      <label className="form-field">
        <span className="form-label">Price per unit (USD)</span>
        <input type="number" min="0.01" step="0.01" required value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <p className="fee-preview">{feePreview}</p>
      <button type="submit" className="notify-btn">Add Listing</button>
      <p className={`form-message${message.kind ? ' ' + message.kind : ''}`}>{message.text}</p>
    </form>
  );
}

export default function DashboardSection({ seller, onProfileSaved }) {
  const [myListings, setMyListings] = useState(null);
  const [myListingsError, setMyListingsError] = useState(false);
  const [adminListings, setAdminListings] = useState(null);
  const [adminListingsError, setAdminListingsError] = useState(false);

  function loadMyListings() {
    fetch('/api/seller/listings')
      .then((res) => {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => setMyListings(data.listings))
      .catch(() => setMyListingsError(true));
  }

  function loadAdminListings() {
    fetch('/api/seller/admin/listings')
      .then((res) => {
        if (!res.ok) throw new Error('failed');
        return res.json();
      })
      .then((data) => setAdminListings(data.listings))
      .catch(() => setAdminListingsError(true));
  }

  useEffect(() => {
    if (!seller.profileComplete) return;
    loadMyListings();
    if (seller.isAdmin) loadAdminListings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller.profileComplete]);

  if (!seller.profileComplete) {
    return <ProfileGate onSaved={onProfileSaved} />;
  }

  return (
    <div id="dashboard-main">
      <div className="legal-notice">
        Price your listing lower than the lowest active listing on eBay for the same item.
        Our transaction fee is 2.5% — deducted from your payout as the seller, and added on
        top of what the buyer pays — versus eBay&apos;s roughly 13%, so buyers should always find
        a better price here. A shipping-label fee also applies once per completed sale on
        each side — $6 for the first box, plus $1 per additional box in the same sale
        (deducted from your payout, added to the buyer&apos;s total) — we&apos;ll email you the label
        to print once a sale is arranged. Items must be factory sealed.
      </div>

      <EmailForm initialEmail={seller.email} />
      <ListingForm onAdded={loadMyListings} />

      <h3>Your Listings</h3>
      <div className="seller-listings">
        {myListingsError && <p className="card-desc">Could not load your listings.</p>}
        {myListings && myListings.length === 0 && <p className="card-desc">No listings yet — add one above.</p>}
        {myListings && myListings.map((listing) => (
          <SellerListingCard listing={listing} onChanged={loadMyListings} key={listing.id} />
        ))}
      </div>

      {seller.isAdmin && (
        <section id="admin-section">
          <h3>Admin: All Listings</h3>
          <p className="card-desc">As the admin account, you can remove any seller&apos;s listing.</p>
          <div className="seller-listings">
            {adminListingsError && <p className="card-desc">Could not load listings.</p>}
            {adminListings && adminListings.length === 0 && <p className="card-desc">No listings exist yet.</p>}
            {adminListings && adminListings.map((listing) => (
              <AdminListingCard listing={listing} onChanged={loadAdminListings} key={listing.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
