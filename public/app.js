const releasesEl = document.getElementById('releases');
const sportFilterEl = document.getElementById('sport-filter');
const statusEl = document.getElementById('status');
const sourceNoteEl = document.getElementById('source-note');
const cardTemplate = document.getElementById('release-card-template');

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

function buildCard(release) {
  const node = cardTemplate.content.cloneNode(true);
  node.querySelector('.sport-badge').textContent = release.sport;
  node.querySelector('.format-badge').textContent = release.format;
  node.querySelector('.card-title').textContent = release.title;
  node.querySelector('.card-date').textContent = formatDate(release.releaseDate);
  node.querySelector('.card-desc').textContent = release.description || '';
  node.querySelector('.card-preorder-note').textContent = release.isPreorderOpenDate
    ? 'This date is when preorders open, not the ship date.'
    : '';

  const countEl = node.querySelector('.card-count');
  updateCountText(countEl, release.preorderCount);

  const form = node.querySelector('.signup-form');
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
      const res = await fetch('/api/preorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseId: release.id, contactType, contactValue: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        message.textContent = data.error || 'Something went wrong.';
        message.className = 'form-message error';
      } else {
        message.textContent = "You're on the list! We'll notify you.";
        message.className = 'form-message success';
        input.value = '';
        updateCountText(countEl, data.preorderCount);
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
    el.textContent = 'Be the first to sign up.';
  } else {
    el.textContent = `${count} collector${count === 1 ? '' : 's'} signed up for updates.`;
  }
}

sportFilterEl.addEventListener('change', () => {
  const value = sportFilterEl.value;
  const filtered = value === 'all' ? allReleases : allReleases.filter((r) => r.sport === value);
  render(filtered);
});

loadReleases();
