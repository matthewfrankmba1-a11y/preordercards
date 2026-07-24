const FEE_RATE = 0.025;

const listingsEl = document.getElementById('listings');
const statusEl = document.getElementById('status');
const cardTemplate = document.getElementById('listing-card-template');

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = false;
}

async function loadListings() {
  try {
    const res = await fetch('/api/marketplace');
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    render(data.listings);
  } catch (err) {
    showStatus('Could not load marketplace listings. Please refresh the page.');
  }
}

function render(listings) {
  listingsEl.innerHTML = '';
  if (listings.length === 0) {
    showStatus('No listings available right now — check back soon.');
    return;
  }
  statusEl.hidden = true;

  for (const listing of listings) {
    listingsEl.appendChild(buildCard(listing));
  }
}

function buildCard(listing) {
  const node = cardTemplate.content.cloneNode(true);
  const card = node.querySelector('.card');

  const imageEl = card.querySelector('.listing-image');
  if (listing.imageUrl) {
    const img = document.createElement('img');
    img.src = listing.imageUrl;
    img.alt = listing.description;
    img.loading = 'lazy';
    imageEl.appendChild(img);
  } else {
    imageEl.remove();
  }

  card.querySelector('.card-title').textContent = listing.description;
  card.querySelector('.listing-sku').textContent = listing.sku ? `SKU: ${listing.sku}` : '';
  card.querySelector('.listing-price').textContent = `$${Number(listing.price).toFixed(2)} each`;
  card.querySelector('.listing-seller').textContent = `Seller: ${listing.sellerName}`;

  const form = card.querySelector('.listing-interest-form');
  const quantitySelect = form.querySelector('.listing-quantity-select');
  const totalPreview = form.querySelector('.listing-total-preview');
  const maxQty = Math.min(10, listing.quantity);
  for (let i = 1; i <= maxQty; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = i === 1 ? '1 item' : `${i} items`;
    quantitySelect.appendChild(opt);
  }

  function updateTotalPreview() {
    const qty = Number(quantitySelect.value) || 1;
    const total = listing.price * qty * (1 + FEE_RATE);
    totalPreview.textContent = `You'll pay $${total.toFixed(2)} total (incl. 2.5% fee).`;
  }
  quantitySelect.addEventListener('change', updateTotalPreview);
  updateTotalPreview();

  const toggleBtns = form.querySelectorAll('.toggle-btn');
  const input = form.querySelector('.contact-input');
  const message = form.querySelector('.form-message');
  const submitBtn = form.querySelector('.notify-btn');
  let contactType = 'email';

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      toggleBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      contactType = btn.dataset.type;
      input.placeholder = contactType === 'email' ? 'you@example.com' : '(555) 555-5555';
      input.autocomplete = contactType === 'email' ? 'email' : 'tel';
      input.value = '';
      message.textContent = '';
      message.className = 'form-message';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (!value) {
      message.textContent = 'Enter a value first.';
      message.className = 'form-message error';
      return;
    }

    submitBtn.disabled = true;
    message.textContent = 'Submitting...';
    message.className = 'form-message';

    try {
      const res = await fetch('/api/listing-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listingId: listing.id,
          contactType,
          contactValue: value,
          quantity: Number(quantitySelect.value),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.textContent = data.error || 'Something went wrong.';
        message.className = 'form-message error';
      } else {
        message.textContent = "You're registered! We'll be in touch.";
        message.className = 'form-message success';
        submitBtn.textContent = 'Registered';
      }
    } catch (err) {
      message.textContent = 'Network error. Please try again.';
      message.className = 'form-message error';
    } finally {
      if (submitBtn.textContent !== 'Registered') submitBtn.disabled = false;
    }
  });

  return node;
}

loadListings();
