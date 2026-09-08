'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DiscountBanner from './DiscountBanner';
import ReleaseCard from './ReleaseCard';
import { hasKnownDate, isSoldOut, msUntilNextChange } from '../lib/soldOut';

// Re-renders when the sold-out answer changes underneath a page that's just
// sitting open — 2pm Eastern, when the day's releases flip, and midnight,
// when the next day's become current. Without this, someone who opened the
// page at 1:55 could still register at 2:05 against a card that says the
// release is available; the API would reject it, which is a worse way to
// find out.
function useSoldOutClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer;
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msUntilNextChange());
    };
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return now;
}

// Cap how many sold-out cards ever appear at once, so the page doesn't read as
// "mostly sold out" — only the most recent MAX_SOLD_OUT_SHOWN are kept; older
// sold-out releases are dropped from the listing entirely.
const MAX_SOLD_OUT_SHOWN = 1;

function limitSoldOut(releases, now) {
  const active = releases.filter((r) => !isSoldOut(r, now));
  const soldOut = releases
    .filter((r) => isSoldOut(r, now))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .slice(0, MAX_SOLD_OUT_SHOWN);
  return [...active, ...soldOut];
}

function formatGroupLabel(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// Counts this load, then shows the total it comes back with. The ref guard
// makes it fire once per page load rather than once per effect run — React
// StrictMode double-invokes effects in development, which would otherwise
// count every local page load twice.
function usePageViewCount(initialViews) {
  const [views, setViews] = useState(initialViews);
  const recorded = useRef(false);

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    let cancelled = false;
    fetch('/api/page-view', { method: 'POST' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.views === 'number') setViews(data.views);
      })
      .catch(() => {
        // A failed count is not worth surfacing — the server-rendered
        // number stays on screen, just without this visit included.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return views;
}

// Header links, in order. `hidden` takes one off the homepage without losing
// it: the page it points at stays reachable by URL and nothing else about it
// changes, so putting a link back is one flag rather than an archaeology
// exercise. The two hidden ones came off on 2026-09-08 — four links in the
// header read as clutter.
const HEADER_LINKS = [
  { href: '/success.html', label: 'See Success Stories' },
  { href: '/marketplace.html', label: 'Browse Marketplace' },
  {
    href: 'https://docs.google.com/forms/d/e/1FAIpQLScFl_nJ4tvYHxAmU6X-cQ5RoheIe4GJxTJnbQI5zUxqj4Ea3Q/viewform?usp=sharing&ouid=105723711896896295891',
    label: 'Submit Slot Details',
    external: true,
    hidden: true,
  },
  { href: '/pokemon-autocheckout.html', label: 'Pokemon Center Autocheckout', hidden: true },
];

export default function HomeClient({ initialReleases, initialSourceNote, initialLastUpdated, initialViews }) {
  const pageViews = usePageViewCount(initialViews);
  const now = useSoldOutClock();
  // Recomputed against the clock rather than pinned at first render: which
  // releases count as sold out — and so which single sold-out card is the
  // one still shown — changes at 2pm and again at midnight.
  const allReleases = useMemo(
    () => (initialReleases ? limitSoldOut(initialReleases, now) : null),
    [initialReleases, now]
  );
  const [error] = useState(!initialReleases);
  const [sourceNote] = useState(() =>
    initialSourceNote ? `${initialSourceNote} Last updated ${initialLastUpdated}.` : ''
  );
  const [brandFilter, setBrandFilter] = useState('all');
  const [sportFilter, setSportFilter] = useState('all');
  const [inStockOnly, setInStockOnly] = useState(false);

  const sports = useMemo(() => {
    if (!allReleases) return [];
    return [...new Set(allReleases.map((r) => r.sport))].sort();
  }, [allReleases]);

  // Derived from the data rather than a fixed list, so the control only
  // offers brands that actually have releases on the calendar.
  const brands = useMemo(() => {
    if (!allReleases) return [];
    return [...new Set(allReleases.map((r) => r.manufacturer || 'Topps'))].sort();
  }, [allReleases]);

  const filtered = useMemo(() => {
    if (!allReleases) return [];
    let result = allReleases;
    if (brandFilter !== 'all') result = result.filter((r) => (r.manufacturer || 'Topps') === brandFilter);
    if (sportFilter !== 'all') result = result.filter((r) => r.sport === sportFilter);
    if (inStockOnly) {
      result = result.filter((r) => !isSoldOut(r, now));
    }
    return result;
  }, [allReleases, brandFilter, sportFilter, inStockOnly, now]);

  // Dated releases first in date order, then the undated ones alphabetically
  // — they belong on the calendar but can't be placed on it.
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aKnown = hasKnownDate(a);
        const bKnown = hasKnownDate(b);
        if (aKnown && bKnown) return a.releaseDate.localeCompare(b.releaseDate);
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        return a.title.localeCompare(b.title);
      }),
    [filtered]
  );

  let status = null;
  if (error) {
    status = 'Could not load release data. Please refresh the page.';
  } else if (allReleases && sorted.length === 0) {
    status = 'No upcoming releases match this filter.';
  }

  let currentGroup = null;

  return (
    <>
      <DiscountBanner />

      <header className="site-header header-centered">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Topps &amp; Panini Preorder Release Calendar</h1>
          <p className="tagline">Upcoming Topps &amp; Panini Releases, by date. Register your interest, no upfront payment required, pricing guaranteed to be lower than market.</p>
          <div className="header-nav-links">
            {HEADER_LINKS.filter((link) => !link.hidden).map((link) => (
              <a
                key={link.href}
                className="header-nav-link"
                href={link.href}
                {...(link.external ? { target: '_blank', rel: 'noopener' } : {})}
              >
                {link.label} →
              </a>
            ))}
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="controls">
          {brands.length > 1 && (
            <div className="brand-filter-group" role="group" aria-label="Filter by brand">
              <button
                type="button"
                className={`stock-toggle-btn${brandFilter === 'all' ? ' active' : ''}`}
                aria-pressed={brandFilter === 'all'}
                onClick={() => setBrandFilter('all')}
              >
                All brands
              </button>
              {brands.map((brand) => (
                <button
                  key={brand}
                  type="button"
                  className={`stock-toggle-btn${brandFilter === brand ? ' active' : ''}`}
                  aria-pressed={brandFilter === brand}
                  onClick={() => setBrandFilter(brand)}
                >
                  {brand}
                </button>
              ))}
            </div>
          )}
          <label htmlFor="sport-filter">Filter by sport</label>
          <select id="sport-filter" value={sportFilter} onChange={(e) => setSportFilter(e.target.value)}>
            <option value="all">All sports</option>
            {sports.map((sport) => <option value={sport} key={sport}>{sport}</option>)}
          </select>
          <button
            id="in-stock-toggle"
            type="button"
            className={`stock-toggle-btn${inStockOnly ? ' active' : ''}`}
            aria-pressed={inStockOnly}
            onClick={() => setInStockOnly(!inStockOnly)}
          >
            In Stock Only
          </button>
        </div>

        {status && <div className="status">{status}</div>}
        <div className="releases">
          {sorted.map((release) => {
            const groupLabel = hasKnownDate(release) ? formatGroupLabel(release.releaseDate) : 'Date to be announced';
            const showGroup = groupLabel !== currentGroup;
            currentGroup = groupLabel;
            return (
              <div key={release.id} style={{ display: 'contents' }}>
                {showGroup && <div className="date-group">{groupLabel}</div>}
                <ReleaseCard release={release} soldOut={isSoldOut(release, now)} />
              </div>
            );
          })}
        </div>

        <section id="faq" className="faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Frequently Asked Questions</h2>

          <details>
            <summary>What is PreorderCards?</summary>
            <p>PreorderCards is an independent site that tracks upcoming Topps and Panini trading card release dates and lets you register interest for free, with no upfront payment required. It is not affiliated with, endorsed by, or sponsored by Topps or any league or brand referenced on the site.</p>
          </details>

          <details>
            <summary>How do I preorder an upcoming Topps or Panini release?</summary>
            <p>Browse the release calendar on PreorderCards, open a release, choose a quantity, and register your interest with an email address or phone number. No payment is collected at registration.</p>
          </details>

          <details>
            <summary>Is there a fee to register interest in a preorder?</summary>
            <p>No. Registering interest on PreorderCards is free. A transaction fee only applies if you later buy or sell through the PreorderCards Marketplace — see the <a href="/terms.html">Terms &amp; Conditions</a> page for the current fee structure.</p>
          </details>

          <details>
            <summary>What happens if a Topps release sells out?</summary>
            <p>PreorderCards marks sold-out releases clearly with a sold-out label and disables the registration form for that release, so availability shown on the site is always current.</p>
          </details>

          <details>
            <summary>Is PreorderCards affiliated with Topps, Marvel, or any sports league?</summary>
            <p>No. PreorderCards is an independent release-tracking and interest-registration service. It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL, the UFC, Disney, Marvel, or any other brand or league referenced on the site.</p>
          </details>

          <details>
            <summary>What is the PreorderCards Marketplace?</summary>
            <p>The <a href="/marketplace.html">PreorderCards Marketplace</a> lets vetted, trusted sellers list factory-sealed, in-hand Topps inventory at a fixed price. Buyers register interest at that listed price — there is no bidding or offer negotiation.</p>
          </details>

          <details>
            <summary>How does PreorderCards help verify authenticity?</summary>
            <p>Marketplace sellers are required to keep the original factory seal and the original retailer tracking number visible on every item, and buyers are vetted before a sale is completed. Full requirements are on the <a href="/terms.html">Terms &amp; Conditions</a> page.</p>
          </details>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p id="source-note">{sourceNote}</p>
          <p className="disclaimer" style={{ marginBottom: '0.5rem' }}>
            Release dates are compiled from public trackers including <a href="https://www.beckett.com/" target="_blank" rel="noopener">Beckett</a> and Waxstat — always confirm on Topps.com before buying.
          </p>
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service.
            It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL,
            the UFC, Disney, Marvel, or any other brand or league referenced here. All product
            names and trademarks belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a> · <a href="/newsletter.html">Newsletter</a> · <a href="https://www.instagram.com/frank92_______/" target="_blank" rel="noopener noreferrer">Contact</a>
          </p>
          {typeof pageViews === 'number' && (
            <p className="page-view-count">{pageViews.toLocaleString('en-US')} page views</p>
          )}
        </div>
      </footer>
    </>
  );
}
