(function () {
  const STORAGE_KEY = 'discountBannerState'; // 'dismissed' | 'signed-up'
  const banner = document.getElementById('discount-banner');
  if (!banner) return;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dismissed' || stored === 'signed-up') {
    banner.hidden = true;
    return;
  }

  const form = document.getElementById('discount-banner-form');
  const emailInput = document.getElementById('discount-banner-email');
  const message = document.getElementById('discount-banner-message');
  const dismissBtn = document.getElementById('discount-banner-dismiss');

  dismissBtn.addEventListener('click', () => {
    localStorage.setItem(STORAGE_KEY, 'dismissed');
    banner.hidden = true;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      const res = await fetch('/api/discount-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.textContent = data.error || 'Something went wrong. Please try again.';
        message.hidden = false;
        submitBtn.disabled = false;
        return;
      }
      form.hidden = true;
      message.textContent = data.alreadySignedUp
        ? "You're already signed up!"
        : "You're in! Look out for your 5% discount on your first order.";
      message.hidden = false;
      localStorage.setItem(STORAGE_KEY, 'signed-up');
    } catch (err) {
      message.textContent = 'Network error. Please try again.';
      message.hidden = false;
      submitBtn.disabled = false;
    }
  });
})();
