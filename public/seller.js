const FEE_RATE = 0.025;
const SHIPPING_FEE_BASE = 6;
const SHIPPING_FEE_PER_ADDITIONAL_BOX = 1;
function shippingFee(quantity) {
  return SHIPPING_FEE_BASE + (quantity - 1) * SHIPPING_FEE_PER_ADDITIONAL_BOX;
}

const statusEl = document.getElementById('status');
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const sellerNameEl = document.getElementById('seller-name');

const listingQuantitySelect = document.getElementById('listing-quantity');
for (let i = 1; i <= 10; i++) {
  const opt = document.createElement('option');
  opt.value = String(i);
  opt.textContent = i === 1 ? '1 item' : `${i} items`;
  listingQuantitySelect.appendChild(opt);
}

const listingPriceInput = document.getElementById('listing-price');
const listingFeePreview = document.getElementById('listing-fee-preview');

function updateFeePreview() {
  const price = Number(listingPriceInput.value);
  if (!price || price <= 0) {
    listingFeePreview.textContent = '';
    return;
  }
  const net = price * (1 - FEE_RATE);
  const qty = Number(listingQuantitySelect.value) || 1;
  const shipping = shippingFee(qty);
  const totalIfAllSold = net * qty - shipping;
  listingFeePreview.textContent = `You'll receive $${net.toFixed(2)} per unit after the 2.5% fee. A shipping fee also applies once per completed sale — $${SHIPPING_FEE_BASE} for 1 box, plus $${SHIPPING_FEE_PER_ADDITIONAL_BOX} per additional box (e.g. $${shipping} if a buyer orders all ${qty}), deducted from your payout. If one buyer purchases all ${qty}, you'd receive $${net.toFixed(2)} × ${qty} − $${shipping} = $${totalIfAllSold.toFixed(2)} total.`;
}
listingPriceInput.addEventListener('input', updateFeePreview);
listingQuantitySelect.addEventListener('change', updateFeePreview);

const tabBtns = document.querySelectorAll('.seller-tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const forgotPasswordForm = document.getElementById('forgot-password-form');
const recoverAccountForm = document.getElementById('recover-account-form');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    loginForm.hidden = tab !== 'login';
    signupForm.hidden = tab !== 'signup';
    forgotPasswordForm.hidden = true;
    recoverAccountForm.hidden = true;
  });
});

document.getElementById('forgot-password-link').addEventListener('click', () => {
  loginForm.hidden = true;
  signupForm.hidden = true;
  forgotPasswordForm.hidden = false;
});

document.getElementById('forgot-password-cancel').addEventListener('click', () => {
  forgotPasswordForm.hidden = true;
  loginForm.hidden = false;
});

forgotPasswordForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('forgot-key').value.trim();
  const message = document.getElementById('forgot-password-message');
  message.textContent = 'Sending...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Could not send reset link.', true);
      return;
    }
    showMessage(message, data.message || 'Reset link sent!', false);
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

document.getElementById('lost-key-link').addEventListener('click', () => {
  forgotPasswordForm.hidden = true;
  recoverAccountForm.hidden = false;
});

document.getElementById('recover-account-cancel').addEventListener('click', () => {
  recoverAccountForm.hidden = true;
  loginForm.hidden = false;
});

recoverAccountForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('recover-name').value.trim();
  const phone = document.getElementById('recover-phone').value.trim();
  const message = document.getElementById('recover-account-message');
  message.textContent = 'Looking up your account...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/recover-account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Could not recover your account.', true);
      return;
    }
    showMessage(message, data.message || 'Recovery email sent!', false);
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

function showMessage(el, text, isError) {
  el.textContent = text;
  el.className = 'form-message' + (isError ? ' error' : ' success');
}

async function checkSession() {
  try {
    const res = await fetch('/api/seller/me');
    if (res.ok) {
      const data = await res.json();
      showDashboard(data.displayName, data.isAdmin, data.email, data.profileComplete);
      loadMyListings();
      if (data.isAdmin) loadAdminListings();
    } else {
      showAuth();
    }
  } catch (err) {
    showAuth();
  }
}

function showDashboard(displayName, isAdmin, email, profileComplete) {
  sellerNameEl.textContent = displayName + (isAdmin ? ' (Admin)' : '');
  authSection.hidden = true;
  dashboardSection.hidden = false;
  document.getElementById('admin-section').hidden = !isAdmin;
  document.getElementById('alert-email').value = email || '';
  document.getElementById('profile-gate-section').hidden = Boolean(profileComplete);
  document.getElementById('dashboard-main').hidden = !profileComplete;
}

function showAuth() {
  authSection.hidden = false;
  dashboardSection.hidden = true;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('login-key').value.trim();
  const password = document.getElementById('login-password').value;
  const message = document.getElementById('login-message');
  message.textContent = 'Logging in...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Login failed.', true);
      return;
    }
    showMessage(message, 'Logged in!', false);
    showDashboard(data.displayName, data.isAdmin, data.email, data.profileComplete);
    loadMyListings();
    if (data.isAdmin) loadAdminListings();
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('signup-key').value.trim();
  const password = document.getElementById('signup-password').value;
  const email = document.getElementById('signup-email').value.trim();
  const message = document.getElementById('signup-message');
  message.textContent = 'Creating account...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, password, email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Signup failed.', true);
      return;
    }
    showMessage(message, 'Account created!', false);
    showDashboard(data.displayName, data.isAdmin, data.email, data.profileComplete);
    loadMyListings();
    if (data.isAdmin) loadAdminListings();
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

const profileForm = document.getElementById('profile-form');
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('profile-name').value.trim();
  const phone = document.getElementById('profile-phone').value.trim();
  const venmo = document.getElementById('profile-venmo').value.trim();
  const cashapp = document.getElementById('profile-cashapp').value.trim();
  const zelle = document.getElementById('profile-zelle').value.trim();
  const message = document.getElementById('profile-message');
  message.textContent = 'Saving...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName,
        phone,
        venmo: venmo || undefined,
        cashapp: cashapp || undefined,
        zelle: zelle || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Could not save profile.', true);
      return;
    }
    document.getElementById('profile-gate-section').hidden = true;
    document.getElementById('dashboard-main').hidden = false;
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

const emailForm = document.getElementById('email-form');
emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('alert-email').value.trim();
  const message = document.getElementById('email-message');
  message.textContent = 'Saving...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email || undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Could not save email.', true);
      return;
    }
    showMessage(message, data.email ? 'Alert email saved!' : 'Alert email removed.', false);
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/seller/logout', { method: 'POST' });
  showAuth();
});

const listingForm = document.getElementById('listing-form');
listingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const description = document.getElementById('listing-description').value.trim();
  const sku = document.getElementById('listing-sku').value.trim();
  const imageUrl = document.getElementById('listing-image').value.trim();
  const price = listingPriceInput.value;
  const quantity = listingQuantitySelect.value;
  const message = document.getElementById('listing-message');
  message.textContent = 'Adding listing...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        sku: sku || undefined,
        imageUrl: imageUrl || undefined,
        price: Number(price),
        quantity: Number(quantity),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Could not add listing.', true);
      return;
    }
    showMessage(message, 'Listing added!', false);
    listingForm.reset();
    listingFeePreview.textContent = '';
    loadMyListings();
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

async function loadMyListings() {
  const container = document.getElementById('my-listings');
  try {
    const res = await fetch('/api/seller/listings');
    if (!res.ok) return;
    const data = await res.json();
    container.innerHTML = '';
    if (data.listings.length === 0) {
      container.innerHTML = '<p class="card-desc">No listings yet — add one above.</p>';
      return;
    }
    for (const listing of data.listings) {
      container.appendChild(buildListingCard(listing));
    }
  } catch (err) {
    container.innerHTML = '<p class="card-desc">Could not load your listings.</p>';
  }
}

function buildListingCard(listing) {
  const card = document.createElement('div');
  card.className = 'card seller-listing-card';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = listing.description;
  card.appendChild(title);

  if (listing.sku) {
    const sku = document.createElement('p');
    sku.className = 'card-desc';
    sku.textContent = `SKU: ${listing.sku}`;
    card.appendChild(sku);
  }

  const price = document.createElement('p');
  price.className = 'card-date';
  price.textContent = `$${Number(listing.price).toFixed(2)} each — you receive $${(Number(listing.price) * (1 - FEE_RATE)).toFixed(2)} each after fee`;
  card.appendChild(price);

  const qty = document.createElement('p');
  qty.className = 'card-desc';
  qty.textContent = `Quantity: ${listing.quantity}`;
  card.appendChild(qty);

  const status = document.createElement('p');
  status.className = 'card-desc';
  status.textContent = listing.status === 'sold' ? 'Sold' : 'Active';
  card.appendChild(status);

  if (listing.status === 'active') {
    const soldBtn = document.createElement('button');
    soldBtn.type = 'button';
    soldBtn.className = 'stock-toggle-btn';
    soldBtn.textContent = 'Mark Sold';
    soldBtn.addEventListener('click', async () => {
      soldBtn.disabled = true;
      await fetch(`/api/seller/listings/${listing.id}/sold`, { method: 'POST' });
      loadMyListings();
    });
    card.appendChild(soldBtn);
  }

  return card;
}

async function loadAdminListings() {
  const container = document.getElementById('admin-listings');
  try {
    const res = await fetch('/api/seller/admin/listings');
    if (!res.ok) return;
    const data = await res.json();
    container.innerHTML = '';
    if (data.listings.length === 0) {
      container.innerHTML = '<p class="card-desc">No listings exist yet.</p>';
      return;
    }
    for (const listing of data.listings) {
      container.appendChild(buildAdminListingCard(listing));
    }
  } catch (err) {
    container.innerHTML = '<p class="card-desc">Could not load listings.</p>';
  }
}

function buildAdminListingCard(listing) {
  const card = document.createElement('div');
  card.className = 'card seller-listing-card';

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = listing.description;
  card.appendChild(title);

  const seller = document.createElement('p');
  seller.className = 'card-desc';
  seller.textContent = `Seller: ${listing.sellerName}`;
  card.appendChild(seller);

  if (listing.sku) {
    const sku = document.createElement('p');
    sku.className = 'card-desc';
    sku.textContent = `SKU: ${listing.sku}`;
    card.appendChild(sku);
  }

  const price = document.createElement('p');
  price.className = 'card-date';
  price.textContent = `$${Number(listing.price).toFixed(2)} each × ${listing.quantity}`;
  card.appendChild(price);

  const status = document.createElement('p');
  status.className = 'card-desc';
  status.textContent = listing.status === 'sold' ? 'Sold' : 'Active';
  card.appendChild(status);

  const sellerDetails = document.createElement('details');
  sellerDetails.className = 'admin-seller-details';
  const sellerSummary = document.createElement('summary');
  sellerSummary.textContent = 'Seller Details';
  sellerDetails.appendChild(sellerSummary);

  const detailRows = [
    ['Full Name', listing.sellerFullName],
    ['Phone', listing.sellerPhone],
    ['Email', listing.sellerEmail],
    ['Venmo', listing.sellerVenmo],
    ['CashApp', listing.sellerCashapp],
    ['Zelle', listing.sellerZelle],
  ];
  for (const [label, value] of detailRows) {
    const row = document.createElement('p');
    row.className = 'card-desc';
    row.textContent = `${label}: ${value || 'Not provided'}`;
    sellerDetails.appendChild(row);
  }
  card.appendChild(sellerDetails);

  const labelForm = document.createElement('form');
  labelForm.className = 'admin-label-form';

  const labelInput = document.createElement('input');
  labelInput.type = 'file';
  labelInput.accept = 'application/pdf,image/png,image/jpeg';
  labelForm.appendChild(labelInput);

  const labelBtn = document.createElement('button');
  labelBtn.type = 'submit';
  labelBtn.className = 'stock-toggle-btn';
  labelBtn.textContent = 'Send Shipping Label';
  labelForm.appendChild(labelBtn);

  const labelMsg = document.createElement('p');
  labelMsg.className = 'form-message';
  labelForm.appendChild(labelMsg);

  labelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!labelInput.files.length) {
      showMessage(labelMsg, 'Choose a file first.', true);
      return;
    }
    showMessage(labelMsg, 'Sending...', false);
    labelBtn.disabled = true;
    const formData = new FormData();
    formData.append('label', labelInput.files[0]);
    try {
      const res = await fetch(`/api/seller/admin/listings/${listing.id}/shipping-label`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        showMessage(labelMsg, data.error || 'Failed to send label.', true);
        return;
      }
      showMessage(labelMsg, 'Shipping label emailed to the seller!', false);
      labelForm.reset();
    } catch (err) {
      showMessage(labelMsg, 'Network error. Please try again.', true);
    } finally {
      labelBtn.disabled = false;
    }
  });
  card.appendChild(labelForm);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'notify-btn';
  removeBtn.textContent = 'Remove Listing';
  removeBtn.addEventListener('click', async () => {
    if (!confirm(`Remove "${listing.description}" by ${listing.sellerName}? This cannot be undone.`)) return;
    removeBtn.disabled = true;
    await fetch(`/api/seller/admin/listings/${listing.id}/remove`, { method: 'POST' });
    loadAdminListings();
  });
  card.appendChild(removeBtn);

  return card;
}

checkSession();
