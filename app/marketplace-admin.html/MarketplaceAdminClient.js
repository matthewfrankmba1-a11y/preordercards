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

const SORT_ACCESSORS = {
  email: (s) => (s.email || '').toLowerCase(),
  completedSales: (s) => s.completedSales,
  pendingSales: (s) => s.pendingSales,
  loginCount: (s) => s.loginCount,
};

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  return (
    <th>
      <button type="button" className="sort-btn" onClick={() => onSort(field)}>
        {label}
        {active && <span>{sort.dir === 'asc' ? '↑' : '↓'}</span>}
      </button>
    </th>
  );
}

function Dashboard({ onLoggedOut }) {
  const [sellers, setSellers] = useState(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState({ field: 'email', dir: 'asc' });
  const [removingKey, setRemovingKey] = useState(null);

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

  const sorted = useMemo(() => {
    if (!sellers) return [];
    const accessor = SORT_ACCESSORS[sort.field];
    const copy = [...sellers];
    copy.sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [sellers, sort]);

  function handleSort(field) {
    setSort((prev) => (prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' }));
  }

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

  async function handleLogout() {
    await postJson('/api/admin/marketplace/totp/logout', {});
    onLoggedOut();
  }

  return (
    <>
      <div className="admin-toolbar">
        <h2>Sellers ({sellers ? sellers.length : '…'})</h2>
        <button type="button" className="notify-btn" onClick={handleLogout}>Log out</button>
      </div>

      {error && <div className="status">{error}</div>}
      {sellers && sellers.length === 0 && <div className="status">No sellers have signed up yet.</div>}

      {sellers && sellers.length > 0 && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <SortHeader label="Email" field="email" sort={sort} onSort={handleSort} />
                <SortHeader label="Completed Sales" field="completedSales" sort={sort} onSort={handleSort} />
                <SortHeader label="Pending Sales" field="pendingSales" sort={sort} onSort={handleSort} />
                <th>Selling Key</th>
                <th>Logged In</th>
                <SortHeader label="Login Count" field="loginCount" sort={sort} onSort={handleSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.inviteKey}>
                  <td>{s.email || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                  <td>{s.completedSales}</td>
                  <td>{s.pendingSales}</td>
                  <td className="admin-key-code">{s.inviteKey}</td>
                  <td>
                    <span className={`admin-badge ${s.loggedIn ? 'admin-badge-yes' : 'admin-badge-no'}`}>
                      {s.loggedIn ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td>{s.loginCount}</td>
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
          <p className="tagline">Seller keys, sales, and login activity.</p>
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
