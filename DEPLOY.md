# Deploying QuickCare (Vercel + Supabase)

The app keeps its shared state (the running trip, officer and hospital logins, postings, who is
online) in one Supabase table. That is what lets the driver, officer and hospital screens agree
when they are served by different servers on Vercel.

## 1. Create the table (once)

In Supabase: **SQL Editor, New query**, paste the contents of `supabase/schema.sql`, **Run**.

The table is locked down: the public key can read and write nothing. Only the server's secret key can.

## 2. Get the keys

In Supabase: **Project Settings, API Keys**.

- `SUPABASE_URL` is the project URL (for example `https://xxxx.supabase.co`).
- `SUPABASE_SECRET_KEY` is the **secret** key (starts with `sb_secret_`), or the legacy `service_role` key.

The secret key is for the server only. Never put it in a variable whose name starts with
`NEXT_PUBLIC_`, never commit it, and never paste it into a chat or a screenshot.

## 3. Local check

Put both values in `.env.local`, restart `npm run dev`, and use the app. Trips and logins now
survive a restart of the dev server, because they are saved in Supabase.

## 4. Vercel

Project, **Settings, Environment Variables**. Add, for Production (and Preview if you use it):

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the project URL |
| `SUPABASE_SECRET_KEY` | the secret key |
| `OPENROUTER_API_KEY` | your key (optional; without it the hospital shows the crew's note as written) |

Do **not** set `NEXT_PUBLIC_TEST_MODE` on a real site. It pre-fills logins and shows sample
accounts. Set it to `on` only if you want those test helpers on your live link, knowing anyone
who opens it can see them.

Redeploy after changing variables.

## 5. Speed

Supabase and the Vercel functions should be near each other and near your users.

- Vercel: **Settings, Functions, Function Region**. For a Sydney database, Singapore is the closest.
- A Supabase project's region cannot be changed. For users in Bengaluru, a project in **Mumbai
  (ap-south-1)** is faster. If you keep Sydney, expect a few tenths of a second extra on each refresh.

## What is still sample data

The officer, hospital and badge rosters (`data/officers.json`, `data/hospital-staff.json`) are
samples, and their PINs are in the code. A real launch needs real verification against police and
hospital records and real credentials.
