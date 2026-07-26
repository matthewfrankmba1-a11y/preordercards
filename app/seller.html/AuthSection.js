'use client';

import { useState } from 'react';

export default function AuthSection({ onAuthed }) {
  const [tab, setTab] = useState('login');
  const [subview, setSubview] = useState(null); // null | 'forgot' | 'recover'

  const [loginKey, setLoginKey] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMessage, setLoginMessage] = useState({ text: '', kind: '' });

  const [signupKey, setSignupKey] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupMessage, setSignupMessage] = useState({ text: '', kind: '' });

  const [forgotKey, setForgotKey] = useState('');
  const [forgotMessage, setForgotMessage] = useState({ text: '', kind: '' });

  const [recoverName, setRecoverName] = useState('');
  const [recoverPhone, setRecoverPhone] = useState('');
  const [recoverMessage, setRecoverMessage] = useState({ text: '', kind: '' });

  function selectTab(newTab) {
    setTab(newTab);
    setSubview(null);
  }

  async function handleLogin(e) {
    e.preventDefault();
    setLoginMessage({ text: 'Logging in...', kind: '' });
    try {
      const res = await fetch('/api/seller/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: loginKey.trim(), password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginMessage({ text: data.error || 'Login failed.', kind: 'error' });
        return;
      }
      setLoginMessage({ text: 'Logged in!', kind: 'success' });
      onAuthed(data);
    } catch (err) {
      setLoginMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setSignupMessage({ text: 'Creating account...', kind: '' });
    try {
      const res = await fetch('/api/seller/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: signupKey.trim(),
          password: signupPassword,
          email: signupEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSignupMessage({ text: data.error || 'Signup failed.', kind: 'error' });
        return;
      }
      setSignupMessage({ text: 'Account created!', kind: 'success' });
      onAuthed(data);
    } catch (err) {
      setSignupMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    setForgotMessage({ text: 'Sending...', kind: '' });
    try {
      const res = await fetch('/api/seller/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: forgotKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotMessage({ text: data.error || 'Could not send reset link.', kind: 'error' });
        return;
      }
      setForgotMessage({ text: data.message || 'Reset link sent!', kind: 'success' });
    } catch (err) {
      setForgotMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  async function handleRecoverAccount(e) {
    e.preventDefault();
    setRecoverMessage({ text: 'Looking up your account...', kind: '' });
    try {
      const res = await fetch('/api/seller/recover-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: recoverName.trim(), phone: recoverPhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecoverMessage({ text: data.error || 'Could not recover your account.', kind: 'error' });
        return;
      }
      setRecoverMessage({ text: data.message || 'Recovery email sent!', kind: 'success' });
    } catch (err) {
      setRecoverMessage({ text: 'Network error. Please try again.', kind: 'error' });
    }
  }

  return (
    <section id="auth-section">
      <div className="seller-auth-tabs">
        <button type="button" className={`seller-tab-btn${tab === 'login' ? ' active' : ''}`} onClick={() => selectTab('login')}>Log In</button>
        <button type="button" className={`seller-tab-btn${tab === 'signup' ? ' active' : ''}`} onClick={() => selectTab('signup')}>Sign Up with Key</button>
      </div>

      {tab === 'login' && subview === null && (
        <form className="seller-auth-form" onSubmit={handleLogin}>
          <label className="form-field">
            <span className="form-label">Invite Key</span>
            <input type="text" placeholder="XXXX-XXXX-XXXX" autoComplete="off" required value={loginKey} onChange={(e) => setLoginKey(e.target.value)} />
          </label>
          <label className="form-field">
            <span className="form-label">Password</span>
            <input type="password" autoComplete="current-password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
          </label>
          <button type="submit" className="notify-btn">Log In</button>
          <p className={`form-message${loginMessage.kind ? ' ' + loginMessage.kind : ''}`}>{loginMessage.text}</p>
          <button type="button" className="link-btn" onClick={() => setSubview('forgot')}>Forgot your password?</button>
        </form>
      )}

      {subview === 'forgot' && (
        <form className="seller-auth-form" onSubmit={handleForgotPassword}>
          <p className="card-desc">Enter your invite key and we&apos;ll email a reset link to the alert email on file for that account.</p>
          <label className="form-field">
            <span className="form-label">Invite Key</span>
            <input type="text" placeholder="XXXX-XXXX-XXXX" autoComplete="off" required value={forgotKey} onChange={(e) => setForgotKey(e.target.value)} />
          </label>
          <button type="submit" className="notify-btn">Send Reset Link</button>
          <button type="button" className="link-btn" onClick={() => setSubview('recover')}>Lost your key too?</button>
          <button type="button" className="link-btn" onClick={() => setSubview(null)}>Back to log in</button>
          <p className={`form-message${forgotMessage.kind ? ' ' + forgotMessage.kind : ''}`}>{forgotMessage.text}</p>
        </form>
      )}

      {subview === 'recover' && (
        <form className="seller-auth-form" onSubmit={handleRecoverAccount}>
          <p className="card-desc">Enter the full name and phone number from your seller profile and we&apos;ll email your invite key (plus a reset link) to the alert email on file.</p>
          <label className="form-field">
            <span className="form-label">Full Name</span>
            <input type="text" autoComplete="name" required value={recoverName} onChange={(e) => setRecoverName(e.target.value)} />
          </label>
          <label className="form-field">
            <span className="form-label">Phone Number</span>
            <input type="tel" autoComplete="tel" required value={recoverPhone} onChange={(e) => setRecoverPhone(e.target.value)} />
          </label>
          <button type="submit" className="notify-btn">Recover Account</button>
          <button type="button" className="link-btn" onClick={() => setSubview(null)}>Back to log in</button>
          <p className={`form-message${recoverMessage.kind ? ' ' + recoverMessage.kind : ''}`}>{recoverMessage.text}</p>
        </form>
      )}

      {tab === 'signup' && subview === null && (
        <form className="seller-auth-form" onSubmit={handleSignup}>
          <label className="form-field">
            <span className="form-label">Invite Key</span>
            <input type="text" placeholder="XXXX-XXXX-XXXX" autoComplete="off" required value={signupKey} onChange={(e) => setSignupKey(e.target.value)} />
          </label>
          <label className="form-field">
            <span className="form-label">Create Password</span>
            <input type="password" placeholder="At least 8 characters" autoComplete="new-password" required value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
          </label>
          <label className="form-field">
            <span className="form-label">Alert Email (optional)</span>
            <input type="email" placeholder="you@example.com" autoComplete="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
          </label>
          <p className="card-desc">Get a notification when a listing of yours gets interest — no buyer contact info is shared, that stays with us.</p>
          <button type="submit" className="notify-btn">Create Seller Account</button>
          <p className={`form-message${signupMessage.kind ? ' ' + signupMessage.kind : ''}`}>{signupMessage.text}</p>
        </form>
      )}
    </section>
  );
}
