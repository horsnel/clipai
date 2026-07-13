-- ============================================================================
-- ClipAI v2 — Supabase Schema
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query).
-- Safe to re-run (idempotent — uses CREATE IF NOT EXISTS / OR REPLACE).
-- ============================================================================

-- ─── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────
do $$ begin
  create type plan_tier as enum ('free', 'starter', 'pro', 'creator');
exception when duplicate_object then null; end $$;

do $$ begin
  create type clip_status as enum ('processing', 'ready', 'failed', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type xp_action_t as enum (
    'signup', 'analyse', 'render', 'caption', 'referral_signup',
    'referral_paid', 'daily_streak', 'clips_voted', 'chat_message'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'success', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

-- ─── PROFILES ───────────────────────────────────────────────────────────────
-- Extends auth.users. One row per user, created on first sign-up.
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text default 'Gamer',
  avatar_url      text,
  plan            plan_tier not null default 'free',
  credits         integer not null default 50,
  clips_used      integer not null default 0,
  xp              integer not null default 0,
  streak_days     integer not null default 0,
  last_active_date date,
  referral_code   text unique not null,
  referred_by     uuid references public.profiles(id) on delete set null,
  notification_prefs jsonb not null default '{
    "email_updates": true,
    "product_news": true,
    "clip_ready": true,
    "weekly_digest": false
  }'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── CLIPS ──────────────────────────────────────────────────────────────────
create table if not exists public.clips (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  title           text,
  game            text,
  source_video_key text,
  clip_url        text,
  thumbnail_url   text,
  start_seconds   double precision,
  end_seconds     double precision,
  duration_seconds integer,
  format          text,
  quality         text,
  hype_score      integer default 0,
  caption         text,
  status          clip_status not null default 'processing',
  render_job_id   text,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz,
  view_count      integer not null default 0
);
create index if not exists idx_clips_user_id on public.clips(user_id);
create index if not exists idx_clips_created_at on public.clips(created_at desc);
create index if not exists idx_clips_hype_score on public.clips(hype_score desc);

-- ─── CREDIT TRANSACTIONS (audit log) ────────────────────────────────────────
create table if not exists public.credit_transactions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  delta           integer not null,           -- +credit or -debit
  reason          text not null,
  reference_id    uuid,                       -- clip id / payment id / referral id
  created_at      timestamptz not null default now()
);
create index if not exists idx_credits_user_id on public.credit_transactions(user_id);

-- ─── XP EVENTS ──────────────────────────────────────────────────────────────
create table if not exists public.xp_events (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  action          xp_action_t not null,
  xp_delta        integer not null,
  reference_id    uuid,
  metadata        jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_xp_user_id on public.xp_events(user_id);
create index if not exists idx_xp_created_at on public.xp_events(created_at desc);

-- ─── REFERRALS ──────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id              uuid primary key default uuid_generate_v4(),
  referrer_id     uuid not null references public.profiles(id) on delete cascade,
  referred_id     uuid not null references public.profiles(id) on delete cascade,
  credits_awarded_referrer integer not null default 5,
  credits_awarded_referred integer not null default 0,
  paid            boolean not null default false,
  created_at      timestamptz not null default now(),
  unique(referred_id)         -- one referral per user
);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id);

-- ─── SUBSCRIPTIONS (Paystack) ───────────────────────────────────────────────
create table if not exists public.subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  plan            plan_tier not null,
  paystack_code   text,                       -- subscription code from Paystack
  paystack_ref    text,                       -- transaction reference
  status          payment_status not null default 'pending',
  amount_kobo     integer not null,
  interval        text,                       -- monthly / annual
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_subs_user_id on public.subscriptions(user_id);

-- ─── TOPUPS (one-time credit purchases) ─────────────────────────────────────
create table if not exists public.topup_purchases (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  paystack_ref    text unique not null,
  credits_purchased integer not null,
  amount_kobo     integer not null,
  status          payment_status not null default 'pending',
  created_at      timestamptz not null default now()
);

-- ─── CAPTION VOTES (ViralForge) ─────────────────────────────────────────────
create table if not exists public.caption_votes (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  caption_text    text not null,
  vote            smallint not null,          -- +1 upvote, -1 downvote
  game            text,
  vibe            text,
  created_at      timestamptz not null default now(),
  unique(user_id, caption_text)
);
create index if not exists idx_caption_votes_text on public.caption_votes(caption_text);

-- ─── CLIPBOT HISTORY ────────────────────────────────────────────────────────
create table if not exists public.clipbot_history (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null,              -- 'user' | 'assistant'
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_clipbot_user_id on public.clipbot_history(user_id, created_at desc);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate a unique 6-char referral code (e.g. "AB12CD")
create or replace function public.generate_referral_code()
returns text language plpgsql as $$
declare
  code text;
  exists_count integer;
begin
  loop
    code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    select count(*) into exists_count from public.profiles where referral_code = code;
    exit when exists_count = 0;
  end loop;
  return code;
end $$;

-- Award credits to a user (atomic, with audit log)
create or replace function public.award_credits(p_user_id uuid, p_delta int, p_reason text, p_ref uuid default null)
returns void language plpgsql as $$
begin
  update public.profiles set credits = credits + p_delta, updated_at = now() where id = p_user_id;
  insert into public.credit_transactions (user_id, delta, reason, reference_id)
  values (p_user_id, p_delta, p_reason, p_ref);
end $$;

-- Award XP to a user (atomic, with event log)
create or replace function public.award_xp(p_user_id uuid, p_action xp_action_t, p_delta int, p_ref uuid default null)
returns void language plpgsql as $$
begin
  update public.profiles set xp = xp + p_delta, updated_at = now() where id = p_user_id;
  insert into public.xp_events (user_id, action, xp_delta, reference_id)
  values (p_user_id, p_action, p_delta, p_ref);
end $$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-create profile + award signup bonus + apply referral when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  referrer_id uuid;
begin
  -- Create profile
  insert into public.profiles (id, email, full_name, referral_code, referred_by)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Gamer'),
    public.generate_referral_code(),
    null
  )
  on conflict (id) do nothing;

  -- Signup bonus
  perform public.award_credits(new.id, 50, 'signup_bonus', new.id);
  perform public.award_xp(new.id, 'signup', 100, new.id);

  -- Apply pending referral (look up by referral_code in user_metadata)
  begin
    select id into referrer_id from public.profiles
    where referral_code = upper(coalesce(new.raw_user_meta_data->>'referral_code', ''))
    limit 1;

    if referrer_id is not null and referrer_id <> new.id then
      update public.profiles set referred_by = referrer_id where id = new.id;
      insert into public.referrals (referrer_id, referred_id, credits_awarded_referrer)
      values (referrer_id, new.id, 5)
      on conflict (referred_id) do nothing;

      -- Award 5 credits to referrer when their referral signs up
      if not exists (select 1 from public.referrals where referred_id = new.id and paid = true) then
        perform public.award_credits(referrer_id, 5, 'referral_signup', new.id);
        perform public.award_xp(referrer_id, 'referral_signup', 100, new.id);
      end if;
    end if;
  exception when others then null;
  end;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- VIEWS — Leaderboards
-- ============================================================================
create or replace view public.leaderboard_alltime as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.plan,
    p.xp as hype_score,
    count(c.id) as clip_count,
    rank() over (order by p.xp desc) as rank
  from public.profiles p
  left join public.clips c on c.user_id = p.id
  group by p.id, p.full_name, p.avatar_url, p.plan, p.xp;

create or replace view public.leaderboard_weekly as
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.plan,
    coalesce(sum(x.xp_delta), 0) as weekly_xp,
    rank() over (order by coalesce(sum(x.xp_delta), 0) desc) as rank
  from public.profiles p
  left join public.xp_events x
    on x.user_id = p.id and x.created_at > now() - interval '7 days'
  group by p.id, p.full_name, p.avatar_url, p.plan;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles            enable row level security;
alter table public.clips               enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.xp_events           enable row level security;
alter table public.referrals           enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.topup_purchases     enable row level security;
alter table public.caption_votes       enable row level security;
alter table public.clipbot_history     enable row level security;

-- PROFILES: users can read own + see others (for leaderboard)
drop policy if exists "profiles_self_select" on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (auth.uid() = id);

-- CLIPS: users see only their own clips
drop policy if exists "clips_self_select" on public.clips;
create policy clips_self_select on public.clips
  for select using (auth.uid() = user_id);

drop policy if exists "clips_self_insert" on public.clips;
create policy clips_self_insert on public.clips
  for insert with check (auth.uid() = user_id);

drop policy if exists "clips_self_update" on public.clips;
create policy clips_self_update on public.clips
  for update using (auth.uid() = user_id);

-- CREDIT_TRANSACTIONS, XP_EVENTS, CLIPBOT_HISTORY: read own only
drop policy if exists "credits_self_select" on public.credit_transactions;
create policy credits_self_select on public.credit_transactions
  for select using (auth.uid() = user_id);

drop policy if exists "xp_self_select" on public.xp_events;
create policy xp_self_select on public.xp_events
  for select using (auth.uid() = user_id);

drop policy if exists "clipbot_self_select" on public.clipbot_history;
create policy clipbot_self_select on public.clipbot_history
  for select using (auth.uid() = user_id);

drop policy if exists "clipbot_self_insert" on public.clipbot_history;
create policy clipbot_self_insert on public.clipbot_history
  for insert with check (auth.uid() = user_id);

-- REFERRALS: read own (as referrer or referred)
drop policy if exists "referrals_self_select" on public.referrals;
create policy referrals_self_select on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- SUBSCRIPTIONS, TOPUPS: read own
drop policy if exists "subs_self_select" on public.subscriptions;
create policy subs_self_select on public.subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "topups_self_select" on public.topup_purchases;
create policy topups_self_select on public.topup_purchases
  for select using (auth.uid() = user_id);

-- CAPTION_VOTES: read all (for aggregation), insert own, no update/delete
drop policy if exists "caption_votes_select" on public.caption_votes;
create policy caption_votes_select on public.caption_votes
  for select using (true);

drop policy if exists "caption_votes_insert" on public.caption_votes;
create policy caption_votes_insert on public.caption_votes
  for insert with check (auth.uid() = user_id);

-- ============================================================================
-- Done. Verify with: select * from public.profiles limit 5;
-- ============================================================================
