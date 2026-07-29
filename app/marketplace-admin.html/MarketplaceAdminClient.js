'use client';

import { useEffect, useMemo, useState } from 'react';

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
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Sellers ({sellers ? sellers.length : '…'})</h2>
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
    </>
  );
}

const PREORDER_SORT_ACCESSORS = {
  contact: (r) => r.contactValue.toLowerCase(),
  release: (r) => r.releaseTitle.toLowerCase(),
  quantity: (r) => r.quantity,
  registrationCount: (r) => r.registrationCount,
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

function PreorderRegistrationsView() {
  const [registrations, setRegistrations] = useState(null);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [notifyRow, setNotifyRow] = useState(null);
  const { sorted, sort, handleSort } = useSortedData(registrations, PREORDER_SORT_ACCESSORS, 'createdAt');

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

  return (
    <>
      <h2 style={{ margin: '1.5rem 0 1rem' }}>Preorder Registrations ({registrations ? registrations.length : '…'})</h2>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '-0.5rem' }}>
        Release-calendar interest signups. &quot;Times Registered&quot; counts every registration that contact has made across all releases.
        Shade marks a registration unfulfilled (reversible); Delete permanently removes a row and should only be used for test records.
        Notify sends the buyer a secured/not-secured email. Ack Email is green once the automatic
        &quot;we got your registration&quot; email has sent, red if it hasn&apos;t (or failed), grey if there&apos;s no email on file.
      </p>
      {error && <div className="status">{error}</div>}
      {registrations && registrations.length === 0 && <div className="status">No registrations yet.</div>}
      {registrations && registrations.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <colgroup>
              <col style={{ width: '13%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '5%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '6%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '19%' }} />
            </colgroup>
            <thead>
              <tr>
                <SortHeader label="Contact" field="contact" sort={sort} onSort={handleSort} />
                <SortHeader label="Release" field="release" sort={sort} onSort={handleSort} />
                <SortHeader label="Qty" field="quantity" sort={sort} onSort={handleSort} nowrap />
                <SortHeader label="Times Reg." field="registrationCount" sort={sort} onSort={handleSort} nowrap />
                <SortHeader label="Registered" field="createdAt" sort={sort} onSort={handleSort} nowrap />
                <th className="admin-nowrap">Ack Email</th>
                <th className="admin-nowrap">Status</th>
                <th>Notify</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={r.cancelled ? { opacity: 0.45 } : undefined}>
                  <td>{r.contactValue}</td>
                  <td>{r.releaseTitle}</td>
                  <td className="admin-nowrap">{r.quantity}</td>
                  <td className="admin-nowrap">{r.registrationCount}</td>
                  <td className="admin-nowrap">{formatTimestamp(r.createdAt)}</td>
                  <td className="admin-nowrap">
                    <span
                      className="admin-status-dot"
                      title={
                        r.contactType !== 'email'
                          ? 'No email on file'
                          : r.emailSentAt
                          ? `Sent ${formatTimestamp(r.emailSentAt)}`
                          : 'Not sent — auto-send may still be in flight, or it failed'
                      }
                      style={{
                        background: r.contactType !== 'email' ? 'var(--muted)' : r.emailSentAt ? '#1a7f37' : 'var(--red)',
                      }}
                    />
                  </td>
                  <td className="admin-nowrap">
                    <span className={`admin-badge ${r.cancelled ? 'admin-badge-no' : 'admin-badge-yes'}`}>
                      {r.cancelled ? 'Unfulfilled' : 'Active'}
                    </span>
                  </td>
                  <td>
                    {r.contactType !== 'email' ? (
                      <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>No email</span>
                    ) : (
                      <div className="admin-actions-cell">
                        {r.outcome && (
                          <span className={`admin-badge ${r.outcome === 'secured' ? 'admin-badge-yes' : 'admin-badge-no'}`}>
                            {r.outcome === 'secured' ? 'Secured' : 'Not Secured'}
                          </span>
                        )}
                        <button type="button" className="admin-remove-btn" onClick={() => setNotifyRow(r)}>
                          {r.outcome ? 'Re-notify' : 'Notify'}
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="admin-actions-cell">
                      <button
                        type="button"
                        className="admin-remove-btn"
                        disabled={updatingId === r.id}
                        onClick={() => handleToggleCancelled(r)}
                      >
                        {updatingId === r.id ? 'Saving…' : r.cancelled ? 'Restore' : 'Shade'}
                      </button>
                      <button
                        type="button"
                        className="admin-remove-btn"
                        disabled={updatingId === r.id}
                        onClick={() => handleDelete(r)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

const TABS = [
  { id: 'sellers', label: 'Sellers' },
  { id: 'preorders', label: 'Preorder Registrations' },
  { id: 'listingInterests', label: 'Marketplace Buyer Interest' },
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
      {tab === 'listingInterests' && <ListingInterestsView />}
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
