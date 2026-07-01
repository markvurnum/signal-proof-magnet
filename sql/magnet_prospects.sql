-- Signal Proof — prospect token store (marketing TWIN Supabase only).
-- One row per prospect who gets a personalised /s/<token> link.
-- Run once in the twin project's SQL editor (Settings has the connection; this is
-- the marketing twin, NOT the live engine DB).

create table if not exists public.magnet_prospects (
  token           text primary key,
  first_name      text not null,
  sender_name     text,
  company         text not null,
  website         text,
  email           text,
  niche_client_id uuid,                       -- optional: per-prospect niche (v2); null = default niche
  created_at      timestamptz not null default now()
);

-- The server reads with the service_role key (bypasses RLS). Enable RLS with no
-- public policy so the anon key can never read the prospect list.
alter table public.magnet_prospects enable row level security;
