const form = document.getElementById('reset-password-form');
const message = document.getElementById('reset-message');

const token = new URLSearchParams(window.location.search).get('token');
if (!token) {
  message.textContent = 'This reset link is missing its token. Request a new one from the seller dashboard.';
  message.className = 'form-message error';
  form.querySelector('button').disabled = true;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-password').value;

  if (newPassword !== confirmPassword) {
    message.textContent = 'Passwords do not match.';
    message.className = 'form-message error';
    return;
  }

  message.textContent = 'Resetting...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      message.textContent = data.error || 'Could not reset password.';
      message.className = 'form-message error';
      return;
    }
    message.textContent = 'Password reset! You can now log in with your new password.';
    message.className = 'form-message success';
    form.reset();
    form.querySelector('button').disabled = true;
  } catch (err) {
    message.textContent = 'Network error. Please try again.';
    message.className = 'form-message error';
  }
});
