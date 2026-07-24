const express = require('express');
const {
  insertListing,
  getListingsBySeller,
  getActiveListings,
  getListingById,
  markListingSold,
  upsertListingInterest,
  getSellerById,
} = require('./db');
const { requireSellerAuth } = require('./sellerAuth');
const bot = require('./bot');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (hasPlus ? '+' : '') + digits;
}

// Rate limiter for public buyer-interest submissions (same pattern used elsewhere).
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;
const hitsByIp = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const hits = (hitsByIp.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: 'Too many requests from this address. Try again later.' });
  }
  hits.push(now);
  hitsByIp.set(ip, hits);
  next();
}

const router = express.Router();

// --- Seller-side (authenticated) ---

router.post('/seller/listings', requireSellerAuth, (req, res) => {
  const { description, sku, imageUrl, price } = req.body || {};

  if (typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({ error: 'Description is required.' });
  }
  if (description.length > 500) {
    return res.status(400).json({ error: 'Description is too long (max 500 characters).' });
  }
  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return res.status(400).json({ error: 'Enter a valid price greater than 0.' });
  }
  if (imageUrl) {
    try {
      new URL(imageUrl);
    } catch {
      return res.status(400).json({ error: 'Image URL is not a valid URL.' });
    }
  }
  if (sku && String(sku).length > 100) {
    return res.status(400).json({ error: 'SKU is too long (max 100 characters).' });
  }

  const result = insertListing.run({
    sellerId: req.seller.id,
    description: description.trim(),
    sku: sku ? String(sku).trim() : null,
    imageUrl: imageUrl ? String(imageUrl).trim() : null,
    price: priceNum,
  });

  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.get('/seller/listings', requireSellerAuth, (req, res) => {
  const listings = getListingsBySeller.all(req.seller.id);
  res.json({ listings });
});

router.post('/seller/listings/:id/sold', requireSellerAuth, (req, res) => {
  const id = Number(req.params.id);
  const result = markListingSold.run({ id, sellerId: req.seller.id });
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  res.json({ success: true });
});

// --- Public ---

router.get('/marketplace', (req, res) => {
  const listings = getActiveListings.all();
  res.json({ listings });
});

router.post('/listing-interest', rateLimit, (req, res) => {
  const { listingId, contactType, contactValue } = req.body || {};

  if (listingId === undefined || listingId === null) {
    return res.status(400).json({ error: 'Missing listingId.' });
  }
  const listing = getListingById.get(Number(listingId));
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  if (listing.status !== 'active') {
    return res.status(410).json({ error: 'This listing is no longer available.' });
  }

  let normalizedValue;
  if (contactType === 'email') {
    const email = String(contactValue || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    normalizedValue = email;
  } else if (contactType === 'phone') {
    const phone = normalizePhone(String(contactValue || ''));
    if (!phone) {
      return res.status(400).json({ error: 'Enter a valid phone number.' });
    }
    normalizedValue = phone;
  } else {
    return res.status(400).json({ error: 'contactType must be "email" or "phone".' });
  }

  upsertListingInterest.run({ listingId: listing.id, contactType, contactValue: normalizedValue });

  const seller = getSellerById.get(listing.seller_id);
  bot.postListingInterestAlert(
    { ...listing, sellerName: seller ? seller.display_name : 'Unknown seller' },
    { contactType, contactValue: normalizedValue }
  );

  res.status(201).json({ success: true });
});

module.exports = router;
