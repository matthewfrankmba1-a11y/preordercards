# Topps Release Tracker

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

## Discord alerts

Copy `.env.example` to `.env` and set `DISCORD_WEBHOOK_URL` to a Discord
channel webhook URL (Channel Settings → Integrations → Webhooks → New
Webhook → Copy URL). Every successful registration posts an embed with the
release, quantity, and contact info to that channel.

- `.env` is gitignored — never commit it. Treat the webhook URL as a secret:
  anyone who has it can post messages into your Discord channel.
- The webhook call happens server-side only (never in frontend JS) and is
  fire-and-forget — if Discord is unreachable, the registration still
  succeeds and the error is just logged to the server console.
- If `DISCORD_WEBHOOK_URL` isn't set, this feature is silently skipped.

This app does not send anything to the person who registered yet (no
confirmation email/SMS) — it only alerts you. Wiring up outbound
email/SMS (e.g. via an email provider or Twilio) would be the next step
before using this in production.
