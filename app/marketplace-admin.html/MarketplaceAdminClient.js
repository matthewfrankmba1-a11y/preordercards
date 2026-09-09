'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

async function postJson(url, body, extraHeaders) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// SQLite's CURRENT_TIMESTAMP is 'YYYY-MM-DD HH:MM:SS' in UTC with no 'T'/'Z'
// — Date can't parse that directly without the substitution below (see the
// identical note in lib/statsSummary.js). Kept short (no year, no seconds)
// so the timestamp column doesn't force the table wider than the screen.
function formatTimestamp(sqlTimestamp) {
  if (!sqlTimestamp) return '—';
  return new Date(sqlTimestamp.replace(' ', 'T') + 'Z').toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Release dates are plain YYYY-MM-DD calendar dates, not instants — parsed
// field-by-field so the local timezone can't shift them a day backwards the
// way `new Date('2026-07-15')` (parsed as UTC midnight) would.
function formatReleaseDate(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDollar(amount) {
  return `$${amount.toFixed(2)}`;
}

function SetupPanel({ onEnrolled }) {
  const [adminSecret, setAdminSecret] = useState('');
  const [step, setStep] = useState('secret'); // 'secret' | 'confirm'
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleBeginSetup(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/totp/setup', {}, { 'x-admin-secret': adminSecret });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Could not start setup. Check the admin secret.');
      return;
    }
    setQr(data);
    setStep('confirm');
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/totp/confirm', { code }, { 'x-admin-secret': adminSecret });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Incorrect code.');
      return;
    }
    onEnrolled();
  }

  if (step === 'secret') {
    return (
      <form className="totp-panel" onSubmit={handleBeginSetup}>
        <p>No authenticator is set up for this page yet. Enter the site admin secret to begin.</p>
        <input
          type="password"
          placeholder="Admin secret"
          autoComplete="off"
          required
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
        />
        <button type="submit" className="notify-btn" disabled={busy}>
          {busy ? 'Checking…' : 'Begin Setup'}
        </button>
        {error && <p className="form-message error">{error}</p>}
      </form>
    );
  }

  return (
    <form className="totp-panel" onSubmit={handleConfirm}>
      <p>Scan this QR code with Google Authenticator (or any TOTP app), then enter the current 6-digit code to confirm.</p>
      <div className="totp-qr-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr.qrDataUrl} alt="TOTP QR code" />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Can&apos;t scan? Enter this key manually:</p>
      <div className="totp-secret">{qr.secret}</div>
      <input
        type="text"
        inputMode="numeric"
        placeholder="000000"
        maxLength={6}
        autoComplete="off"
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <button type="submit" className="notify-btn" disabled={busy || code.length !== 6}>
        {busy ? 'Confirming…' : 'Confirm'}
      </button>
      {error && <p className="form-message error">{error}</p>}
    </form>
  );
}

function LoginPanel({ onLoggedIn, onResetRequested }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/totp/login', { code });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Incorrect code.');
      return;
    }
    onLoggedIn();
  }

  return (
    <form className="totp-panel" onSubmit={handleSubmit}>
      <p>Enter your Google Authenticator code to continue.</p>
      <input
        type="text"
        inputMode="numeric"
        placeholder="000000"
        maxLength={6}
        autoComplete="off"
        autoFocus
        required
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      <button type="submit" className="notify-btn" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
      {error && <p className="form-message error">{error}</p>}
      <button
        type="button"
        onClick={onResetRequested}
        style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        Lost your authenticator? Reset it
      </button>
    </form>
  );
}

function SortHeader({ label, field, sort, onSort, nowrap }) {
  const active = sort.field === field;
  return (
    <th className={nowrap ? 'admin-nowrap' : undefined}>
      <button type="button" className="sort-btn" onClick={() => onSort(field)}>
        {label}
        {active && <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function useSortedData(data, accessors, initialField) {
  const [sort, setSort] = useState({ field: initialField, dir: 'asc' });
  const sorted = useMemo(() => {
    if (!data) return [];
    const accessor = accessors[sort.field];
    const copy = [...data];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [data, accessors, sort]);
  function handleSort(field) {
    setSort((prev) => (prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
  }
  return { sorted, sort, handleSort };
}

const EXPIRY_OPTIONS = [
  { value: 168, label: '7 days' },
  { value: 24, label: '24 hours' },
  { value: 0, label: 'Never expires' },
];

// The preview comes from the server rather than being rebuilt here, so the
// admin reads the exact text the applicant will get — one builder, no
// lookalike copy to drift out of sync (see the route's own note).
function InviteSellerModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [expiryHours, setExpiryHours] = useState(168);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [sent, setSent] = useState(null);
  const [error, setError] = useState('');
  const [strandedKey, setStrandedKey] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sent) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { ok, data } = await postJson('/api/admin/marketplace/invite-seller', {
        preview: true,
        expiryHours,
        note,
      });
      if (!cancelled && ok) setPreview(data);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [expiryHours, note, sent]);

  async function handleSend(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStrandedKey(null);
    const { ok, data } = await postJson('/api/admin/marketplace/invite-seller', {
      email,
      expiryHours,
      note,
    });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Could not send this invite.');
      // A 502 means the key exists but the email never left — surface it so
      // it can be passed along by hand instead of minting a second one.
      if (data.keyCode) setStrandedKey(data.keyCode);
      return;
    }
    setSent(data);
  }

  if (sent) {
    return (
      <div className="admin-modal-overlay" onClick={onClose}>
        <div className="admin-modal admin-modal-wide" onClick={(e) => e.stopPropagation()}>
          <h3>Invite sent</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0 }}>{sent.email}</p>
          <div className="admin-invite-result">
            <div className="admin-invite-key">{sent.keyCode}</div>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>
              {sent.expiresAt
                ? `Expires ${formatTimestamp(sent.expiresAt.replace('T', ' ').slice(0, 19))}`
                : 'Never expires'}
              . They appear in the Sellers table once they sign up.
            </p>
          </div>
          <div className="admin-modal-actions">
            <button type="button" className="notify-btn" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Invite an approved seller</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0 }}>
          Mints a single-use key and emails it with login instructions.
        </p>
        <form onSubmit={handleSend}>
          <div className="admin-modal-field">
            <label htmlFor="invite-email">Their email</label>
            <input
              id="invite-email"
              type="email"
              required
              autoComplete="off"
              placeholder="seller@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="admin-modal-field">
            <label htmlFor="invite-expiry">Key valid for</label>
            <select id="invite-expiry" value={expiryHours} onChange={(e) => setExpiryHours(Number(e.target.value))}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="admin-modal-field">
            <label htmlFor="invite-note">Personal note (optional) — added before the sign-off</label>
            <textarea
              id="invite-note"
              rows={3}
              placeholder="Thanks for the StockX screenshots — everything checked out."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {preview && (
            <>
              <div className="admin-modal-field" style={{ marginBottom: '0.35rem' }}>
                <label>Preview — subject: {preview.subject}</label>
              </div>
              <div className="admin-email-preview">{preview.body}</div>
            </>
          )}

          {error && <p className="form-message error">{error}</p>}
          {strandedKey && (
            <div className="admin-invite-result">
              <div className="admin-invite-key">{strandedKey}</div>
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '0.4rem 0 0' }}>
                This key is live. Send it manually — don&apos;t re-send, that mints a second key.
              </p>
            </div>
          )}

          <div className="admin-modal-actions">
            <button type="button" className="admin-modal-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="notify-btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const SELLER_SORT_ACCESSORS = {
  email: (s) => (s.email || '').toLowerCase(),
  completedSales: (s) => s.completedSales,
  pendingSales: (s) => s.pendingSales,
  loginCount: (s) => s.loginCount,
};

function SellersView() {
  const [sellers, setSellers] = useState(null);
  const [error, setError] = useState('');
  const [removingKey, setRemovingKey] = useState(null);
  const [inviting, setInviting] = useState(false);
  const { sorted, sort, handleSort } = useSortedData(sellers, SELLER_SORT_ACCESSORS, 'email');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/marketplace/sellers')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSellers(data.sellers);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load sellers.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRemoveKey(seller) {
    const label = seller.email || seller.displayName || seller.inviteKey;
    if (!window.confirm(`Remove ${label}'s key? This deletes their account, listings, and sessions. This can't be undone.`)) {
      return;
    }
    setRemovingKey(seller.inviteKey);
    const { ok, data } = await postJson('/api/admin/marketplace/sellers/revoke-key', { keyCode: seller.inviteKey });
    setRemovingKey(null);
    if (!ok) {
      window.alert(data.error || 'Could not remove key.');
      return;
    }
    setSellers((prev) => prev.filter((s) => s.inviteKey !== seller.inviteKey));
  }

  return (
    <>
      <div className="admin-section-head">
        <h2>Sellers ({sellers ? sellers.length : '…'})</h2>
        <button type="button" className="notify-btn" onClick={() => setInviting(true)}>
          Invite a Seller
        </button>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
        Invite emails an approved applicant their single-use key plus login instructions. They show up in this
        table once they sign up with it.
      </p>
      {error && <div className="status">{error}</div>}
      {sellers && sellers.length === 0 && <div className="status">No sellers have signed up yet.</div>}
      {sellers && sellers.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <colgroup>
              <col style={{ width: '26%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '12%' }} />
            </colgroup>
            <thead>
              <tr>
                <SortHeader label="Email" field="email" sort={sort} onSort={handleSort} />
                <SortHeader label="Completed" field="completedSales" sort={sort} onSort={handleSort} nowrap />
                <SortHeader label="Pending" field="pendingSales" sort={sort} onSort={handleSort} nowrap />
                <th>Selling Key</th>
                <th className="admin-nowrap">Logged In</th>
                <SortHeader label="Logins" field="loginCount" sort={sort} onSort={handleSort} nowrap />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.inviteKey}>
                  <td>{s.email || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td className="admin-nowrap">{s.completedSales}</td>
                  <td className="admin-nowrap">{s.pendingSales}</td>
                  <td className="admin-key-code">{s.inviteKey}</td>
                  <td className="admin-nowrap">
                    <span className={`admin-badge ${s.loggedIn ? 'admin-badge-yes' : 'admin-badge-no'}`}>
                      {s.loggedIn ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="admin-nowrap">{s.loginCount}</td>
                  <td>
                    <button
                      type="button"
                      className="admin-remove-btn"
                      disabled={removingKey === s.inviteKey}
                      onClick={() => handleRemoveKey(s)}
                    >
                      {removingKey === s.inviteKey ? 'Removing…' : 'Remove Key'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {inviting && <InviteSellerModal onClose={() => setInviting(false)} />}
    </>
  );
}

const PREORDER_SORT_ACCESSORS = {
  contact: (r) => r.contactValue.toLowerCase(),
  release: (r) => r.releaseTitle.toLowerCase(),
  quantity: (r) => r.quantity,
  registrationCount: (r) => r.registrationCount,
  // Releases with no date left on file sort to the end ascending rather than
  // to the top, where they'd bury the soonest real dates.
  releaseDate: (r) => r.releaseDate || '9999-12-31',
  createdAt: (r) => r.createdAt,
};

// Suggested starting point for the fee field — matches the marketplace's
// own FEE_RATE (lib/marketplaceCore.js), but it's just a pre-fill; the
// admin can freely override it before sending.
const SUGGESTED_FEE_RATE = 0.025;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function NotifyModal({ registration, onClose, onSent }) {
  const [step, setStep] = useState('choose'); // 'choose' | 'secured-form' | 'not-secured-confirm'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [quantity, setQuantity] = useState(String(registration.quantity));
  const [pricePerBox, setPricePerBox] = useState('');
  const [marketPrice, setMarketPrice] = useState('');
  const [savings, setSavings] = useState('');
  const [fee, setFee] = useState('');
  const [savingsTouched, setSavingsTouched] = useState(false);
  const [feeTouched, setFeeTouched] = useState(false);

  // Savings and fee auto-recalculate from quantity/price/market as long as
  // the admin hasn't directly edited them — once touched, their own value
  // wins instead of being silently overwritten.
  useEffect(() => {
    if (savingsTouched) return;
    const computed = (toNumber(marketPrice) - toNumber(pricePerBox)) * toNumber(quantity);
    setSavings(computed ? computed.toFixed(2) : '');
  }, [quantity, pricePerBox, marketPrice, savingsTouched]);

  useEffect(() => {
    if (feeTouched) return;
    const computed = toNumber(pricePerBox) * toNumber(quantity) * SUGGESTED_FEE_RATE;
    setFee(computed ? computed.toFixed(2) : '');
  }, [quantity, pricePerBox, feeTouched]);

  const subtotal = toNumber(pricePerBox) * toNumber(quantity);
  const amountDue = subtotal + toNumber(fee);

  async function handleSendSecured(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/preorder-registrations/notify-secured', {
      id: registration.id,
      quantity: toNumber(quantity),
      pricePerBox: toNumber(pricePerBox),
      marketPrice: toNumber(marketPrice),
      savings: toNumber(savings),
      fee: toNumber(fee),
    });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Could not send this email.');
      return;
    }
    onSent('secured');
  }

  async function handleSendNotSecured() {
    setBusy(true);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/preorder-registrations/notify-not-secured', { id: registration.id });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Could not send this email.');
      return;
    }
    onSent('not_secured');
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Notify {registration.contactValue}</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 0 }}>{registration.releaseTitle}</p>

        {step === 'choose' && (
          <>
            <p>Was this preorder secured?</p>
            <div className="admin-modal-choices">
              <button type="button" className="notify-btn" onClick={() => setStep('secured-form')}>🎉 Secured</button>
              <button type="button" className="admin-modal-btn-secondary" onClick={() => setStep('not-secured-confirm')}>Not Secured</button>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-btn-secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}

        {step === 'not-secured-confirm' && (
          <>
            <p>This sends an email letting them know the preorder wasn&apos;t secured and no payment was collected. Continue?</p>
            {error && <p className="form-message error">{error}</p>}
            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-btn-secondary" onClick={() => setStep('choose')}>Back</button>
              <button type="button" className="notify-btn" disabled={busy} onClick={handleSendNotSecured}>
                {busy ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </>
        )}

        {step === 'secured-form' && (
          <form onSubmit={handleSendSecured}>
            <div className="admin-modal-field">
              <label htmlFor="notify-qty">Boxes secured</label>
              <input id="notify-qty" type="number" min="1" step="1" required value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="admin-modal-field">
              <label htmlFor="notify-price">Price per box ($)</label>
              <input id="notify-price" type="number" min="0" step="0.01" required value={pricePerBox} onChange={(e) => setPricePerBox(e.target.value)} />
            </div>
            <div className="admin-modal-field">
              <label htmlFor="notify-market">Current market price ($ per box)</label>
              <input id="notify-market" type="number" min="0" step="0.01" required value={marketPrice} onChange={(e) => setMarketPrice(e.target.value)} />
            </div>
            <div className="admin-modal-field">
              <label htmlFor="notify-savings">Savings ($) — auto-calculated, editable</label>
              <input
                id="notify-savings"
                type="number"
                step="0.01"
                value={savings}
                onChange={(e) => {
                  setSavingsTouched(true);
                  setSavings(e.target.value);
                }}
              />
            </div>
            <div className="admin-modal-field">
              <label htmlFor="notify-fee">Service fee ($) — editable</label>
              <input
                id="notify-fee"
                type="number"
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => {
                  setFeeTouched(true);
                  setFee(e.target.value);
                }}
              />
            </div>
            <div className="admin-modal-summary">
              <div><span>Subtotal</span><span>{formatDollar(subtotal)}</span></div>
              <div><strong>Amount due</strong><strong>{formatDollar(amountDue)}</strong></div>
            </div>
            {error && <p className="form-message error">{error}</p>}
            <div className="admin-modal-actions">
              <button type="button" className="admin-modal-btn-secondary" onClick={() => setStep('choose')}>Back</button>
              <button type="submit" className="notify-btn" disabled={busy}>
                {busy ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// Column definitions drive the header, the body and the hide/show picker
// from one place, so a column can't end up in the header without a matching
// cell — the failure mode of editing thead and tbody separately. Order here
// is the order on screen.
const PREORDER_COLUMNS = [
  {
    key: 'contact',
    label: 'Contact',
    width: 16,
    sortField: 'contact',
    render: (r) => <span className="admin-nowrap-ellipsis" title={r.contactValue}>{r.contactValue}</span>,
  },
  { key: 'release', label: 'Release', width: 15, sortField: 'release', render: (r) => r.releaseTitle },
  { key: 'quantity', label: 'Qty', width: 4, sortField: 'quantity', nowrap: true, render: (r) => r.quantity },
  {
    key: 'registrationCount',
    label: 'Times Reg.',
    width: 7,
    sortField: 'registrationCount',
    nowrap: true,
    render: (r) => r.registrationCount,
  },
  {
    key: 'createdAt',
    label: 'Registered',
    width: 8,
    sortField: 'createdAt',
    nowrap: true,
    render: (r) => formatTimestamp(r.createdAt),
  },
  {
    key: 'releaseDate',
    label: 'Release Date',
    width: 9,
    sortField: 'releaseDate',
    nowrap: true,
    title: (r) => (r.isPreorderOpenDate ? 'Preorder-open date, not the ship date' : 'Street date'),
    render: (r) => (
      <>
        {formatReleaseDate(r.releaseDate)}
        {r.isPreorderOpenDate && <span style={{ color: 'var(--muted)' }}> *</span>}
      </>
    ),
  },
  {
    key: 'status',
    label: 'Status',
    width: 7,
    nowrap: true,
    render: (r) => (
      <span className={`admin-badge ${r.cancelled ? 'admin-badge-no' : 'admin-badge-yes'}`}>
        {r.cancelled ? 'Unfulfilled' : 'Active'}
      </span>
    ),
  },
  {
    key: 'notify',
    label: 'Notify',
    width: 13,
    render: (r, ctx) =>
      r.contactType !== 'email' ? (
        <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>No email</span>
      ) : (
        <div className="admin-actions-cell">
          {r.outcome && (
            <span className={`admin-badge ${r.outcome === 'secured' ? 'admin-badge-yes' : 'admin-badge-no'}`}>
              {r.outcome === 'secured' ? 'Secured' : 'Not Secured'}
            </span>
          )}
          <button type="button" className="admin-remove-btn" onClick={() => ctx.setNotifyRow(r)}>
            {r.outcome ? 'Re-notify' : 'Notify'}
          </button>
        </div>
      ),
  },
  {
    key: 'actions',
    label: 'Actions',
    width: 15,
    render: (r, ctx) => (
      <div className="admin-actions-cell">
        <button
          type="button"
          className="admin-remove-btn"
          disabled={ctx.updatingId === r.id}
          onClick={() => ctx.onToggleCancelled(r)}
        >
          {ctx.updatingId === r.id ? 'Saving…' : r.cancelled ? 'Restore' : 'Shade'}
        </button>
        <button type="button" className="admin-remove-btn" disabled={ctx.updatingId === r.id} onClick={() => ctx.onDelete(r)}>
          Delete
        </button>
      </div>
    ),
  },
  {
    key: 'ackEmail',
    label: 'Ack Email',
    width: 6,
    nowrap: true,
    align: 'right',
    render: (r) => (
      <span
        className="admin-status-dot"
        title={
          r.contactType !== 'email'
            ? 'No email on file'
            : r.emailSentAt
              ? `Sent ${formatTimestamp(r.emailSentAt)}`
              : 'Not sent — auto-send may still be in flight, or it failed'
        }
        style={{ background: r.contactType !== 'email' ? 'var(--muted)' : r.emailSentAt ? '#1a7f37' : 'var(--red)' }}
      />
    ),
  },
];

// Remembered per browser, not per account — it's a display preference, and
// storing it server-side would mean a migration and an endpoint for
// something that should follow the screen you're working on.
function useHiddenColumns(storageKey) {
  const [hidden, setHidden] = useState([]);

  // Read after mount rather than in the initial state: the server renders
  // with nothing hidden, so reading localStorage during render would make
  // the first client paint disagree with the server's HTML.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(stored)) setHidden(stored);
    } catch {
      /* unreadable or unavailable storage just means nothing is hidden */
    }
  }, [storageKey]);

  function persist(next) {
    setHidden(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* the toggle still works for this session if storage is blocked */
    }
  }

  return {
    hidden,
    toggle: (key) => persist(hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]),
    showAll: () => persist([]),
  };
}

function ColumnPicker({ columns, hidden, onToggle, onShowAll }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center', margin: '0 0 0.75rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginRight: '0.15rem' }}>Columns:</span>
      {columns.map((col) => {
        const isHidden = hidden.includes(col.key);
        return (
          <button
            key={col.key}
            type="button"
            className={`stock-toggle-btn${isHidden ? '' : ' active'}`}
            aria-pressed={!isHidden}
            title={isHidden ? `Show ${col.label}` : `Hide ${col.label}`}
            onClick={() => onToggle(col.key)}
            style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
          >
            {col.label}
          </button>
        );
      })}
      {hidden.length > 0 && (
        <button
          type="button"
          className="stock-toggle-btn"
          onClick={onShowAll}
          style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
        >
          Show all
        </button>
      )}
    </div>
  );
}

function PreorderRegistrationsView() {
  const [registrations, setRegistrations] = useState(null);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [notifyRow, setNotifyRow] = useState(null);
  const { sorted, sort, handleSort } = useSortedData(registrations, PREORDER_SORT_ACCESSORS, 'releaseDate');
  const { hidden, toggle, showAll } = useHiddenColumns('adminPreorderHiddenColumns');

  const visibleColumns = PREORDER_COLUMNS.filter((col) => !hidden.includes(col.key));
  // Widths are authored against the full set, so they under-sum once columns
  // are hidden. table-layout is fixed, so rescale to keep the remaining
  // columns proportional instead of leaving the table to guess.
  const widthTotal = visibleColumns.reduce((sum, col) => sum + col.width, 0) || 1;

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/marketplace/preorder-registrations')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setRegistrations(data.registrations);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load preorder registrations.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleCancelled(row) {
    const nextCancelled = !row.cancelled;
    if (nextCancelled && !window.confirm('Shade this registration out as unfulfilled? It stays on record — you can restore it later.')) {
      return;
    }
    setUpdatingId(row.id);
    const { ok, data } = await postJson('/api/admin/marketplace/preorder-registrations/cancel', { id: row.id, cancelled: nextCancelled });
    setUpdatingId(null);
    if (!ok) {
      window.alert(data.error || 'Could not update this registration.');
      return;
    }
    setRegistrations((prev) => prev.map((r) => (r.id === row.id ? { ...r, cancelled: nextCancelled } : r)));
  }

  async function handleDelete(row) {
    if (!window.confirm(`Permanently delete this registration (${row.contactValue} — ${row.releaseTitle})? This is for test records only and can't be undone.`)) {
      return;
    }
    setUpdatingId(row.id);
    const { ok, data } = await postJson('/api/admin/marketplace/preorder-registrations/delete', { id: row.id });
    setUpdatingId(null);
    if (!ok) {
      window.alert(data.error || 'Could not delete this registration.');
      return;
    }
    setRegistrations((prev) => prev.filter((r) => r.id !== row.id));
  }

  function handleNotifySent(outcome) {
    setRegistrations((prev) =>
      prev.map((r) => (r.id === notifyRow.id ? { ...r, outcome, outcomeNotifiedAt: new Date().toISOString() } : r))
    );
    setNotifyRow(null);
  }

  const ctx = { updatingId, setNotifyRow, onToggleCancelled: handleToggleCancelled, onDelete: handleDelete };

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Preorder Registrations ({registrations ? registrations.length : '…'})</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
        Release-calendar interest signups. &quot;Times Registered&quot; counts every registration that contact has made across all releases.
        Shade marks a registration unfulfilled (reversible); Delete permanently removes a row and should only be used for test records.
        Sorted by release date by default (soonest first) so nothing slips past regardless of when the customer
        registered — a * after a date means it&apos;s the preorder-open date, not the ship date.
        Notify sends the buyer a secured/not-secured email. Ack Email is green once the automatic
        &quot;we got your registration&quot; email has sent, red if it hasn&apos;t (or failed), grey if there&apos;s no email on file.
        Click a column name below to hide it — the choice is remembered on this device.
      </p>
      {error && <div className="status">{error}</div>}
      {registrations && registrations.length === 0 && <div className="status">No registrations yet.</div>}
      {registrations && registrations.length > 0 && (
        <>
          <ColumnPicker columns={PREORDER_COLUMNS} hidden={hidden} onToggle={toggle} onShowAll={showAll} />
          {visibleColumns.length === 0 ? (
            <div className="status">Every column is hidden — turn one back on above.</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <colgroup>
                  {visibleColumns.map((col) => (
                    <col key={col.key} style={{ width: `${((col.width / widthTotal) * 100).toFixed(2)}%` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {visibleColumns.map((col) =>
                      col.sortField ? (
                        <SortHeader
                          key={col.key}
                          label={col.label}
                          field={col.sortField}
                          sort={sort}
                          onSort={handleSort}
                          nowrap={col.nowrap}
                        />
                      ) : (
                        <th
                          key={col.key}
                          className={col.nowrap ? 'admin-nowrap' : undefined}
                          style={col.align === 'right' ? { textAlign: 'right' } : undefined}
                        >
                          {col.label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.id} style={r.cancelled ? { opacity: 0.45 } : undefined}>
                      {visibleColumns.map((col) => (
                        <td
                          key={col.key}
                          className={col.nowrap ? 'admin-nowrap' : undefined}
                          title={col.title ? col.title(r) : undefined}
                          style={col.align === 'right' ? { textAlign: 'right' } : undefined}
                        >
                          {col.render(r, ctx)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {notifyRow && <NotifyModal registration={notifyRow} onClose={() => setNotifyRow(null)} onSent={handleNotifySent} />}
    </>
  );
}

const LISTING_INTEREST_SORT_ACCESSORS = {
  contact: (r) => r.contactValue.toLowerCase(),
  listing: (r) => r.listingDescription.toLowerCase(),
  seller: (r) => r.sellerName.toLowerCase(),
  quantity: (r) => r.quantity,
  dollarValue: (r) => r.dollarValue,
  createdAt: (r) => r.createdAt,
};

function ListingInterestsView() {
  const [interests, setInterests] = useState(null);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const { sorted, sort, handleSort } = useSortedData(interests, LISTING_INTEREST_SORT_ACCESSORS, 'createdAt');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/marketplace/listing-interests')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setInterests(data.interests);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load marketplace buyer interest.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggleCancelled(row) {
    const nextCancelled = !row.cancelled;
    if (nextCancelled && !window.confirm('Mark this inquiry as not fulfilled? It will grey out but stays on record — you can restore it later.')) {
      return;
    }
    setUpdatingId(row.id);
    const { ok, data } = await postJson('/api/admin/marketplace/listing-interests/cancel', { id: row.id, cancelled: nextCancelled });
    setUpdatingId(null);
    if (!ok) {
      window.alert(data.error || 'Could not update this inquiry.');
      return;
    }
    setInterests((prev) => prev.map((r) => (r.id === row.id ? { ...r, cancelled: nextCancelled } : r)));
  }

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Marketplace Buyer Interest ({interests ? interests.length : '…'})</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
        Buyers interested in a seller&apos;s marketplace listing. $ Value is that listing&apos;s price × the quantity requested.
      </p>
      {error && <div className="status">{error}</div>}
      {interests && interests.length === 0 && <div className="status">No marketplace inquiries yet.</div>}
      {interests && interests.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <colgroup>
              <col style={{ width: '15%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
            </colgroup>
            <thead>
              <tr>
                <SortHeader label="Buyer" field="contact" sort={sort} onSort={handleSort} />
                <SortHeader label="Listing" field="listing" sort={sort} onSort={handleSort} />
                <SortHeader label="Seller" field="seller" sort={sort} onSort={handleSort} />
                <SortHeader label="Qty" field="quantity" sort={sort} onSort={handleSort} nowrap />
                <SortHeader label="$ Value" field="dollarValue" sort={sort} onSort={handleSort} nowrap />
                <SortHeader label="Inquired" field="createdAt" sort={sort} onSort={handleSort} nowrap />
                <th className="admin-nowrap">Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={r.cancelled ? { opacity: 0.45 } : undefined}>
                  <td>{r.contactValue}</td>
                  <td>{r.listingDescription}</td>
                  <td>{r.sellerName}</td>
                  <td className="admin-nowrap">{r.quantity}</td>
                  <td className="admin-nowrap">{formatDollar(r.dollarValue)}</td>
                  <td className="admin-nowrap">{formatTimestamp(r.createdAt)}</td>
                  <td className="admin-nowrap">
                    <span className={`admin-badge ${r.cancelled ? 'admin-badge-no' : 'admin-badge-yes'}`}>
                      {r.cancelled ? 'Not fulfilled' : 'Active'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="admin-remove-btn"
                      disabled={updatingId === r.id}
                      onClick={() => handleToggleCancelled(r)}
                    >
                      {updatingId === r.id ? 'Saving…' : r.cancelled ? 'Restore' : 'Not Fulfilled'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const DISCOUNT_SIGNUP_SORT_ACCESSORS = {
  email: (r) => r.email.toLowerCase(),
  createdAt: (r) => r.createdAt,
};

function discountSignupDotColor(row) {
  if (row.welcomeEmailStatus === 'bounced') return '#d9a400'; // yellow
  if (row.welcomeEmailStatus === 'sent') return '#1a7f37'; // green
  return 'var(--red)'; // not sent yet, or the send failed
}

function discountSignupDotTitle(row) {
  if (row.welcomeEmailStatus === 'bounced') return 'Bounced';
  if (row.welcomeEmailStatus === 'sent') return `Sent ${formatTimestamp(row.welcomeEmailSentAt)}`;
  return 'Not sent — auto-send may still be in flight, or it failed';
}

function DiscountSignupsView() {
  const [signups, setSignups] = useState(null);
  const [error, setError] = useState('');
  const { sorted, sort, handleSort } = useSortedData(signups, DISCOUNT_SIGNUP_SORT_ACCESSORS, 'createdAt');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/marketplace/discount-signups')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSignups(data.signups);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load discount signups.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Discount Signups ({signups ? signups.length : '…'})</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
        Emails collected from the homepage &quot;free seller fees for a limited time&quot; banner. Each one gets an automatic welcome
        email. Green = sent, yellow = bounced, red = not sent yet or failed.
      </p>
      {error && <div className="status">{error}</div>}
      {signups && signups.length === 0 && <div className="status">No signups yet.</div>}
      {signups && signups.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <colgroup>
              <col style={{ width: '55%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '10%' }} />
            </colgroup>
            <thead>
              <tr>
                <SortHeader label="Email" field="email" sort={sort} onSort={handleSort} />
                <SortHeader label="Signed Up" field="createdAt" sort={sort} onSort={handleSort} nowrap />
                <th className="admin-nowrap" style={{ textAlign: 'right' }}>Welcome Email</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id}>
                  <td className="admin-nowrap-ellipsis" title={r.email}>{r.email}</td>
                  <td className="admin-nowrap">{formatTimestamp(r.createdAt)}</td>
                  <td className="admin-nowrap" style={{ textAlign: 'right' }}>
                    <span
                      className="admin-status-dot"
                      title={discountSignupDotTitle(r)}
                      style={{ background: discountSignupDotColor(r) }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// Per-address outcome vocabulary, kept in one place so the summary line and
// the detail list can't describe the same result differently.
const SUBSCRIBER_ADD_LABELS = {
  added: { label: 'Added', color: '#1a7f37' },
  already: { label: 'Already on the list', color: 'var(--muted)' },
  duplicate: { label: 'Listed twice in your paste', color: 'var(--muted)' },
  unsubscribed: { label: 'Unsubscribed — not added', color: '#d9a400' },
  test: { label: 'Looks like a test address — not added', color: '#d9a400' },
  invalid: { label: 'Not a valid address', color: 'var(--red)' },
};

function formatWeekOf(iso) {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
  });
}

// The accuracy gate. Release dates come from third-party trackers that lag
// the manufacturer, so the send stays locked until someone has read this
// list against the manufacturer's own calendar and confirmed it. Confirming
// fingerprints the data — edit a date afterwards and it re-locks.
// Paste what a publisher's calendar shows and it's compared against our
// data. Reports only — nothing here edits data/releases.json.
function ReleaseCheckPanel() {
  const [text, setText] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);

  async function handleRun(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setReport(null);
    const { ok, data } = await postJson('/api/admin/marketplace/release-check', { text, manufacturer: manufacturer || undefined });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Could not run the check.');
      return;
    }
    setReport(data);
  }

  return (
    <div className="admin-table-wrap" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>Release check</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
        Open a publisher&apos;s release calendar in your browser, select the list, and paste it here. It compares what
        they list against our calendar and reports what differs — it never edits the data. Women&apos;s releases and
        Dutch auctions are dropped before comparing, so they won&apos;t show up as missing.
      </p>

      <form onSubmit={handleRun}>
        <textarea
          className="contact-input"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Paste the release list here…'}
          style={{ width: '100%', fontFamily: 'inherit', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.6rem 0' }}>
          <label htmlFor="rc-brand" style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Brand</label>
          <select id="rc-brand" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)}>
            <option value="">Work it out per product</option>
            <option value="Topps">All Topps</option>
            <option value="Panini">All Panini</option>
          </select>
          <button type="submit" className="notify-btn" disabled={busy || !text.trim()}>
            {busy ? 'Comparing…' : 'Compare with our calendar'}
          </button>
        </div>
      </form>

      {error && <div className="status">{error}</div>}

      {report && (
        <div style={{ fontSize: '0.85rem' }}>
          <p style={{ fontWeight: 600, margin: '0 0 0.5rem' }}>
            Read {report.found} products · {report.confirmed.length} already match · {report.skipped.length} excluded by
            policy
          </p>

          <ReleaseCheckList
            title="Not on our calendar"
            colour="var(--red)"
            items={report.missing}
            render={(m) => `${m.title}${m.releaseDate ? ` — ${m.releaseDate}` : ' — no date given'}`}
          />
          <ReleaseCheckList
            title="Date differs"
            colour="#d9a400"
            items={report.dateMismatch}
            render={(m) => `${m.title}: ours ${m.ourDate || 'TBA'} → they say ${m.sourceDate}`}
          />
          <ReleaseCheckList
            title="Couldn't tell which of ours this is"
            colour="var(--muted)"
            items={report.ambiguous}
            render={(m) => `"${m.sourceTitle}" could be: ${m.couldBe.join(' / ')}`}
          />

          {report.missing.length + report.dateMismatch.length + report.ambiguous.length === 0 && (
            <p style={{ color: '#1a7f37', fontWeight: 600 }}>Nothing to action — our calendar agrees with that list.</p>
          )}

          <p style={{ color: 'var(--muted)', marginTop: '0.75rem' }}>
            Nothing was changed. Edit <code>data/releases.json</code> for anything above, then re-confirm the week&apos;s
            dates so the newsletter unlocks again.
          </p>
        </div>
      )}
    </div>
  );
}

function ReleaseCheckList({ title, colour, items, render }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ margin: '0 0 0.75rem' }}>
      <p style={{ fontWeight: 600, color: colour, margin: '0 0 0.25rem' }}>
        {title} ({items.length})
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ padding: '0.15rem 0' }}>
            • {render(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekDateCheck({ onChange }) {
  const [week, setWeek] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/admin/marketplace/newsletter-week');
      if (!res.ok) throw new Error('Request failed');
      setWeek(await res.json());
    } catch {
      setError('Could not load this week\'s releases.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Every action returns the whole refreshed week, so the panel can't drift
  // out of step with what the send would actually do.
  async function act(payload, busyKey) {
    setBusy(busyKey);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/newsletter-week', { weekOf: week.weekOf, ...payload });
    setBusy('');
    if (!ok) {
      setError(data.error || 'That did not work.');
      await load();
      if (onChange) onChange();
      return;
    }
    setWeek(data);
    // Confirming or skipping changes whether the send is allowed at all, so
    // the panel below has to re-read rather than sit on a stale answer.
    if (onChange) onChange();
  }

  if (error && !week) return <div className="status">{error}</div>;
  if (!week) return <p style={{ color: 'var(--muted)' }}>Loading this week's releases…</p>;

  const { status } = week;

  return (
    <div className="admin-table-wrap" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>Release dates for the week of {formatWeekOf(week.weekOf)}</h3>
      <p style={{ fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
        {status.skipped ? (
          <span style={{ color: '#b3261e', fontWeight: 600 }}>
            Skipped {formatTimestamp(status.skippedAt)} — no email goes out this week. The week's blog post still
            publishes as usual.
          </span>
        ) : status.confirmed ? (
          <span style={{ color: '#1a7f37', fontWeight: 600 }}>
            Confirmed {formatTimestamp(status.confirmedAt)} — good to go. {week.includedCount}{' '}
            {week.includedCount === 1 ? 'release' : 'releases'} will be in the email
            {week.excludedCount > 0 ? `, ${week.excludedCount} struck out` : ''}.
          </span>
        ) : (
          <span style={{ color: '#d9a400', fontWeight: 600 }}>
            {status.staleSinceConfirmed
              ? 'Something changed since you confirmed. Check the list again — the send is locked until you do.'
              : 'Not confirmed yet — the weekly send is locked until these dates are checked.'}
          </span>
        )}
      </p>

      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
        These are the exact claims the email makes. Check them against{' '}
        <a href="https://www.topps.com/release-calendar" target="_blank" rel="noopener noreferrer">
          the Topps release calendar
        </a>{' '}
        and press <strong>×</strong> on anything wrong to keep it out of this week's email — no code change or redeploy
        needed. It stays on the site; the email just won't mention it.
      </p>

      {week.releases.length === 0 ? (
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>No releases dated this week.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
          {week.releases.map((r) => (
            <li
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.6rem',
                padding: '0.5rem 0',
                borderTop: '1px solid var(--border)',
                opacity: r.excluded ? 0.55 : 1,
              }}
            >
              <button
                type="button"
                className="stock-toggle-btn"
                aria-label={r.excluded ? `Put ${r.title} back in the email` : `Strike ${r.title} out of the email`}
                title={r.excluded ? 'Put this back in the email' : 'Strike this out of the email'}
                disabled={busy === r.id}
                onClick={() => act({ action: r.excluded ? 'include' : 'exclude', releaseId: r.id }, r.id)}
                style={{ flex: '0 0 auto', padding: '0.15rem 0.5rem', lineHeight: 1.4 }}
              >
                {r.excluded ? '↩' : '×'}
              </button>
              <div style={{ textDecoration: r.excluded ? 'line-through' : 'none' }}>
                <strong>{r.releaseDate}</strong> — {r.title}
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {r.sport} · {r.format}
                  {r.eql ? ' · EQL raffle entry' : ' · standard checkout'}
                  {r.isPreorderOpenDate ? ' · preorder-open date, not the ship date' : ' · street date'}
                </div>
                {r.description && <div style={{ fontSize: '0.8rem' }}>{r.description}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {week.includedCount === 0 && week.releases.length > 0 && (
        <p style={{ fontSize: '0.8rem', color: '#d9a400', margin: '0 0 0.75rem' }}>
          Everything is struck out — the email will go without a release list this week.
        </p>
      )}

      {error && <div className="status">{error}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        <button
          type="button"
          className="notify-btn"
          onClick={() => act({ action: 'confirm' }, 'confirm')}
          disabled={busy === 'confirm' || status.skipped}
          title={status.skipped ? 'Un-skip this week first' : undefined}
        >
          {busy === 'confirm'
            ? 'Confirming…'
            : status.confirmed
              ? 'Re-confirm'
              : "I checked these — unlock this week's send"}
        </button>

        <button
          type="button"
          className="stock-toggle-btn"
          onClick={() => act({ action: status.skipped ? 'unskip' : 'skip' }, 'skip')}
          disabled={busy === 'skip'}
        >
          {busy === 'skip' ? 'Saving…' : status.skipped ? 'Un-skip this week' : 'Skip this week'}
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.6rem 0 0' }}>
        {status.skipped
          ? 'Un-skipping puts the week back where it was — you still have to confirm the dates before anything sends.'
          : 'Skipping calls off this week\u2019s email entirely — for a quiet release week or a holiday. Nothing sends until you un-skip.'}
      </p>
    </div>
  );
}

const VARIANT_LABELS = { sunday: 'Sunday cohort', monday: 'Monday cohort' };

// Mails the week's issue on demand, behind the same gate the schedule
// obeys. Worth having even once the schedule is armed: it's the only way to
// send while NEWSLETTER_ENABLED is off, to catch up a cohort whose run was
// cut short, and to retry addresses whose last attempt failed.
function SendNowPanel({ refreshKey }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // The variant waiting on a second click. Mailing a few hundred people is
  // not undoable, so the button asks once with the count in it.
  const [confirming, setConfirming] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/admin/marketplace/newsletter-send');
      if (!res.ok) throw new Error('Request failed');
      setState(await res.json());
    } catch {
      setError('Could not load the send status.');
    }
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  // A send runs in the background — the request that starts it returns
  // straight away — so progress arrives by polling rather than in a
  // response body.
  const running = Boolean(state && state.running);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [running]);

  async function send(variant) {
    setBusy(variant);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/newsletter-send', {
      weekOf: state.weekOf,
      variant,
    });
    setBusy('');
    setConfirming('');
    if (!ok) {
      setError(data.error || 'That did not work.');
      await load();
      return;
    }
    setState(data);
  }

  if (!state) return null;

  return (
    <div className="admin-table-wrap" style={{ padding: '1rem', marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 0.25rem' }}>Send this week's issue</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
        {state.subject}
      </p>

      {state.blocker ? (
        <p style={{ fontSize: '0.85rem', color: '#d9a400', fontWeight: 600, margin: '0 0 0.75rem' }}>
          {state.blocker}
        </p>
      ) : (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 0.75rem' }}>
          The list is split in half for the A/B test, so each cohort is its own send — mail both to reach everyone.
          Sending twice is safe: anyone who already got this issue is skipped.
          {state.scheduleArmed ? '' : ' The weekly schedule is off, so nothing goes out unless you send it here.'}
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {state.cohorts.map((cohort) => {
          const done = cohort.remaining === 0;
          return (
            <li
              key={cohort.variant}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.6rem',
                padding: '0.6rem 0',
                borderTop: '1px solid var(--border)',
              }}
            >
              <div>
                <strong>{VARIANT_LABELS[cohort.variant] || cohort.variant}</strong>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {cohort.eligible} on the list · {cohort.sent} sent
                  {cohort.failed > 0 ? ` · ${cohort.failed} failed` : ''}
                  {done ? '' : ` · ${cohort.remaining} to send`}
                </div>
              </div>

              {done ? (
                <span style={{ fontSize: '0.85rem', color: cohort.eligible === 0 ? 'var(--muted)' : '#1a7f37' }}>
                  {cohort.eligible === 0 ? 'Nobody in this cohort yet' : 'Everyone has this issue'}
                </span>
              ) : confirming === cohort.variant ? (
                <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="notify-btn"
                    disabled={busy === cohort.variant}
                    onClick={() => send(cohort.variant)}
                  >
                    {busy === cohort.variant ? 'Starting…' : `Yes — mail ${cohort.remaining}`}
                  </button>
                  <button type="button" className="stock-toggle-btn" onClick={() => setConfirming('')}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="notify-btn"
                  disabled={Boolean(state.blocker) || running}
                  title={state.blocker || (running ? 'A send is already running' : undefined)}
                  onClick={() => setConfirming(cohort.variant)}
                >
                  Send now
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {running && (
        <p style={{ fontSize: '0.85rem', margin: '0.75rem 0 0' }}>
          Sending… this page updates every few seconds. You can leave it — the send finishes on its own and posts to
          Discord when it's done.
        </p>
      )}

      {error && <div className="status">{error}</div>}
    </div>
  );
}

function NewsletterView() {
  const [summary, setSummary] = useState(null);
  const [emails, setEmails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  // Bumped whenever the date check changes, to re-read the send gate.
  const [weekChanges, setWeekChanges] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/marketplace/newsletter-subscribers')
      .then((res) => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the newsletter list.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    const { ok, data } = await postJson('/api/admin/marketplace/newsletter-subscribers', { emails });
    setBusy(false);
    if (!ok) {
      setError(data.error || 'Could not add those addresses.');
      return;
    }
    setResult(data);
    setSummary(data);
    // Only clear the box on a clean run — if anything was rejected, the
    // owner needs the original paste to see what to fix.
    if ((data.counts.invalid || 0) + (data.counts.unsubscribed || 0) === 0) setEmails('');
  }

  const notable = result ? result.results.filter((r) => r.status !== 'added') : [];

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Newsletter</h2>

      <WeekDateCheck onChange={() => setWeekChanges((n) => n + 1)} />

      <SendNowPanel refreshKey={weekChanges} />

      <ReleaseCheckPanel />

      <h3 style={{ margin: '0 0 0.5rem' }}>Subscriber list</h3>

      {summary && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
          <strong style={{ color: 'var(--text)' }}>{summary.receivingNext}</strong> will get the next issue (week of{' '}
          {formatWeekOf(summary.nextIssueWeek)}) ·{' '}
          <strong style={{ color: 'var(--text)' }}>{summary.totalOnList - summary.receivingNext}</strong> waiting for a
          later one · <strong style={{ color: 'var(--text)' }}>{summary.unsubscribed}</strong> unsubscribed
          {summary.audience === 'all'
            ? ' · includes everyone who registered interest by email'
            : ' · signup forms only (NEWSLETTER_AUDIENCE=signups)'}
        </p>
      )}

      <form onSubmit={handleAdd} style={{ margin: '1.25rem 0' }}>
        <label className="form-label" htmlFor="newsletter-emails">
          Add addresses — one per line, or separated by commas
        </label>
        <textarea
          id="newsletter-emails"
          className="contact-input"
          rows={6}
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={'someone@example.com\nanother@example.com'}
          style={{ width: '100%', marginTop: '0.4rem', fontFamily: 'inherit', resize: 'vertical' }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '0.4rem 0 0.75rem' }}>
          No email is sent when you add someone. They start with the issue for the week of{' '}
          <strong>{summary ? formatWeekOf(summary.firstIssueWeek) : '…'}</strong> and can unsubscribe from any issue.
          Only add people who gave you their address.
        </p>
        <button type="submit" className="notify-btn" disabled={busy || !emails.trim()}>
          {busy ? 'Adding…' : 'Add to list'}
        </button>
      </form>

      {error && <div className="status">{error}</div>}

      {result && (
        <div className="admin-table-wrap" style={{ padding: '0.9rem 1rem' }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {result.counts.added || 0} added
            {result.counts.already ? `, ${result.counts.already} already on the list` : ''}
            {result.counts.unsubscribed ? `, ${result.counts.unsubscribed} skipped (unsubscribed)` : ''}
            {result.counts.invalid ? `, ${result.counts.invalid} invalid` : ''}
            {result.counts.test ? `, ${result.counts.test} skipped (test address)` : ''}
            {result.counts.duplicate ? `, ${result.counts.duplicate} duplicate` : ''}
          </p>

          {notable.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
              {notable.map((row) => (
                <li key={row.email} style={{ fontSize: '0.85rem', padding: '0.15rem 0' }}>
                  <span className="admin-nowrap-ellipsis" title={row.email}>{row.email}</span>{' '}
                  <span style={{ color: (SUBSCRIBER_ADD_LABELS[row.status] || {}).color || 'var(--muted)' }}>
                    — {(SUBSCRIBER_ADD_LABELS[row.status] || {}).label || row.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result.counts.unsubscribed > 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.75rem 0 0' }}>
              Unsubscribed addresses are never re-added here — someone who opted out stays opted out unless they ask you
              to put them back.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// Special preorder requests — someone asking for a product that isn't on
// the calendar. They come through Discord as they land; this is the record
// that outlives the channel, and where each one gets marked off.
function PreorderRequestsView() {
  const [requests, setRequests] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [showHandled, setShowHandled] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/marketplace/preorder-requests');
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setRequests(data.requests);
    } catch {
      setError('Could not load preorder requests.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(row, payload, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(row.id);
    setError('');
    const { ok, data } = await postJson('/api/admin/marketplace/preorder-requests', { id: row.id, ...payload });
    setBusyId(null);
    if (!ok) {
      setError(data.error || 'That did not work.');
      return;
    }
    setRequests(data.requests);
  }

  if (error && !requests) return <div className="status">{error}</div>;
  if (!requests) return <p style={{ color: 'var(--muted)' }}>Loading requests…</p>;

  const open = requests.filter((r) => !r.handled);
  const handled = requests.filter((r) => r.handled);
  const shown = showHandled ? requests : open;

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 0.5rem' }}>Preorder Requests</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1rem' }}>
        Submitted from{' '}
        <a href="/request-preorder.html" target="_blank" rel="noopener noreferrer">
          the Request a Preorder page
        </a>{' '}
        — products people want that aren't on the calendar.{' '}
        <strong style={{ color: 'var(--text)' }}>{open.length}</strong> open ·{' '}
        <strong style={{ color: 'var(--text)' }}>{handled.length}</strong> handled.
      </p>

      {handled.length > 0 && (
        <button
          type="button"
          className="stock-toggle-btn"
          style={{ marginBottom: '1rem' }}
          onClick={() => setShowHandled((v) => !v)}
        >
          {showHandled ? 'Hide handled' : `Show handled (${handled.length})`}
        </button>
      )}

      {error && <div className="status">{error}</div>}

      {shown.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>
          {requests.length === 0 ? 'No requests yet.' : 'Nothing open — everything has been handled.'}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {shown.map((row) => (
            <li
              key={row.id}
              className="admin-table-wrap"
              style={{ padding: '0.9rem 1rem', marginBottom: '0.75rem', opacity: row.handled ? 0.6 : 1 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ minWidth: '260px', flex: 1 }}>
                  <strong style={{ textDecoration: row.handled ? 'line-through' : 'none' }}>{row.product}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.2rem' }}>
                    Qty {row.quantity}
                    {/* The customer's own claim about the release date — labelled as
                        theirs, since nothing here verifies it. */}
                    {row.releaseDate ? ` · out ${row.releaseDate} (per customer)` : ''} ·{' '}
                    {row.contactType === 'email' ? 'Email' : 'Phone'}:{' '}
                    <a href={`${row.contactType === 'email' ? 'mailto:' : 'tel:'}${row.contactValue}`}>
                      {row.contactValue}
                    </a>{' '}
                    · {formatTimestamp(row.createdAt)}
                    {row.handled ? ` · handled ${formatTimestamp(row.handledAt)}` : ''}
                  </div>
                  {row.notes && (
                    // Plain text, rendered as text: this is whatever a
                    // stranger typed into a public form.
                    <p style={{ fontSize: '0.85rem', margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{row.notes}</p>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <button
                    type="button"
                    className="stock-toggle-btn"
                    disabled={busyId === row.id}
                    onClick={() => act(row, { action: 'handled', handled: !row.handled })}
                  >
                    {row.handled ? 'Reopen' : 'Mark handled'}
                  </button>
                  <button
                    type="button"
                    className="stock-toggle-btn"
                    disabled={busyId === row.id}
                    onClick={() =>
                      act(
                        row,
                        { action: 'delete' },
                        `Permanently delete this request (${row.contactValue} — ${row.product})? This is for test records only and can't be undone.`
                      )
                    }
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Success Stories page uploads. Photos land on the mounted data disk rather
// than in public/, so they survive a redeploy — and so an order confirmation
// can go up from a phone the moment it arrives, without a commit.
function SuccessStoriesView() {
  const [photos, setPhotos] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rejected, setRejected] = useState([]);
  const inputRef = useRef(null);

  async function load() {
    try {
      const res = await fetch('/api/admin/marketplace/success-photos');
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setPhotos(data.photos);
    } catch {
      setError('Could not load the success photos.');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setBusy(true);
    setError('');
    setRejected([]);

    const body = new FormData();
    files.forEach((file) => body.append('photos', file));

    try {
      // Not postJson: this is multipart, and setting Content-Type by hand
      // would strip the boundary the browser generates.
      const res = await fetch('/api/admin/marketplace/success-photos', { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data.error || 'Those files could not be uploaded.');
      else {
        setPhotos(data.photos);
        setRejected(data.rejected || []);
      }
    } catch {
      setError('Those files could not be uploaded.');
    }

    setBusy(false);
    // Clear the input so picking the same file again still fires a change.
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleDelete(photo) {
    if (!window.confirm('Remove this photo from the Success Stories page?')) return;
    setError('');
    const res = await fetch(`/api/admin/marketplace/success-photos?filename=${encodeURIComponent(photo.filename)}`, {
      method: 'DELETE',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'That photo could not be removed.');
      return;
    }
    setPhotos(data.photos);
  }

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 0.5rem' }}>Success Stories</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 1rem' }}>
        Order confirmation screenshots for{' '}
        <a href="/success.html" target="_blank" rel="noopener noreferrer">
          the Success Stories page
        </a>
        . Newest first — an upload goes live immediately, no deploy needed. PNG, JPEG, GIF or WebP, up to 8MB each.
      </p>

      <label className="notify-btn" style={{ display: 'inline-block', cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Uploading…' : 'Upload screenshots'}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          disabled={busy}
          onChange={handleUpload}
          style={{ display: 'none' }}
        />
      </label>

      {error && <div className="status">{error}</div>}

      {rejected.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          {rejected.map((row) => (
            <li key={row.name} style={{ fontSize: '0.85rem', color: '#b3261e' }}>
              {row.name} — {row.error}
            </li>
          ))}
        </ul>
      )}

      {photos === null ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : photos.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>Nothing posted yet.</p>
      ) : (
        <>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '1rem 0 0.5rem' }}>
            {photos.length} on the page · {photos.filter((p) => p.uploaded).length} uploaded here
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {photos.map((photo) => (
              <div key={photo.url} className="admin-table-wrap" style={{ padding: '0.5rem' }}>
                <img
                  src={photo.url}
                  alt=""
                  loading="lazy"
                  style={{ width: '100%', height: '130px', objectFit: 'contain', background: '#fff' }}
                />
                {photo.uploaded ? (
                  <button
                    type="button"
                    className="stock-toggle-btn"
                    style={{ width: '100%', marginTop: '0.4rem' }}
                    onClick={() => handleDelete(photo)}
                  >
                    Remove
                  </button>
                ) : (
                  <p style={{ fontSize: '0.7rem', color: 'var(--muted)', margin: '0.4rem 0 0', textAlign: 'center' }}>
                    In the repo — delete it there
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

const TABS = [
  { id: 'sellers', label: 'Sellers' },
  { id: 'preorders', label: 'Preorder Registrations' },
  { id: 'preorderRequests', label: 'Preorder Requests' },
  { id: 'listingInterests', label: 'Marketplace Buyer Interest' },
  { id: 'discountSignups', label: 'Discount Signups' },
  { id: 'newsletter', label: 'Newsletter List' },
  { id: 'success', label: 'Success Stories' },
];

function Dashboard({ onLoggedOut }) {
  const [tab, setTab] = useState('sellers');

  async function handleLogout() {
    await postJson('/api/admin/marketplace/totp/logout', {});
    onLoggedOut();
  }

  return (
    <>
      <div className="admin-toolbar">
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`stock-toggle-btn${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="notify-btn" onClick={handleLogout}>Log out</button>
      </div>

      {tab === 'sellers' && <SellersView />}
      {tab === 'preorders' && <PreorderRegistrationsView />}
      {tab === 'preorderRequests' && <PreorderRequestsView />}
      {tab === 'listingInterests' && <ListingInterestsView />}
      {tab === 'discountSignups' && <DiscountSignupsView />}
      {tab === 'newsletter' && <NewsletterView />}
      {tab === 'success' && <SuccessStoriesView />}
    </>
  );
}

export default function MarketplaceAdminClient() {
  const [phase, setPhase] = useState('loading'); // 'loading' | 'setup' | 'login' | 'dashboard'

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/marketplace/totp/status')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.enrolled) setPhase('setup');
        else if (!data.authenticated) setPhase('login');
        else setPhase('dashboard');
      })
      .catch(() => {
        if (!cancelled) setPhase('login');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Marketplace Admin</h1>
          <p className="tagline">Seller keys, preorder registrations, and marketplace buyer interest.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        {phase === 'loading' && <div className="status">Loading…</div>}
        {phase === 'setup' && <SetupPanel onEnrolled={() => setPhase('login')} />}
        {phase === 'login' && <LoginPanel onLoggedIn={() => setPhase('dashboard')} onResetRequested={() => setPhase('setup')} />}
        {phase === 'dashboard' && <Dashboard onLoggedOut={() => setPhase('login')} />}
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
