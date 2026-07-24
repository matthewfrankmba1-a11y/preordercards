const statusEl = document.getElementById('status');
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const sellerNameEl = document.getElementById('seller-name');

const tabBtns = document.querySelectorAll('.seller-tab-btn');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    loginForm.hidden = tab !== 'login';
    signupForm.hidden = tab !== 'signup';
  });
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
      showDashboard(data.displayName);
      loadMyListings();
    } else {
      showAuth();
    }
  } catch (err) {
    showAuth();
  }
}

function showDashboard(displayName) {
  sellerNameEl.textContent = displayName;
  authSection.hidden = true;
  dashboardSection.hidden = false;
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
    showDashboard(data.displayName);
    loadMyListings();
  } catch (err) {
    showMessage(message, 'Network error. Please try again.', true);
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('signup-key').value.trim();
  const password = document.getElementById('signup-password').value;
  const message = document.getElementById('signup-message');
  message.textContent = 'Creating account...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Signup failed.', true);
      return;
    }
    showMessage(message, 'Account created!', false);
    showDashboard(data.displayName);
    loadMyListings();
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
  const price = document.getElementById('listing-price').value;
  const message = document.getElementById('listing-message');
  message.textContent = 'Adding listing...';
  message.className = 'form-message';

  try {
    const res = await fetch('/api/seller/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, sku: sku || undefined, imageUrl: imageUrl || undefined, price: Number(price) }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMessage(message, data.error || 'Could not add listing.', true);
      return;
    }
    showMessage(message, 'Listing added!', false);
    listingForm.reset();
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
  price.textContent = `$${Number(listing.price).toFixed(2)}`;
  card.appendChild(price);

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

checkSession();
