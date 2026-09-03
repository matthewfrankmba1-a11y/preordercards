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

`data/releases.json` is a **manually curated** list — neither Topps nor
Panini publishes a public API for release dates. It was seeded on 2026-07-21 from
public release-date trackers (Beckett, Waxstat). Manufacturers change
dates frequently, so treat this file as a starting point:

- Edit `data/releases.json` directly to add, remove, or update releases.
- Each entry: `id` (unique slug), `title`, `manufacturer` (`Topps` or
  `Panini`), `sport`, `format`, `releaseDate` (`YYYY-MM-DD`),
  `description`, and optional `isPreorderOpenDate: true` if the date marks
  when preorders open rather than the ship date, `eql: true` for raffle-entry
  releases, and `dutchAuction: true` (see exclusions below).
- Run `node scripts/check-release-data.js` after editing by hand. It fails on
  duplicate ids, malformed dates, an unknown manufacturer, a missing
  description, and a `soldOut` flag on a future date — and lists which
  entries the exclusion rules are currently hiding.
- Update the top-level `lastUpdated` field when you refresh the data.
- Always confirm against the manufacturer's own calendar before relying on a
  date — third-party trackers lag and disagree with each other.

### Excluded categories

Two kinds of release are deliberately never shown. `lib/releases.js` owns
both rules, and `loadListableReleases()` applies them at a single point, so
an excluded entry is absent from the homepage, `GET /api/releases`, new
interest registrations, the weekly newsletter and the blog agent alike —
adding one to the data is harmless because nothing will surface it.

- **Women's sports** — matched on title and description against an explicit
  word-boundary list (`women's`, `WNBA`, `NWSL`, `W-League`, `AFLW`, `WSL`)
  rather than a loose substring, so it can't catch an unrelated product.
- **Dutch auctions** — not inferable from a title, since Topps runs "First
  Day Issue" Dutch auctions for products whose ordinary hobby release *is*
  listed, and Panini's calendar marks them with their own badge. Set
  `"dutchAuction": true` on the entry.

### Releases with no announced date

Panini lists a number of products as "coming soon" with no date at all. Those
carry `"dateTbd": true` and **no** `releaseDate`, rather than a guessed one:
they render under a "Date to be announced" group at the end of the calendar,
sorted alphabetically, and are never auto-marked sold out. They're absent
from the weekly newsletter and the blog agent too, since a release with no
date belongs to no week — give one a real `releaseDate` (and drop the flag)
and it joins the calendar and the next issue automatically.

An entry must have exactly one of the two: the check script fails on a
missing date with no flag, and on a date *with* the flag.

`loadReleases()` returns the unfiltered file and is used only where an id has
to resolve regardless: the admin panel showing existing registrations, and
the secured/not-secured emails that go with them. Someone who registered
before a release was excluded is still owed an answer.

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

## Drop reminder emails (batch)

Separate from the one-at-a-time confirmation email above: `POST
/api/admin/send-drop-reminder` (header `x-admin-secret`, body
`{"releaseId": "..."}`) batch-emails everyone who registered interest by
email for that release and hasn't already received this reminder —
confirms the inquiry, notes the release date is approaching, and lays
out the choice between Slots (cheaper, links to the Slot Details form)
and a traditional preorder (no action needed, allocation email later).

- Deliberately manual and per-release, not scheduled — same "you decide
  when it fires" preference as the confirmation-email button.
- Tracked via a separate `reminder_sent_at` column on `interests` (not
  the same one `email_sent_at` uses for the original confirmation), so
  re-running it for the same release only emails people who haven't
  gotten this specific reminder yet — safe to call more than once as new
  registrants come in.
- Rejects with `400` if the release is already sold out or past its
  release date, and `404` if the release ID doesn't exist.
- Phone-only registrants are skipped — there's no email to send to.

## admin@preordercards.com replies → Discord

`admin@preordercards.com` forwards for free (via ImprovMX, DNS records at
Namecheap) to a personal Gmail inbox — there's no separate mailbox or
login, replies just land in that Gmail account like any other email.

`scripts/gmail-admin-reply-discord-notify.gs` is a standalone Google
Apps Script (bound to that Gmail account, not to any Form/Sheet) that
checks for new unread mail every 5 minutes (`to:admin@preordercards.com
is:unread`) and posts a "📧 New reply" alert to its own dedicated Discord
webhook — From, Subject, and a truncated body preview — then marks the
message read so it isn't re-posted next run. If the Discord post fails,
the message is left unread so it's retried on the next pass. See the
setup steps in the script's header comment (script.google.com → New
Project → paste the file → add a time-driven trigger → authorize Gmail
access when prompted).

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
- **Required seller profile (gates listing creation)**: right after key
  signup, every account — regular seller or admin — lands on a "Complete
  Your Seller Profile" screen instead of the normal dashboard until they
  submit full name, phone number, and at least one of Venmo/CashApp/Zelle
  (`POST /api/seller/profile`). This is enforced server-side too, not just
  hidden in the UI — `POST /api/seller/listings` returns `403` if
  `req.seller.profileComplete` is false, so it can't be bypassed by
  calling the API directly. `GET /api/seller/me`, `/login`, and `/signup`
  all return a `profileComplete` boolean the frontend uses to decide
  which screen to show.
- **Account recovery without a key**: `POST /api/seller/recover-account`
  (body `{fullName, phone}`, matched via `findSellerByNamePhone` —
  case-insensitive name, normalized phone) is for sellers who've lost
  their invite key entirely, not just their password. Login needs the key
  itself, so a plain password reset wouldn't help — this emails **both**
  the account's invite key and a password-reset link to the alert email
  on file, sharing the same token/expiry infrastructure as
  `/forgot-password` via a common `issueAccountRecoveryEmail` /
  `issuePasswordResetEmail` split. Same no-email-on-file limitation as
  the password reset flow.
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
- **Seller details for the admin**: each card in "Admin: All Listings"
  has a collapsed "Seller Details" `<details>` block — click to reveal
  that listing's seller's full name, phone, alert email, and Venmo/
  CashApp/Zelle, so the admin can actually pay them after a sale.
  `getAllListingsAdmin` (`db.js`) joins these fields in directly —
  deliberately never selects `password_hash`, and this data is only ever
  returned by the already admin-gated `GET /api/seller/admin/listings`
  (`requireSellerAuth` + `requireAdmin`); no other route exposes it.

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

## Discount banner (5% off first order)

A dismissible banner at the top of the homepage (`#discount-banner` in
`index.html`, logic in `public/discount-banner.js`) offers 5% off a
first order in exchange for an email address. Not tied to any release —
just a lead list, stored in a new `discount_signups` table (email is
`UNIQUE`, so re-submitting the same address doesn't create a duplicate
row or re-notify Discord) and posted to its own dedicated
`DISCOUNT_SIGNUP_WEBHOOK_URL`.

- Once someone signs up (or dismisses via the × button), `localStorage`
  remembers that choice so the banner doesn't nag them again on later
  visits — no cookie/session needed since it's purely cosmetic state.
- `POST /api/discount-signup` validates the email, rate-limited the
  same way `/api/interest` is, and returns `alreadySignedUp: true`
  (still `200`, not an error) if that address already signed up.
- There's no automated way to actually *apply* the 5% discount — this
  site has no checkout/payment flow. The admin applies it manually when
  facilitating a sale for someone on this list, same as everything else
  here.
- Currently homepage-only; the markup/script/CSS could be dropped into
  `marketplace.html` or other pages the same way if wanted later.

## Weekly newsletter (Sunday vs. Monday A/B test)

Mails the blog agent's weekly roundup post to the collected signup list, so
the post the agent already writes reaches people's inboxes instead of just
sitting on the site. It exists to drive traffic back to the calendar, so
every release in it links straight to that release's card (`/#<release id>`,
the anchor added to `ReleaseCard`) with UTM parameters attached.

**One post, one email, two send days.** There's no separate "issue" record:
the week's issue *is* the post the agent published for that week, wrapped
around the week's release list pulled from `data/releases.json`. That's why
the agent runs Sunday 8am ET and the newsletter at 10am — the post has to
exist before the first email links to it. If the agent hasn't managed a post
by send time, a real send runs it first; if that fails too (no API key, model
error), the email still goes out as the release list plus evergreen copy,
pointing at `/blog.html`. A drafting problem costs the issue its prose, never
the send.

**The A/B test.** The list is split into two fixed cohorts and each gets the
identical email on a different day — Sunday or Monday, both at
`NEWSLETTER_SEND_HOUR` (10am ET). The split is a hash of the address
(`variantForEmail()` in `newsletter.js`), not a coin flip at send time, so an
address stays in the same arm week after week; re-randomizing every week
would make the comparison meaningless. `NEWSLETTER_AB_SALT` re-draws the
cohorts deliberately once a test has concluded.

`GET /api/admin/newsletter/report` (header `x-admin-secret`) is the
scoreboard: sends, opens, clicks and rates per cohort, per issue and pooled,
plus the current leader. **The leader is decided on click rate, not opens** —
Apple Mail Privacy Protection fetches the tracking pixel for its users
whether or not the message was read, so open rate is directional at best.
Clicks are also the thing being optimized for: traffic. The report reads only
from `newsletter_sends`, so editing or renaming a post later can't
retroactively change what was measured.

**Nothing sends until the week's dates are confirmed.** `data/releases.json`
is compiled by hand from third-party trackers (Beckett, Waxstat, and
friends), which lag the manufacturer and sometimes disagree with each other.
A wrong date on the site is a one-minute fix; a wrong date in an email is in
someone's inbox permanently. So every real send — scheduled or manual — is
gated on a row in `newsletter_date_checks` for that week, written when
someone opens the Newsletter tab in the marketplace admin panel, reads the
week's releases against the manufacturer's own calendar, and confirms.

Each release in that list has an **×** that strikes it out of this week's
issue. That's the fast path for a date that disagrees with the manufacturer:
one click drops it from the email, where correcting `data/releases.json`
properly means an edit, a commit and a redeploy. The release keeps showing on
the site — the email just doesn't mention it — and the exclusion is scoped to
that one week, so next week's issue gets a fresh review rather than
inheriting a decision whose reason may have expired. **↩** puts it back.

The confirmation is fingerprinted over exactly what ships — the *included*
releases, by id, date, format, EQL flag and preorder-open flag. Strike
something out or correct a date after confirming and the fingerprint stops
matching, which re-locks the send rather than letting the change ride out on
a stale approval; restore it and the approval applies again, because the set
matches what was approved. An excluded release changing doesn't re-lock
anything, since the email makes no claim about it. `preview` and `test` are
never gated — you can always look at an issue.

A blocked scheduled run posts a Discord alert (`NEWSLETTER_WEBHOOK_URL`,
falling back to `DISCORD_WEBHOOK_URL`) once per week/cohort, so a skipped
week is visible rather than silent. Skipping a week is the intended failure
direction: better a missed issue than a wrong one.

Note this gates the *email* only. The blog agent still publishes its post
from the same data — a wrong date there is correctable in place, which is
why it isn't held to the same bar.

**Who gets it.** Everyone who has given the site an email address:
`discount_signups` (the homepage banner and `/newsletter.html`) plus anyone
who registered interest in a release or a marketplace listing. The interest
form says so under the email field before the address is submitted, and the
registration confirmation email repeats it — a list this broad is only fair
if people are told at the point of collection, not after. Set
`NEWSLETTER_AUDIENCE=signups` to narrow it back to just the two dedicated
signup forms.

**Nobody gets a roundup the same week they signed up.** An address is only
eligible for issues whose week started after it was collected, so someone who
registers interest on a Saturday gets their confirmation email that day and
their first roundup the *following* Sunday — not one twelve hours later. The
cutoff is the issue's own week-of date, so it applies to every send including
backfilled ones. The report shows both numbers: `listSize` is who a send
right now would reach, `listSizeIncludingPending` counts addresses still
inside their first-week wait.

Suppression is checked on every send: unsubscribes, hard bounces, spam
complaints, and the existing `isLikelyTestContact()` filter. Bounces and
complaints arrive on the existing Resend webhook (`/api/webhooks/resend`) —
a complaint also auto-unsubscribes the address.

**Unsubscribe.** Every email carries a footer link and a
`List-Unsubscribe`/`List-Unsubscribe-Post` header pair (RFC 8058), so mailbox
providers render their own one-click control instead of people reaching for
the spam button. Links identify the recipient by their `newsletter_sends` row
id plus an HMAC (`NEWSLETTER_SECRET`, falling back to `ADMIN_SECRET`) — no
address ever rides in a URL, and one subscriber's link can't be edited into
someone else's unsubscribe. **Sending is refused outright when neither secret
is set**, since an email without a working unsubscribe link shouldn't go out
at all. The link lands on `/newsletter.html`, which doubles as the public
subscribe page and the issue archive.

**The schedule** (`startNewsletterSchedule()`, called at server startup) is a
5-minute wall-clock tick against `America/New_York`, same shape and same
reasoning as the stats summary below. It's **off unless
`NEWSLETTER_ENABLED=true`**, so a fresh deploy never starts mailing on its
own. Repeat ticks within the send hour are harmless: a recipient who already
has a row for the issue is skipped, so a run cut short by the
`NEWSLETTER_MAX_PER_RUN` ceiling or a crash resumes where it left off rather
than double-mailing anyone. A row left `failed` (a Resend rate limit or
timeout, as opposed to a bad mailbox) is the one case that gets retried.

Manual control is `POST /api/admin/newsletter/run` (header `x-admin-secret`),
with `week` (any date inside the target week) and `limit` as optional extras:

```bash
# Assemble this week's issue and see the rendered email. Sends nothing, and
# never publishes a post.
curl -X POST https://preordercards.com/api/admin/newsletter/run \
  -H "x-admin-secret: $ADMIN_SECRET" -H 'Content-Type: application/json' \
  -d '{"mode":"preview","variant":"sunday"}'

# Mail one address a copy (no send rows, no tracking).
curl -X POST .../api/admin/newsletter/run -H ... \
  -d '{"mode":"test","to":"you@example.com"}'

# The real send for one cohort — same code path the schedule runs.
curl -X POST .../api/admin/newsletter/run -H ... \
  -d '{"mode":"send","variant":"sunday"}'
```

Recommended rollout: preview → test send to yourself → one manual `send` to
each cohort → then flip `NEWSLETTER_ENABLED=true` and leave it alone.

Files: `lib/newsletter.js` (list, A/B split, issue assembly, schedule,
report), `lib/newsletterEmail.js` (HTML/text bodies — sections are the same
`{heading, paragraphs[]}` shape the post page renders, so email and web can't
drift), `app/newsletter.html` (subscribe page, archive, unsubscribe landing),
and the `newsletter_sends` / `newsletter_unsubscribes` tables.

## Release check (Saturdays 9am ET)

`releaseCheck.js` fetches the published release calendars, extracts what they
list, and diffs that against `data/releases.json`. **It never writes to the
data file.** The accuracy gate on the newsletter rests on a human having
checked the week's dates; a job that silently rewrote the calendar would
hollow that out. This tells you what to look at — you still decide.

It runs Saturday morning, before the blog agent writes Sunday 8am and the
newsletter goes out Sunday 10am, so there's time to act on the report. Off
unless `RELEASE_CHECK_ENABLED=true`.

Sources (override with `RELEASE_CHECK_SOURCES`): Panini's own coming-soon
page, the Topps release calendar, and the Blowout Forums calendar thread. The
manufacturers' pages come first deliberately — they're the authority the
site's accuracy rule points at. The forum is a hand-kept list, useful as a
cross-check and often earlier, but not the arbiter.

### Why the model reads the pages

Extraction is a model call against the page text, not CSS selectors. Neither
source promises a stable DOM, and a selector that silently stops matching
looks exactly like "no changes this week" — the worst failure a checker can
have, because it's indistinguishable from success. A model call with a strict
schema fails loudly instead, and a page that fetches but yields nothing is
reported as a problem rather than a clean bill of health.

### What it reports

- **Not on our calendar** — listed at the source, no match in our data.
- **Date differs** — including the useful case where we hold a release as
  `dateTbd` and the source has now published a date.
- **Couldn't tell which entry** — the source title matches two of ours
  equally well. Usually means our data has near-duplicates worth tidying.
- **Excluded by policy** — women's sports and Dutch auctions are dropped
  before diffing, so they never show up as "missing".

Matching is on significant words, with two hard guards: box format and year
must agree when both sides state them. Without those, "Bowman Chrome Baseball
Hobby Box" and "... Mega Box" score identically and the check happily reports
a date change against the wrong product.

Run it on demand with `POST /api/admin/release-check/run` (header
`x-admin-secret`):

- `{"notify": false}` — skip the Discord post while testing.
- `{"debug": true}` — fetch each source and return what actually came back
  (status, final URL after redirects, content type, raw and extracted
  lengths, and a sample of the HTML) without running extraction. This is the
  tool for "a source stopped working": a character count on its own can't
  tell a bot block from a client-rendered page from a redirect, and each
  needs a different fix. Debug needs no API key and spends no tokens.

### The publishers block automated fetching

Confirmed on the first production run, and this is the normal state rather
than a temporary fault:

| Source  | Response |
|---------|----------|
| Panini  | `403`, empty body |
| Topps   | `403`, empty body |
| Blowout | `200` whose body is an Imperva/Incapsula interstitial — a denial dressed as success |

None of that is a parsing problem, and none of it has a fix on our side that
isn't circumventing a WAF. Doing so risks the deploy's IP being banned
outright and is a decision about their terms, so it isn't done here.

**The working path is the paste box in the admin panel** (Newsletter tab →
Release check). Open a publisher's calendar in a browser, copy the list,
paste it in. It runs the same extraction, the same title matching and the
same policy exclusions as the scheduled fetch, and likewise writes nothing.
Takes under a minute a week.

The scheduled fetch is still there for when a source becomes reachable (or a
permitted feed replaces one via `RELEASE_CHECK_SOURCES`). When every source
refuses, the Discord report says so and points at the paste box, rather than
reading like a broken job.

### When a source breaks

These are publisher pages that owe us nothing, and all three failed
differently on the first production run. Expect to re-diagnose periodically:

- **A 403** means the publisher is refusing non-browser requests.
  `RELEASE_CHECK_USER_AGENT` can present a different string, but that is a
  decision about their terms and is deliberately left to the operator rather
  than hardcoded — it isn't set by default.
- **A 200 with very little text** means the page renders its content in the
  browser, so there is nothing in the HTML to read. The fix is a different
  URL (a JSON endpoint, a feed, a sitemap) rather than a better parser.
  `RELEASE_CHECK_SOURCES` swaps a source without a deploy.
- **A redirect** shows up as a `finalUrl` different from the one configured.

A courtesy note: this fetches each page once a week with an identifying
User-Agent. That's modest, but check the sources' terms if you widen it —
Beckett in particular restricts automated access.

## Stats summary (Discord, once daily at 9am ET)

`statsSummary.js` posts a "📊 Site Activity Summary" embed once a day at
9am America/New_York (`startStatsSummarySchedule()`, called once at
server startup in `server.js`) to `STATS_SUMMARY_WEBHOOK_URL` if set,
else falling back to the main `DISCORD_WEBHOOK_URL`. Swap
`STATS_SUMMARY_WEBHOOK_URL` in Render's Environment tab to point it
elsewhere later without a code change.

Was every 6 hours (4x/day) — changed to once daily because it was
generating too many alerts. Implemented as a 5-minute `setInterval`
tick that checks the wall-clock hour in `America/New_York` via
`Intl.DateTimeFormat` (DST-safe — verified against both summer/EDT and
winter/EST) rather than a fixed 24-hour timer, so it fires at a
consistent time of day instead of drifting with every server
restart/redeploy. A "ran today already" guard (comparing the stored
`last_run_at` date-in-ET against today's date-in-ET) keeps it from
firing more than once even though the tick checks every 5 minutes
throughout the entire 9am hour. If the process happens to be
mid-deploy for the whole 9am hour, that day's summary is simply
skipped — no catch-up mechanism, and not worth building one for a
once-daily digest.

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

Manually trigger a run early for testing without disturbing the daily
schedule: `POST /api/admin/stats-summary/run` (header `x-admin-secret`) —
returns the same counts that were just posted to Discord.

## Blog agent (weekly post + tweet, Sundays 8am ET)

`blogAgent.js` writes the weekly release-roundup post, publishes it to the
live site, and posts the link plus a ready-to-send tweet to Discord. You
send the tweet yourself — the agent never posts to X.

`startBlogAgentSchedule()` is called once at server startup in `server.js`
and uses the same 5-minute wall-clock tick as the stats summary, firing at
8am America/New_York on Sundays — early enough that the weekly
newsletter can mail the post the same morning (see above). Because the tick checks throughout the
whole 8am hour, a `last_run_at` guard in `blog_agent_state` blocks a second
run within 6 days — that way a restart or redeploy mid-hour can't publish
two posts for the same week. If the process is down for the entire 8am hour,
that week is skipped; there's no catch-up.

Manually trigger a run without disturbing the schedule:
`POST /api/admin/blog-agent/run` (header `x-admin-secret`). It runs the full
model call, so expect it to take a while to return; the response is the same
summary that was just posted to Discord.

### How posts are published

Unlike the two hand-written posts, which are committed `page.js` files under
`app/blog/<slug>/`, agent-written posts are rows in the `blog_posts` table
and are rendered at request time by `app/blog/[slug]/page.js`. This is what
lets the agent publish in seconds with no git push and no Render redeploy,
and it means no GitHub credentials ever need to live in production.

The two committed posts are unaffected — Next resolves a static route
segment before falling through to the dynamic `[slug]` one, so their URLs
keep working exactly as before. `/blog.html` merges both sources into one
chronological list, so a reader can't tell which is which. Both that page
and `[slug]` are `force-dynamic`: they read the database, which lives on
Render's persistent disk and isn't mounted during the build.

Post bodies are stored as JSON (`[{heading, paragraphs[]}]`), not HTML, and
the renderer maps them to real elements — so nothing the model writes can
inject markup. The JSON-LD block escapes `<` for the same reason (see the
comment in `app/blog/[slug]/page.js`).

### What the model gets, and what's checked afterwards

The post is written by `claude-opus-5` via the Anthropic API, using
structured outputs (`output_config.format`) so the response is guaranteed to
parse. The only release information in the prompt is the upcoming entries
from `data/releases.json` (next 14 days, sold-out ones excluded), each
labelled EQL raffle entry or standard checkout — so the model can describe
and order real drops but can't invent a product, date, or price.

Structured outputs guarantee the *shape* of the response but not string
lengths or array sizes, so `validatePost()` re-checks what the prompt asked
for before anything is stored: empty sections are dropped, whitespace is
collapsed, and a post with no usable body is rejected rather than published.
A `refusal` or `max_tokens` stop reason also aborts the run without
publishing.

### The tweet

The model returns typed pieces — a hook, 2–4 bullet lines, and hashtags —
rather than one free-text blob. `composeTweet()` assembles them into a fixed
shape, which is what keeps the tweet consistent week to week:

```
<hook>

• Mon 7/28 - Mint Marvel (EQL)
• Tue 7/29 - Tribute Baseball

https://preordercards.com/blog/<slug>
#ToppsCards #TheHobby
```

Length is enforced against X's 280-character limit, counting the link as 23
characters as X does regardless of its real length. If it overruns, trailing
bullets are dropped first, then hashtags — so you never get handed something
X would reject.

The Discord embed carries the post link, the tweet in a fenced block (one
click to copy, line breaks intact), and an "Open X with this tweet
pre-filled" link that opens the X composer with the text already in it.

### Environment

- `ANTHROPIC_API_KEY` — required; without it the agent no-ops and the rest
  of the site is unaffected. Roughly a cent or two per post.
- `BLOG_AGENT_WEBHOOK_URL` — Discord webhook for the "post published"
  alert. Falls back to `DISCORD_WEBHOOK_URL`.
- `SITE_URL` — public base URL used to build the link in the tweet.
  Defaults to `https://preordercards.com`.

## Shared modules (`utils.js`, `email.js`)

Consolidated out of server.js/sellerAuth.js/marketplace.js, which had each
independently copy-pasted the same logic:

- **`utils.js`**: `EMAIL_RE`, `normalizePhone()`, `SPORT_EMOJI` (also used
  by `bot.js`), `requireAdminSecret` middleware (the shared-secret check
  used by every `x-admin-secret`-gated route), and `createRateLimiter()` —
  a factory, not a singleton, so each call site still gets its own
  independent `Map`/bucket (server.js, sellerAuth.js, and marketplace.js
  each rate-limit their own routes separately, exactly as before — this
  only removes the duplicated *logic*, not the per-file *state*). Note
  `requireAdminSecret` is unrelated to marketplace.js's `requireAdmin`,
  which checks an authenticated seller session's `is_admin` flag instead —
  the two guard completely different things and were never merged.
- **`email.js`**: `sendEmail({to, subject, text, html, attachments})`
  wraps the Resend API call + error handling that used to be copy-pasted
  six times. Callers still decide their own "not configured"/failure
  messaging (some are admin-facing and can show detail, some are
  seller-facing and stay generic) — only the request/response plumbing
  moved, not each route's own wording.

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
