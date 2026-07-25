# Topps Preorder Release Calendar

A small full-stack app that lists upcoming Topps trading card releases,
grouped by date, with a "Register Interest" form so visitors can flag
which product and quantity they want — no payment info collected, just
contact details. The site is an independent tracker, not affiliated with
Topps or any league/brand referenced in the data (see the footer disclaimer).

## Stack

- Node.js + Express (server, API)
- better-sqlite3 (stores interest registrations locally in `data/preorders.db`)
- Vanilla HTML/CSS/JS frontend (no build step)

Product images are generic, generated placeholders (gradient + icon per
sport, reusing the header montage art) rather than real Topps box
photography — the site has no license to reproduce actual product images
or Marvel/Disney/league character art.

## Running it

```bash
npm install
npm start
```

Then open http://localhost:3000

For auto-restart on file changes during development:

```bash
npm run dev
```

## Release data

`data/releases.json` is a **manually curated** list — Topps does not
publish a public API for release dates. It was seeded on 2026-07-21 from
public release-date trackers (Beckett, Waxstat). Manufacturers change
dates frequently, so treat this file as a starting point:

- Edit `data/releases.json` directly to add, remove, or update releases.
- Each entry: `id` (unique slug), `title`, `sport`, `format`, `releaseDate`
  (`YYYY-MM-DD`), `description`, and optional `isPreorderOpenDate: true`
  if the date marks when preorders open rather than the ship date.
- Update the top-level `lastUpdated` field when you refresh the data.
- Always confirm against topps.com or your retailer before relying on a date.

Any release with a `releaseDate` in the past is automatically shown greyed
out with a "Sold Out" stamp and a disabled registration form — this is
computed from today's date at render/request time, not a flag you set
manually. Add `"soldOut": true` to a release to mark it sold out by hand
before its date has passed (e.g. it sold out same-day). Both cases get
identical treatment, and the `POST /api/interest` endpoint rejects
registrations for either (HTTP 410) server-side, so it can't be bypassed
by calling the API directly.

## Interest registrations

`POST /api/interest` accepts:

```json
{
  "releaseId": "2026-topps-chrome-baseball-hobby",
  "contactType": "email",
  "contactValue": "you@example.com",
  "quantity": 2
}
```

- `quantity` is a whole number from 1–10.

Registrations are validated and stored in a local SQLite database
(`data/preorders.db`, gitignored — it contains personal contact info and
should never be committed). A person can register once per release —
resubmitting updates the quantity instead of erroring. A simple in-memory
rate limiter caps requests per IP.

## Discord bot (interest alerts + manual email send)

Every registration posts an alert to Discord with the release, sport,
quantity, and contact info — the embed title is prefixed with a
sport-specific emoji (⚾🏀🏈🥊⚽🎬, `SPORT_EMOJI` in `bot.js`/`server.js`),
falling back to 📦 for unrecognized sports.

Rather than emailing the registrant automatically, alerts for email
registrations include a **"Send Confirmation Email" button**. Clicking it
sends the acknowledgment email (via Resend) on demand, then disables
itself and marks that registration as sent (`email_sent_at` in the
database) so it can't be double-sent. This requires a real Discord bot,
not just a webhook — plain incoming webhooks can't route button clicks
anywhere, since they aren't tied to any Application.

**Setup:**

1. [discord.com/developers/applications](https://discord.com/developers/applications)
   → **New Application** → name it anything.
2. **Bot** tab → **Reset Token** → copy it → this is `DISCORD_BOT_TOKEN`.
   No privileged intents are needed (button interactions work without them).
3. **OAuth2 → URL Generator** → scopes: `bot`. Permissions: **View Channel**,
   **Send Messages**, **Embed Links**. Open the generated URL and add the
   bot to your server.
4. In Discord, enable Developer Mode (User Settings → Advanced), then
   right-click the channel you want alerts in → **Copy Channel ID** → this
   is `DISCORD_CHANNEL_ID`.
5. Set both in `.env` (local) or Render's Environment tab (production).

If `DISCORD_BOT_TOKEN`/`DISCORD_CHANNEL_ID` aren't set, alerts fall back to
the legacy `DISCORD_WEBHOOK_URL` webhook (no button) so basic alerting still
works without the bot. If the bot *is* configured, it takes priority.

- The bot connects once at server startup (`bot.init(...)` in `server.js`)
  and stays connected via a persistent WebSocket — this runs fine inside
  the same Node process as the web server, no separate service needed.
- `DISCORD_BOT_TOKEN` is a secret — anyone with it can control the bot.
  Never commit it.

## Confirmation emails

Set `RESEND_API_KEY` (from [resend.com](https://resend.com), free up to
3,000 emails/month) and `EMAIL_FROM`. This only sends when you click
"Send Confirmation Email" on a Discord alert — never automatically.
Phone-only registrants have no email address, so the button doesn't
appear for those.

- Sending from your own domain (e.g. `notifications@preordercards.com`)
  requires verifying it in Resend's dashboard first (Domains → Add Domain
  → add the SPF/DKIM/MX DNS records it shows at your registrar). Until
  verified, Resend rejects sends from that address — clicking the button
  will show that error back to you in Discord (ephemeral reply).
- `RESEND_API_KEY` is a secret — never commit it, same as the bot token.

## Success stories page

`/success.html` shows a photo grid of order screenshots. Drop image files
(`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`) into `public/success/` and they
appear automatically, newest first — `GET /api/success-photos` lists
whatever's in that folder at request time, no manifest file to maintain.

## Seller marketplace

A separate, invite-key-gated marketplace for trusted sellers to list in-hand
inventory (not tied to the curated release calendar), with buyers registering
interest at a fixed price — no offers/negotiation.

- **Invite keys**: run `node scripts/generate-seller-keys.js [count]` (defaults
  to 10) to mint new keys. Each key is single-use and doubles as that seller's
  permanent login identifier (paired with a password they set at signup) —
  there's no separate username, consistent with sellers being anonymous.
- **Seller dashboard**: `/seller.html` — sign up with a key + password (gets
  a random anonymous display name like "QuietOtter482"), or log back in with
  the same key + password. Authenticated sellers can add listings
  (description, optional SKU, optional image URL — a pasted stock-photo link,
  not a file upload — quantity available 1-10, and price per unit) and mark
  their own listings sold.
- **Sessions**: a custom lightweight token stored in the `seller_sessions`
  table (not `express-session`), so sellers stay logged in across redeploys
  since it's backed by the same persistent disk as everything else. 30-day
  expiry. Passwords are hashed with `bcryptjs`.
- **Password reset**: since login is key + password (no username/email),
  "Forgot your password?" on the login tab asks for the invite key, looks
  up its account, and — only if that account has an alert email on file —
  emails a one-time reset link (`POST /api/seller/forgot-password`, token
  stored in `seller_password_resets`, expires in 1 hour, invalidated after
  first use). The link opens `/reset-password.html`, which posts the new
  password to `POST /api/seller/reset-password`. On success, all of that
  seller's existing sessions are deleted, forcing a fresh login everywhere.
  Accounts with no alert email set can't self-serve a reset — the error
  message points them to `admin@preordercards.com`.
- **Fee model**: `FEE_RATE = 0.025` and `shippingFee(quantity)` in
  `marketplace.js` (both mirrored in `public/seller.js` and
  `public/marketplace.js` for live previews — keep all three in sync if
  either changes again). The shipping-label fee scales with quantity:
  `SHIPPING_FEE_BASE = 6` for the first box, plus
  `SHIPPING_FEE_PER_ADDITIONAL_BOX = 1` per additional box in the same
  sale (so 1 box = $6, 2 = $7, 3 = $8, etc.) — applied once per completed
  sale, on both sides. Sellers see a live "you'll receive $X per unit
  after the 2.5% fee" preview plus a shipping-fee estimate for their
  listed quantity while typing a price. Buyers pick a quantity (capped at
  the seller's stock, max 10) and see a live "you'll pay $X total (incl.
  2.5% fee + $Y shipping)" preview (price × quantity × 1.025 +
  shippingFee(quantity)). This matches the fee described on the Terms
  page (`public/terms.html`, section 5) — keep both in sync if it changes
  again.
- **Marketplace Discord alert**: the "🛒 New marketplace interest" embed
  shows both sides of the transaction so the admin can facilitate payment
  without digging through the database — buyer contact (email/phone),
  seller's alert email (if they've set one, else "Not set"), what the
  buyer pays including fees, and what the seller receives after fees.
- **Shipping labels**: on the admin dashboard, each listing in "Admin: All
  Listings" has a file upload + "Send Shipping Label" button
  (`POST /api/seller/admin/listings/:id/shipping-label`, `multipart/form-data`,
  field name `label`, PDF/PNG/JPEG only, 5MB max). It emails the uploaded
  file as an attachment directly to that listing's seller (requires the
  seller to have an alert email on file — returns a 400 if not). Unlike
  the generic interest alert, this is a deliberate manual admin action, so
  the label can legitimately carry the buyer's shipping address on it —
  the admin prepares it (e.g. via a carrier) before uploading.
- **Public marketplace**: `/marketplace.html` lists all active listings;
  buyers register interest (email/phone + quantity) at the seller's listed
  price, no offers/negotiation. This posts a "🛒 New marketplace interest"
  alert to its own dedicated `MARKETPLACE_DISCORD_WEBHOOK_URL` — separate
  from the release-interest bot/webhook — so you can manually facilitate
  the sale. No automated checkout here either.
- Pricing guidance (shown on the seller dashboard) asks sellers to price
  below the lowest active eBay listing for the same item — this is **not
  programmatically enforced** (no eBay API integration), it's an honor-system
  disclosure.
- **Seller alert emails**: sellers can optionally set a contact email (at
  signup, or later via the "Alert Email" form on the dashboard, `POST
  /api/seller/email`) — login always stays key + password, this is a
  notification address only, never a credential. When a buyer registers
  interest in one of their listings, they get a **generic** email via Resend
  ("someone registered interest in your listing... quantity N") — it
  deliberately never includes the buyer's email/phone, so the admin stays
  the go-between for actually facilitating the sale, same as the Discord
  alert. Sending is fire-and-forget and fails silently (logged
  server-side) if `RESEND_API_KEY` isn't set or the send errors, so it can
  never block a buyer's interest registration from succeeding.
- **Admin key generation**: `POST /api/seller/admin/generate-keys` (header
  `x-admin-secret: <ADMIN_SECRET>`, body `{"count": N}`) mints new regular
  invite keys directly against the live database — no host shell access needed.
- **Trusted-seller invite email**: `POST /api/seller/admin/invite-trusted-seller`
  (header `x-admin-secret: <ADMIN_SECRET>`, body `{"email": "..."}`) mints a
  single invite key that **expires in 24 hours** and emails it (via Resend) to
  the given address with the full onboarding rundown — fee structure, listing
  requirements, product-integrity rules (original seal intact, original
  retailer tracking number stays visible, the new outbound shipping label may
  go over other barcodes but never the original tracking number), the escrow
  model for this first wave (manual payouts until trust is established, then
  select sellers move to auto-payout), and the tracking-number-on-ship
  requirement. Regular keys from `/admin/generate-keys` and the super key
  never expire (`expires_at` is `NULL`) — only keys minted through this route
  do. Signup (`POST /api/seller/signup`) rejects an expired key with 400
  before it ever reaches the used-key check.
- **Super key / admin account**: `POST /api/seller/admin/generate-super-key`
  (same `x-admin-secret` header, no body) mints the one-and-only "super key."
  It rejects with `409` if one already exists — only one can ever be
  generated. Signing up with it (same `/seller.html` flow as any other key)
  creates a seller account with `is_admin = 1`. That account gets an extra
  "Admin: All Listings" section on the dashboard showing every seller's
  listings, with a **Remove Listing** button that deletes any listing
  (`POST /api/seller/admin/listings/:id/remove`) regardless of who owns it.
  Regular sellers are unaffected — they can still only add listings and
  mark their own sold, exactly as before; `requireAdmin` middleware in
  `marketplace.js` returns `403` if a non-admin tries the admin routes.

## Analytics

Google Analytics (GA4) is wired into every page via `public/analytics.js`
(measurement ID `G-0KK6YZP2DG`) plus the `gtag.js` loader tag in each
page's `<head>`. The CSP in `server.js` explicitly allows
`googletagmanager.com` (script) and the `google-analytics.com` /
`analytics.google.com` domains (connect/img) — nothing else was loosened.
View traffic at analytics.google.com.

To swap in a different GA property, update the ID in both places: the
`gtag/js?id=...` query param in each HTML file's `<head>`, and the
`gtag('config', ...)` call in `public/analytics.js`.

## Stats summary (Discord, every 6 hours)

`statsSummary.js` posts a "📊 Site Activity Summary" embed every 6 hours
(`startStatsSummarySchedule()`, called once at server startup in
`server.js` via `setInterval` — the process is always-on on Render's
Starter plan, so no external cron is needed) to
`STATS_SUMMARY_WEBHOOK_URL` if set, else falling back to the main
`DISCORD_WEBHOOK_URL`. Swap `STATS_SUMMARY_WEBHOOK_URL` in Render's
Environment tab to point it elsewhere later without a code change.

Each post covers activity **since the last summary** (tracked in the
`stats_summary_state` table, a single row) — not all-time totals:

- **Slot Submissions** — count of `slot_submissions` rows. The Google
  Apps Script (`scripts/slot-form-discord-notify.gs`) pings
  `POST /api/slot-submission-ping` (header `x-admin-secret`) right after
  it posts to Discord, purely to log a count here — replace
  `PASTE_ADMIN_SECRET_HERE` in the script with the real `ADMIN_SECRET`
  value (Apps Script code is server-side/private, never exposed to form
  respondents, same trust level as the webhook URL already in that file).
- **Inquiries** — count of new rows in `interests` (release preorder
  registrations).
- **Marketplace Sales** — count of new rows in `listing_interests`
  (buyer interest registrations on marketplace listings — the fee-paying
  facilitation event, not necessarily a seller-confirmed "Sold" mark).
- **Google Analytics — Daily Users** — GA4 `activeUsers` for today so far,
  via `ga4.js`, which implements the GA4 Data API's OAuth2 service-account
  flow by hand (RS256-signs a JWT with Node's built-in `crypto`, no
  `googleapis`/`google-auth-library` dependency). Requires two env vars:
  - `GA4_PROPERTY_ID` — the numeric GA4 property ID (Admin → Property
    Settings in Google Analytics — **not** the `G-XXXX` measurement ID
    used elsewhere in this project).
  - `GA4_SERVICE_ACCOUNT_KEY` — the full JSON key contents (as one string)
    for a Google Cloud service account that's been added as a **Viewer**
    on that GA4 property (Admin → Property Access Management → add the
    service account's `client_email`). Requires the Google Analytics Data
    API enabled on that service account's GCP project.

  Until both are set, the summary just shows "Not configured yet" for
  this field — everything else still works.

Manually trigger a run early for testing without disturbing the 6-hour
schedule: `POST /api/admin/stats-summary/run` (header `x-admin-secret`) —
returns the same counts that were just posted to Discord.

## Deploying (Render)

`render.yaml` defines the service as a Render Blueprint: a web service on
the Starter plan (needed for persistent disk support — the free tier
doesn't allow disks) with a 1GB disk mounted at `/var/data`.

1. Push this repo to GitHub.
2. In the Render dashboard: New → Blueprint → connect the repo. Render
   reads `render.yaml` and provisions the service + disk.
3. When prompted, set `DISCORD_WEBHOOK_URL` (this is the one value
   `render.yaml` intentionally leaves blank — it's a secret).
4. Once deployed, Settings → Custom Domains → add your domain. Render
   shows you the DNS record(s) to create at your registrar.

`DATA_DIR` (set to `/var/data` in `render.yaml`) tells `db.js` where to
put `preorders.db` — pointing it at the mounted disk instead of the
app's own directory means registrations survive redeploys. Locally,
`DATA_DIR` is unset and it just uses `./data` as before.

## GEO (Generative Engine Optimization)

`public/index.html` is set up so AI answer engines (ChatGPT, Perplexity,
Google AI Overviews, etc.) can find and cite accurate, specific answers
about the site, following practices from a referenced best-practices
article:

- A visible **FAQ section** (`<details>`/`<summary>`, short Q&A pairs,
  each answer front-loaded with plain-language terms like "fee,"
  "sold out," "affiliated") plus a matching **`FAQPage` JSON-LD** block —
  the JSON-LD text is byte-for-byte identical to the visible copy (verified
  by stripping HTML tags and diffing), which matters because mismatched
  schema risks a manual action from Google.
- A **`HowTo` JSON-LD** block for "How to Register Interest in a Topps
  Preorder."
- An **`Organization` JSON-LD** block for clear entity identity.
- A **citation-transparency line** in the footer linking to a real,
  verifiable source (Beckett) rather than just naming it as plain text.
- Meta `description` and Open Graph tags (title/description/type/url) —
  didn't exist before, foundational for both traditional SEO and GEO.
- **`public/llms.txt`** — a plain-language site summary + page index for
  AI crawlers, following the informal llms.txt convention (served as
  plain text automatically by `express.static`, no route needed).

**Deliberately NOT done**: exact current fee numbers (2.5%/2.5% +
scaling shipping fee) are not restated in the FAQ/JSON-LD — it links to
`/terms.html` instead, since fees have changed three times already in
this project's history and duplicating exact numbers in two places is a
staleness risk. If fees stabilize, consider inlining them for more
directly quotable answers.

**Ongoing practices this doesn't automate** (from the same article,
these are manual/process steps, not code):
- Periodically ask AI engines (ChatGPT, Gemini, Perplexity, Copilot)
  questions a prospective user would ask, and check whether/how
  preordercards.com is cited.
- After significant content changes, use Google Search Console's
  "Request Indexing" to speed up recrawl.
- Route any AI-drafted public-facing copy through a human review pass
  before publishing — especially anything touching fees, authenticity,
  or legitimacy claims — before extending this FAQ further.

If you want the same FAQ/schema treatment added to `marketplace.html`
or `seller.html`, it wasn't done here (scoped to the homepage only) —
ask and it can follow the same pattern.
