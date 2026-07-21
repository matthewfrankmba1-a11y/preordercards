const releasesEl = document.getElementById('releases');
const sportFilterEl = document.getElementById('sport-filter');
const statusEl = document.getElementById('status');
const sourceNoteEl = document.getElementById('source-note');
const cardTemplate = document.getElementById('release-card-template');

const PRODUCT_TYPE_LABELS = {
  value: 'Value',
  mega: 'Mega',
  hobby: 'Hobby',
  hobby_case: 'Hobby Case',
};

// Generic, original icon per sport (mirrors the header montage) — used to build
// a placeholder product image since we don't have licensed Topps box photography.
const SPORT_ICONS = {
  Baseball: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="32" cy="32" r="26" fill="rgba(255,255,255,0.14)"/>
    <path d="M14 14 Q32 28 14 50"/>
    <path d="M50 14 Q32 28 50 50"/>
  </svg>`,
  Basketball: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="32" cy="32" r="26" fill="rgba(255,255,255,0.14)"/>
    <line x1="32" y1="6" x2="32" y2="58"/>
    <line x1="6" y1="32" x2="58" y2="32"/>
    <path d="M10 14 Q32 32 10 50"/>
    <path d="M54 14 Q32 32 54 50"/>
  </svg>`,
  Football: `<svg viewBox="0 0 64 64" width="52" height="36" fill="none" stroke="#fff" stroke-width="2.5">
    <ellipse cx="32" cy="32" rx="28" ry="16" fill="rgba(255,255,255,0.22)"/>
    <line x1="14" y1="32" x2="50" y2="32"/>
    <line x1="26" y1="26" x2="26" y2="38"/>
    <line x1="32" y1="24" x2="32" y2="40"/>
    <line x1="38" y1="26" x2="38" y2="38"/>
  </svg>`,
  MMA: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <g transform="rotate(-20 20 32)">
      <ellipse cx="20" cy="26" rx="12" ry="14" fill="rgba(255,255,255,0.14)"/>
      <rect x="12" y="38" width="16" height="14" rx="4" fill="rgba(255,255,255,0.14)"/>
    </g>
    <g transform="rotate(20 44 32)">
      <ellipse cx="44" cy="26" rx="12" ry="14" fill="rgba(255,255,255,0.14)"/>
      <rect x="36" y="38" width="16" height="14" rx="4" fill="rgba(255,255,255,0.14)"/>
    </g>
  </svg>`,
  Soccer: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2.5">
    <circle cx="32" cy="32" r="26" fill="rgba(255,255,255,0.14)"/>
    <polygon points="32,18 40,24 37,34 27,34 24,24" fill="rgba(255,255,255,0.3)"/>
    <line x1="32" y1="18" x2="32" y2="8"/>
    <line x1="40" y1="24" x2="50" y2="18"/>
    <line x1="37" y1="34" x2="44" y2="46"/>
    <line x1="27" y1="34" x2="20" y2="46"/>
    <line x1="24" y1="24" x2="14" y2="18"/>
  </svg>`,
  Entertainment: `<svg viewBox="0 0 64 64" width="48" height="48" fill="none" stroke="#fff" stroke-width="2">
    <polygon points="32,4 38,22 58,20 44,34 50,54 32,42 14,54 20,34 6,20 26,22" fill="rgba(255,255,255,0.2)"/>
  </svg>`,
};

function sportSlug(sport) {
  return sport.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

let allReleases = [];

function showStatus(message) {
  statusEl.textContent = message;
  statusEl.hidden = false;
}

function formatDate(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatGroupLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

async function loadReleases() {
  try {
    const res = await fetch('/api/releases');
    if (!res.ok) throw new Error('Request failed');
    const data = await res.json();
    allReleases = data.releases;
    sourceNoteEl.textContent = data.sourceNote
      ? `${data.sourceNote} Last updated ${data.lastUpdated}.`
      : '';
    populateSportFilter(allReleases);
    render(allReleases);
  } catch (err) {
    showStatus('Could not load release data. Please refresh the page.');
  }
}

function populateSportFilter(releases) {
  const sports = [...new Set(releases.map((r) => r.sport))].sort();
  for (const sport of sports) {
    const opt = document.createElement('option');
    opt.value = sport;
    opt.textContent = sport;
    sportFilterEl.appendChild(opt);
  }
}

function render(releases) {
  releasesEl.innerHTML = '';
  if (releases.length === 0) {
    showStatus('No upcoming releases match this filter.');
    return;
  }
  statusEl.hidden = true;

  const sorted = [...releases].sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  let currentGroup = null;

  for (const release of sorted) {
    const groupLabel = formatGroupLabel(release.releaseDate);
    if (groupLabel !== currentGroup) {
      currentGroup = groupLabel;
      const groupEl = document.createElement('div');
      groupEl.className = 'date-group';
      groupEl.textContent = groupLabel;
      releasesEl.appendChild(groupEl);
    }
    releasesEl.appendChild(buildCard(release));
  }
}

function buildProductImage(release) {
  const slug = sportSlug(release.sport);
  const icon = SPORT_ICONS[release.sport] || '';
  return {
    className: `product-image tile-${slug}`,
    html: `
      ${icon}
      <span class="product-image-format">${release.format}</span>
    `,
  };
}

function buildCard(release) {
  const node = cardTemplate.content.cloneNode(true);

  const productImage = buildProductImage(release);
  const imageEl = node.querySelector('.product-image');
  imageEl.className = productImage.className;
  imageEl.innerHTML = productImage.html;

  node.querySelector('.sport-badge').textContent = release.sport;
  node.querySelector('.format-badge').textContent = release.format;
  node.querySelector('.card-title').textContent = release.title;
  node.querySelector('.card-date').textContent = formatDate(release.releaseDate);
  node.querySelector('.card-desc').textContent = release.description || '';
  node.querySelector('.card-preorder-note').textContent = release.isPreorderOpenDate
    ? 'This date is when preorders open, not the ship date.'
    : '';

  const countEl = node.querySelector('.card-count');
  updateCountText(countEl, release.interestCount);

  const quantitySelect = node.querySelector('.quantity-select');
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = i === 1 ? '1 item' : `${i} items`;
    quantitySelect.appendChild(opt);
  }

  const form = node.querySelector('.signup-form');
  const productTypeSelect = form.querySelector('.product-type-select');
  for (const [value, label] of Object.entries(PRODUCT_TYPE_LABELS)) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    productTypeSelect.appendChild(opt);
  }
  const toggleBtns = form.querySelectorAll('.toggle-btn');
  const input = form.querySelector('.contact-input');
  const message = form.querySelector('.form-message');
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

    const submitBtn = form.querySelector('.notify-btn');
    submitBtn.disabled = true;
    message.textContent = 'Submitting...';
    message.className = 'form-message';

    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          releaseId: release.id,
          contactType,
          contactValue: value,
          quantity: Number(quantitySelect.value),
          productType: productTypeSelect.value,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.textContent = data.error || 'Something went wrong.';
        message.className = 'form-message error';
      } else {
        message.textContent = "You're registered! We'll be in touch.";
        message.className = 'form-message success';
        updateCountText(countEl, data.interestCount);
      }
    } catch (err) {
      message.textContent = 'Network error. Please try again.';
      message.className = 'form-message error';
    } finally {
      submitBtn.disabled = false;
    }
  });

  return node;
}

function updateCountText(el, count) {
  if (!count) {
    el.textContent = 'Be the first to register interest.';
  } else {
    el.textContent = `${count} collector${count === 1 ? '' : 's'} interested so far.`;
  }
}

sportFilterEl.addEventListener('change', () => {
  const value = sportFilterEl.value;
  const filtered = value === 'all' ? allReleases : allReleases.filter((r) => r.sport === value);
  render(filtered);
});

loadReleases();
