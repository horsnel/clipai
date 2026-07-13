-- ClipAI v2 — Supabase schema
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Or via: psql "$SUPABASE_DB_URL" -f schema.sql
--
-- All tables use RLS (Row Level Security). The worker uses the service role key
-- (which bypasses RLS) for all DB access, so policies are minimal — they just
-- allow users to read their own row in `profiles` if they want to query directly.

-- ─── profiles ────────────────────────────────────────────────────────────────
-- One row per user. ID matches the auth.users.id (UUID).
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               text not null unique,
  full_name           text,
  plan                text not null default 'free' check (plan in ('free','starter','pro','creator')),
  credits             integer not null default 50,
  clips_used          integer not null default 0,
  referral_code       text unique,
  referred_by         uuid references public.profiles(id),
  xp                  integer not null default 0,
  streak_days         integer not null default 0,
  last_active_date    date,
  avatar_url          text,
  notification_prefs  jsonb default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- ─── credit_transactions ─────────────────────────────────────────────────────
create table if not exists public.credit_transactions (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  delta         integer not null,
  reason        text not null,
  reference_id  text,
  created_at    timestamptz not null default now()
);
create index if not exists credit_transactions_user_id_idx on public.credit_transactions(user_id);
create index if not exists credit_transactions_created_at_idx on public.credit_transactions(created_at);

-- ─── xp_events ───────────────────────────────────────────────────────────────
create table if not exists public.xp_events (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  action        text not null,
  xp_delta      integer not null,
  reference_id  text,
  created_at    timestamptz not null default now()
);
create index if not exists xp_events_user_id_idx on public.xp_events(user_id);
create index if not exists xp_events_created_at_idx on public.xp_events(created_at);

-- ─── waitlist ────────────────────────────────────────────────────────────────
create table if not exists public.waitlist (
  id               bigserial primary key,
  email            text not null unique,
  user_id          uuid references public.profiles(id) on delete set null,
  game_interest    text,
  source           text,
  credits_awarded  boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists waitlist_email_idx on public.waitlist(email);

-- ─── clips ───────────────────────────────────────────────────────────────────
-- Used to track clip rendering jobs (currently locked behind waitlist).
create table if not exists public.clips (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  title         text,
  status        text not null default 'pending' check (status in ('pending','processing','ready','failed')),
  source_url    text,
  output_url    text,
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists clips_user_id_idx on public.clips(user_id);
create index if not exists clips_created_at_idx on public.clips(created_at);

-- ─── subscriptions ───────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  plan          text not null check (plan in ('starter','pro','creator')),
  paystack_ref  text,
  status        text not null default 'success' check (status in ('success','failed','cancelled')),
  amount_kobo   integer not null,
  interval      text not null default 'monthly' check (interval in ('monthly','yearly')),
  created_at    timestamptz not null default now()
);
create index if not exists subscriptions_user_id_idx on public.subscriptions(user_id);
create index if not exists subscriptions_paystack_ref_idx on public.subscriptions(paystack_ref);

-- ─── caption_votes ───────────────────────────────────────────────────────────
create table if not exists public.caption_votes (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  caption_text  text not null,
  vote          smallint not null check (vote in (-1, 1)),
  game          text,
  vibe          text,
  created_at    timestamptz not null default now()
);
create index if not exists caption_votes_user_id_idx on public.caption_votes(user_id);
create index if not exists caption_votes_caption_text_idx on public.caption_votes(caption_text);
create index if not exists caption_votes_created_at_idx on public.caption_votes(created_at);

-- ─── clipbot_history ─────────────────────────────────────────────────────────
create table if not exists public.clipbot_history (
  id            bigserial primary key,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          text not null check (role in ('user','assistant','system')),
  content       text not null,
  created_at    timestamptz not null default now()
);
create index if not exists clipbot_history_user_id_idx on public.clipbot_history(user_id);
create index if not exists clipbot_history_created_at_idx on public.clipbot_history(created_at);

-- ─── referrals ───────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id                          bigserial primary key,
  referrer_id                 uuid not null references public.profiles(id) on delete cascade,
  referred_id                 uuid not null references public.profiles(id) on delete cascade,
  credits_awarded_referrer    integer not null default 0,
  credits_awarded_referred    integer not null default 0,
  paid                        boolean not null default false,
  created_at                  timestamptz not null default now(),
  unique (referred_id)  -- a user can only be referred once
);
create index if not exists referrals_referrer_id_idx on public.referrals(referrer_id);
create index if not exists referrals_referred_id_idx on public.referrals(referred_id);

-- ─── settings ────────────────────────────────────────────────────────────────
-- Per-user app settings (notification prefs, default game, etc.)
create table if not exists public.settings (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  prefs         jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- ─── Leaderboard views ───────────────────────────────────────────────────────
-- All-time leaderboard: ranked by XP descending.
create or replace view public.leaderboard_alltime as
  select
    row_number() over (order by xp desc, created_at asc) as rank,
    id, email, full_name, xp, plan, avatar_url, streak_days
  from public.profiles
  where xp > 0
  order by rank asc;

-- Weekly leaderboard: ranked by XP earned in the last 7 days.
create or replace view public.leaderboard_weekly as
  select
    row_number() over (order by weekly_xp desc) as rank,
    p.id, p.email, p.full_name, p.avatar_url, p.plan,
    coalesce(sum(xe.xp_delta), 0) as weekly_xp
  from public.profiles p
  left join public.xp_events xe
    on xe.user_id = p.id
   and xe.created_at >= now() - interval '7 days'
  group by p.id, p.email, p.full_name, p.avatar_url, p.plan
  having coalesce(sum(xe.xp_delta), 0) > 0
  order by rank asc;

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- The worker uses the service role key for ALL operations, which bypasses RLS.
-- These policies only apply if a user queries Supabase directly from the
-- frontend with the anon key + their own JWT.
alter table public.profiles            enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.xp_events           enable row level security;
alter table public.waitlist            enable row level security;
alter table public.clips               enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.caption_votes       enable row level security;
alter table public.clipbot_history     enable row level security;
alter table public.referrals           enable row level security;
alter table public.settings            enable row level security;

-- Users can read their own profile
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Users can read their own credit transactions, xp events, clips, etc.
create policy "credit_tx_select_own" on public.credit_transactions
  for select using (auth.uid() = user_id);
create policy "xp_events_select_own" on public.xp_events
  for select using (auth.uid() = user_id);
create policy "clips_select_own" on public.clips
  for select using (auth.uid() = user_id);
create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
create policy "caption_votes_select_own" on public.caption_votes
  for select using (auth.uid() = user_id);
create policy "caption_votes_insert_own" on public.caption_votes
  for insert with check (auth.uid() = user_id);
create policy "clipbot_history_select_own" on public.clipbot_history
  for select using (auth.uid() = user_id);
create policy "clipbot_history_insert_own" on public.clipbot_history
  for insert with check (auth.uid() = user_id);
create policy "referrals_select_own" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
create policy "settings_select_own" on public.settings
  for select using (auth.uid() = user_id);
create policy "settings_update_own" on public.settings
  for update using (auth.uid() = user_id);

-- ─── Auto-create profile on auth signup ──────────────────────────────────────
-- When a new user signs up via Supabase Auth, automatically create their
-- profile row with default credits (50) and a unique referral code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  -- Generate a unique 8-char referral code from the user's UUID
  new_code := upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 8));
  insert into public.profiles (id, email, full_name, referral_code, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new_code,
    50  -- free plan starting credits
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Required extension for uuid_generate_v4()
create extension if not exists "pgcrypto";

-- Drop existing trigger if any, then create
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Done ────────────────────────────────────────────────────────────────────
-- Verify with:
--   select count(*) from information_schema.tables where table_schema='public';
-- Should return 10 (8 tables + 2 views).
