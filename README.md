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
- **Fee model**: `FEE_RATE = 0.03` in `marketplace.js`. Sellers see a live
  "you'll receive $X per unit after the 3% fee" preview while typing a price
  (price × 0.97). Buyers pick a quantity (capped at the seller's stock, max
  10) and see a live "you'll pay $X total (incl. 3% fee)" preview
  (price × quantity × 1.03). Note this is **3% deducted from the seller and
  3% added for the buyer independently** (a 6% total spread) — different
  from the flat 1.5%+1.5%=3% combined fee described on the Terms page for
  release preorders. Reconcile that copy if the two are meant to match.
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
- **Admin key generation**: `POST /api/seller/admin/generate-keys` (header
  `x-admin-secret: <ADMIN_SECRET>`, body `{"count": N}`) mints new invite
  keys directly against the live database — no host shell access needed.

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
