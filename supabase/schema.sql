-- QuickCare shared storage. Run this once in Supabase: SQL Editor, New query, paste, Run.
--
-- One small table holds everything the driver, officer and hospital screens must agree on
-- (the running trip, logins, postings, who is online). The server reads and writes it with the
-- project's secret key. The public (anon) key can read and write nothing.

create table if not exists public.kv (
  key         text primary key,
  value       jsonb       not null,
  version     bigint      not null default 1,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now()
);

create index if not exists kv_expires_at_idx on public.kv (expires_at);

-- Lock the table down. With row level security on and no policies, only the secret key
-- (which bypasses it) can touch these rows.
alter table public.kv enable row level security;
revoke all on public.kv from anon, authenticated;
