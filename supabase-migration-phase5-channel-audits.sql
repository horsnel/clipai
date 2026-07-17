-- ============================================================================
-- ClipAI v2 — Phase 5 Migration: Channel Audits (production-ready persistence)
-- ============================================================================
-- Run this in Supabase SQL Editor (Dashboard → SQL → New Query).
-- Safe to re-run (idempotent — uses CREATE IF NOT EXISTS / OR REPLACE).
--
-- WHAT THIS DOES:
--   1. Creates a dedicated `channel_audits` table so audits are persisted
--      as first-class rows (not stuffed into settings.prefs jsonb). The
--      old jsonb-based audits list in `settings.prefs.audits` still works
--      as a fallback — the worker code tries the table first, then jsonb.
--   2. Adds an `audits_used` counter to profiles so we can enforce a daily
--      free-tier audit quota without scanning the audits table each time.
--   3. Adds an `audit_quota_reset_at` timestamp so the quota resets daily
--      (UTC midnight) automatically.
--   4. Backfills the new columns for existing users.
--
-- WHY:
--   - The current implementation stores audits in `settings.prefs.audits`
--     (a jsonb blob). This works but limits querying — you can't easily
--     "find all audits of platform=tiktok" or "count audits today" without
--     a full table scan + JSON parse. A dedicated table fixes that.
--   - The free-tier quota (currently enforced in the worker as a hard-coded
--     count of 8 max saved channels per user) needs to also have a daily
--     refresh audit quota so users can't spam the audit endpoint to drain
--     our scraper credit budget. We add `audits_used_today` + `audit_quota_reset_at`
--     to enforce that without an extra round-trip on each audit.
-- ============================================================================

-- ─── 1. New table: channel_audits ────────────────────────────────────────────
-- Replaces the jsonb-based settings.prefs.audits list as the source of truth.
-- One row per (user_id, canonical_url) pair — unique constraint enforces the
-- max-8-per-user limit at the DB level (via trigger).
create table if not exists public.channel_audits (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- The canonical URL the audit was run against (e.g. https://youtube.com/@MrBeast)
  url             text not null,
  -- The platform detected/normalised by the worker (youtube/tiktok/instagram/twitter/reddit)
  platform        text not null check (platform in ('youtube','tiktok','instagram','twitter','reddit')),
  -- Lightweight metadata mirrored from the cached audit payload so the
  -- dashboard can render audit cards WITHOUT reading the cache.
  channel_name    text,
  channel_handle  text,
  avatar_url      text,
  -- The scraper that served this audit (sociavault/scrapecreators/socialdata/youtube/reddit_oauth/etc.)
  source          text,
  -- When the audit was first saved
  created_at      timestamptz not null default now(),
  -- When the audit was last refreshed (re-run)
  last_refreshed_at timestamptz not null default now(),
  -- Unique constraint: one audit per (user, URL) pair
  constraint channel_audits_user_url_unique unique (user_id, url)
);

-- Indexes for common queries:
--   1. List a user's audits ordered by most-recent (dashboard grid)
--   2. Find audits per platform (operator analytics)
--   3. Count audits per user (quota enforcement)
create index if not exists idx_channel_audits_user_created
  on public.channel_audits(user_id, created_at desc);
create index if not exists idx_channel_audits_platform
  on public.channel_audits(platform);
create index if not exists idx_channel_audits_last_refreshed
  on public.channel_audits(last_refreshed_at desc);

-- ─── 2. Enforce the 8-channels-per-user limit at the DB level ────────────────
-- If an INSERT would push a user past 8 audits, reject it. The worker code
-- also enforces this, but having it at the DB level protects against bugs.
create or replace function public.enforce_audit_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  select count(*) into current_count
  from public.channel_audits
  where user_id = new.user_id;
  if current_count >= 8 then
    raise exception 'User % has reached the 8-channel audit limit. Remove an existing audit first.', new.user_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_audit_quota on public.channel_audits;
create trigger trg_enforce_audit_quota
  before insert on public.channel_audits
  for each row execute function public.enforce_audit_quota();

-- ─── 3. Update last_refreshed_at automatically on UPDATE ────────────────────
create or replace function public.touch_audit_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.last_refreshed_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_audit_refresh on public.channel_audits;
create trigger trg_touch_audit_refresh
  before update on public.channel_audits
  for each row execute function public.touch_audit_refresh();

-- ─── 4. Add audit quota columns to profiles ──────────────────────────────────
-- `audits_used_today` counts audits re-run today (refresh audits don't count
-- against the user's credit balance, but we still cap them per day so a single
-- user can't drain the scraper budget). Resets daily.
-- `audit_quota_reset_at` is the timestamp when `audits_used_today` was last
-- reset. The worker checks if this is older than 24h and resets it.
alter table public.profiles
  add column if not exists audits_used_today integer not null default 0,
  add column if not exists audit_quota_reset_at timestamptz not null default now();

-- Index for the daily-quota check (worker queries WHERE id = ? AND audit_quota_reset_at < now() - interval '24 hours')
create index if not exists idx_profiles_audit_quota_reset
  on public.profiles(audit_quota_reset_at);

-- ─── 5. RLS for channel_audits ───────────────────────────────────────────────
-- The worker uses the service key for all writes (bypasses RLS). These
-- policies only apply if a user queries directly from the frontend with their
-- own JWT — they can read their own audits but not write (writes go through
-- the worker, which validates + enforces quotas server-side).
alter table public.channel_audits enable row level security;

drop policy if exists "channel_audits_select_own" on public.channel_audits;
create policy channel_audits_select_own on public.channel_audits
  for select using (auth.uid() = user_id);

drop policy if exists "channel_audits_delete_own" on public.channel_audits;
create policy channel_audits_delete_own on public.channel_audits
  for delete using (auth.uid() = user_id);

-- No INSERT/UPDATE policies — all writes go through the service key via the
-- worker, which enforces quotas + dedup logic before persisting.

-- ─── 6. Backfill `audit_quota_reset_at` for existing users ───────────────────
-- (No-op for new users — they get the default `now()` on insert. This just
-- ensures existing users have a sane starting value so the first audit
-- doesn't immediately trigger a "quota exceeded" check.)
update public.profiles
  set audit_quota_reset_at = now()
  where audit_quota_reset_at is null;

-- ─── 7. View: audit counts per platform (operator analytics) ─────────────────
-- Used by the operator dashboard to see which platforms users audit most.
-- Read-only, no RLS (operator-only, accessed via service key).
create or replace view public.audit_platform_counts as
  select
    platform,
    count(*) as total_audits,
    count(distinct user_id) as unique_users,
    count(*) filter (where last_refreshed_at > now() - interval '24 hours') as audits_last_24h,
    count(*) filter (where last_refreshed_at > now() - interval '7 days') as audits_last_7d
  from public.channel_audits
  group by platform
  order by total_audits desc;

-- ─── Done. Verify with ──────────────────────────────────────────────────────
--   select * from public.audit_platform_counts;
--   select id, email, audits_used_today, audit_quota_reset_at
--   from public.profiles limit 5;
--   select user_id, url, platform, channel_name, last_refreshed_at
--   from public.channel_audits limit 10;
-- ============================================================================
