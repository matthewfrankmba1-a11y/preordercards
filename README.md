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

Any release with a `releaseDate` in the past is automatically shown greyed
out with a "Sold Out" stamp and a disabled registration form — this is
computed from today's date at render/request time, not a flag you set
manually. The `POST /api/interest` endpoint also rejects registrations for
past releases server-side (HTTP 410), so this can't be bypassed by calling
the API directly.

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
release, sport, quantity, and contact info to that channel. The embed
title is prefixed with a sport-specific emoji (⚾🏀🏈🥊⚽🎬, `SPORT_EMOJI` in
`server.js`) — unrecognized sports fall back to 📦.

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
