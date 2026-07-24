const express = require('express');
const {
  insertListing,
  getListingsBySeller,
  getActiveListings,
  getListingById,
  markListingSold,
  upsertListingInterest,
  getSellerById,
  getAllListingsAdmin,
  deleteListingInterestsByListing,
  deleteListingByIdAdmin,
} = require('./db');
const { requireSellerAuth } = require('./sellerAuth');

function requireAdmin(req, res, next) {
  if (!req.seller.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FEE_RATE = 0.03;
const MARKETPLACE_WEBHOOK_URL = process.env.MARKETPLACE_DISCORD_WEBHOOK_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'PreorderCards <admin@preordercards.com>';

function normalizePhone(value) {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (hasPlus ? '+' : '') + digits;
}

// Fire-and-forget alert to the marketplace's own dedicated Discord webhook —
// separate from the release-interest bot/webhook entirely.
async function notifyMarketplaceDiscord(listing, row) {
  if (!MARKETPLACE_WEBHOOK_URL) return;
  const total = listing.price * row.quantity;
  const buyerPays = total * (1 + FEE_RATE);
  try {
    await fetch(MARKETPLACE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'New Preorder!',
        embeds: [
          {
            title: '🛒 New marketplace interest',
            color: 13770556,
            fields: [
              { name: 'Listing', value: listing.description },
              { name: 'Seller', value: listing.sellerName, inline: true },
              { name: 'Unit price', value: `$${listing.price.toFixed(2)}`, inline: true },
              { name: 'Quantity requested', value: String(row.quantity), inline: true },
              ...(listing.sku ? [{ name: 'SKU', value: listing.sku, inline: true }] : []),
              { name: row.contactType === 'email' ? 'Buyer email' : 'Buyer phone', value: row.contactValue },
              { name: 'Buyer pays (incl. 3% fee)', value: `$${buyerPays.toFixed(2)}` },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch (err) {
    console.error('Marketplace Discord webhook failed:', err.message);
  }
}

// Fire-and-forget email to the seller when their listing gets interest.
// Deliberately generic — never includes the buyer's email/phone. The admin
// stays the go-between for actually facilitating the sale, same as Discord.
async function sendSellerAlertEmail(seller, listing, quantity) {
  if (!seller || !seller.email || !RESEND_API_KEY) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [seller.email],
        subject: 'Someone registered interest in your listing',
        text: `Good news — someone registered interest in your listing "${listing.description}" (quantity: ${quantity}).\n\nWe'll be in touch to help facilitate the sale.\n\n— PreorderCards`,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('Seller alert email failed:', res.status, body);
    }
  } catch (err) {
    console.error('Seller alert email failed:', err.message);
  }
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
  const { description, sku, imageUrl, price, quantity } = req.body || {};

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
  const quantityNum = quantity === undefined ? 1 : Number(quantity);
  if (!Number.isInteger(quantityNum) || quantityNum < 1 || quantityNum > 10) {
    return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 10.' });
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
    quantity: quantityNum,
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

// --- Admin (super key) only ---

router.get('/seller/admin/listings', requireSellerAuth, requireAdmin, (req, res) => {
  const listings = getAllListingsAdmin.all();
  res.json({ listings });
});

router.post('/seller/admin/listings/:id/remove', requireSellerAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const listing = getListingById.get(id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found.' });
  }
  deleteListingInterestsByListing.run(id);
  deleteListingByIdAdmin.run(id);
  res.json({ success: true });
});

// --- Public ---

router.get('/marketplace', (req, res) => {
  const listings = getActiveListings.all();
  res.json({ listings });
});

router.post('/listing-interest', rateLimit, (req, res) => {
  const { listingId, contactType, contactValue, quantity } = req.body || {};

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

  const quantityNum = quantity === undefined ? 1 : Number(quantity);
  const maxQty = Math.min(10, listing.quantity);
  if (!Number.isInteger(quantityNum) || quantityNum < 1 || quantityNum > maxQty) {
    return res.status(400).json({ error: `Quantity must be a whole number between 1 and ${maxQty}.` });
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

  upsertListingInterest.run({
    listingId: listing.id,
    contactType,
    contactValue: normalizedValue,
    quantity: quantityNum,
  });

  const seller = getSellerById.get(listing.seller_id);
  notifyMarketplaceDiscord(
    { ...listing, sellerName: seller ? seller.display_name : 'Unknown seller' },
    { contactType, contactValue: normalizedValue, quantity: quantityNum }
  );
  sendSellerAlertEmail(seller, listing, quantityNum);

  const buyerPays = listing.price * quantityNum * (1 + FEE_RATE);
  res.status(201).json({ success: true, buyerPays: Math.round(buyerPays * 100) / 100 });
});

module.exports = router;
