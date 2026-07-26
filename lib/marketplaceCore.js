const MARKETPLACE_WEBHOOK_URL = process.env.MARKETPLACE_DISCORD_WEBHOOK_URL;
const FEE_RATE = 0.025;
const SHIPPING_FEE_BASE = 6;
const SHIPPING_FEE_PER_ADDITIONAL_BOX = 1;

function shippingFee(quantity) {
  return SHIPPING_FEE_BASE + (quantity - 1) * SHIPPING_FEE_PER_ADDITIONAL_BOX;
}

// Fire-and-forget alert to the marketplace's own dedicated Discord webhook —
// separate from the release-interest bot/webhook entirely.
async function notifyMarketplaceDiscord(listing, row) {
  if (!MARKETPLACE_WEBHOOK_URL) return;
  const total = listing.price * row.quantity;
  const shipping = shippingFee(row.quantity);
  const buyerPays = total * (1 + FEE_RATE) + shipping;
  const sellerReceives = total * (1 - FEE_RATE) - shipping;
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
              { name: 'Seller email', value: listing.sellerEmail || 'Not set', inline: true },
              { name: `Buyer pays (incl. 2.5% fee + $${shipping} shipping)`, value: `$${buyerPays.toFixed(2)}`, inline: true },
              { name: `Seller receives (after 2.5% fee + $${shipping} shipping)`, value: `$${sellerReceives.toFixed(2)}`, inline: true },
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

const { sendEmail, isEmailConfigured } = require('./email');

// Fire-and-forget email to the seller when their listing gets interest.
// Deliberately generic — never includes the buyer's email/phone. The admin
// stays the go-between for actually facilitating the sale, same as Discord.
async function sendSellerAlertEmail(seller, listing, quantity) {
  if (!seller || !seller.email || !isEmailConfigured()) return;
  await sendEmail({
    to: seller.email,
    subject: 'Someone registered interest in your listing',
    text: `Good news — someone registered interest in your listing "${listing.description}" (quantity: ${quantity}).\n\nWe'll be in touch to help facilitate the sale.\n\n— PreorderCards`,
  });
}

const LABEL_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);

// Checks the authenticated seller session's is_admin flag — distinct from
// utils.js's checkAdminSecret, which gates the shared-secret key-management
// routes instead. Not interchangeable with each other.
function isSellerAdmin(seller) {
  return Boolean(seller.isAdmin);
}

module.exports = {
  FEE_RATE,
  shippingFee,
  notifyMarketplaceDiscord,
  sendSellerAlertEmail,
  LABEL_MIME_TYPES,
  isSellerAdmin,
};
