# Kanakku

The "Bad Cop" trip finance manager: a shared ledger for group trips, with a
read-only link for friends and a banker (admin) dashboard that can log
expenses, record deposits/settlements, and nudge the group over WhatsApp.

Built from [`kanakku-design/`](../kanakku-design/DESIGN_HANDOFF.md) (the
visual/behavioural spec) and
[`Claude Engineering Specification.md`](../Claude%20Engineering%20Specification.md)
(the backend spec). See those two files for the full design intent — this
README only covers running the app.

## Stack

- Next.js (App Router) behind a **custom `server.js`** — a single persistent
  Node process, required because it also owns a long-lived
  [Baileys](https://github.com/WhiskeySockets/Baileys) WhatsApp socket that
  a normal serverless deploy can't keep alive between requests.
- Supabase Postgres for all data, including the WhatsApp session itself
  (`lib/server/supabaseAuthState.js`), so the bot survives container
  restarts on Railway.
- Tailwind v4 for styling, using the design tokens from the handoff.

## 1. Supabase setup

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Use the **Trip setup** sheet in the banker view (gear icon, top right) to
   add your trip name, members, and deposits.
4. Copy the project URL, anon key, and **service role** key into `.env`
   (see `.env.example`).

## 2. Environment variables

```bash
cp .env.example .env
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, and pick an `ADMIN_SECRET`. The WhatsApp-related
variables (`ADMIN_WHATSAPP_NUMBER`, `WHATSAPP_GROUP_JID`, `CRON_SECRET`) can
be filled in later — the app runs fine without them, the Bad Cop tab will
just show WhatsApp as offline until you link it.

## 3. Run locally

```bash
npm install
npm run dev
```

This starts `server.js`, which boots Next.js **and** the WhatsApp bot in dev
mode. Set `DISABLE_WHATSAPP_BOT=1` if you just want to work on the UI
without a WhatsApp session attached.

- Friend view: `http://localhost:3000/`
- Banker view: `http://localhost:3000/?admin=YOUR_ADMIN_SECRET` once, which
  sets an httpOnly cookie and redirects to the clean `/` URL. Switch back to
  the friend view any time from Trip setup → "View as friend".

## 4. Link WhatsApp

Open the banker view → tap the bot status pill in the header → **Pairing
code** tab (default, since the banker can't scan a QR on their own screen)
or **QR code** tab (scan from a laptop). Once linked, the session persists
in the `baileys_auth` table, so this is a one-time step per deployment.

Find your WhatsApp group's JID by linking first, then checking the server
logs for incoming messages / `sock.groupFetchAllParticipating()`, or set it
later from Trip setup. The Bad Cop tab is disabled until both the bot is
connected and a group JID is set.

## 5. Deploy to Railway

This repo is set up for a single Railway service (`railway.json`):

- Build: `npm run build` (Nixpacks auto-detects this from `package.json`)
- Start: `node server.js`

Set the same environment variables from `.env` in the Railway service
settings. Because the WhatsApp socket lives inside the one running process,
**do not** scale this service beyond a single instance — a second replica
would fight over the same Baileys session.

To trigger `POST /api/bad-cop` on a schedule (e.g. a daily reminder) instead
of only from the dashboard button, add a Railway cron job that calls it with
an `X-Cron-Secret: $CRON_SECRET` header.

## Notes / deliberate simplifications

- There's no per-expense settlement state. Settling up a personal balance is
  just a deposit (the same record type as pool funding) — the app tracks
  what each person owes as a running total, not which specific expense a
  payment covers.
- Trip members and the deposit/UPI/WhatsApp-group settings aren't part of
  the original design mockups (they assume a pre-seeded trip). A minimal
  **Trip setup** sheet was added to the banker view so the app is usable for
  a new trip without hand-editing SQL.
