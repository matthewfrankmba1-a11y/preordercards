const gridEl = document.getElementById('photo-grid');
const statusEl = document.getElementById('status');

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = false;
}

async function loadPhotos() {
  try {
    const res = await fetch('/api/success-photos');
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    render(data.photos);
  } catch (err) {
    showStatus('Could not load photos. Please refresh the page.');
  }
}

function render(photos) {
  if (photos.length === 0) {
    showStatus('No success stories posted yet — check back soon.');
    return;
  }
  statusEl.hidden = true;

  for (const photo of photos) {
    const card = document.createElement('div');
    card.className = 'photo-card';

    const img = document.createElement('img');
    img.src = photo.url;
    img.alt = 'Order confirmation screenshot';
    img.loading = 'lazy';

    card.appendChild(img);
    gridEl.appendChild(card);
  }
}

loadPhotos();
