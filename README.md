# Topps Release Tracker

A small full-stack app that lists upcoming Topps trading card releases,
grouped by date, with a "Notify Me" form so visitors can preorder-signup
with their email or phone number.

## Stack

- Node.js + Express (server, API)
- better-sqlite3 (stores preorder signups locally in `data/preorders.db`)
- Vanilla HTML/CSS/JS frontend (no build step)

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

## Preorder signups

`POST /api/preorder` accepts `{ releaseId, contactType: "email"|"phone", contactValue }`.
Signups are validated and stored in a local SQLite database
(`data/preorders.db`, gitignored — it contains personal contact info and
should never be committed). Duplicate signups for the same release/contact
are treated as a no-op. A simple in-memory rate limiter caps signups per IP.

This app does not send any notifications yet — it only captures signups.
Wiring up actual email/SMS delivery (e.g. via an email provider or Twilio)
would be the next step before using this in production.
