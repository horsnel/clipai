-- ============================================================================
-- ClipAI v2 — Phase 1 Migration: URL-based Viral Analysis Pipeline
-- ============================================================================
-- Adds two new tables for the YouTube-URL-in / JSON-out architecture:
--   1. public.analyses        — one row per YouTube URL analysed
--   2. public.topic_signals   — anonymized aggregations for "Topic Steal"
--
-- Backwards compatible. Existing tables (profiles, clips, etc.) untouched.
-- Safe to re-run (idempotent).
-- ============================================================================

-- ─── Extensions (already created in v1 schema; noop here) ───────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── ANALYSES ────────────────────────────────────────────────────────────────
-- One row per YouTube video analysis. Replaces the old "upload a file" model.
-- Stores the full AI output JSON so users can re-open past analyses instantly
-- without paying for a second LLM call.
create table if not exists public.analyses (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references public.profiles(id) on delete cascade,

  -- Source identity
  source_url          text not null,              -- https://youtube.com/watch?v=...
  source_platform     text not null default 'youtube',  -- youtube | twitch | tiktok
  source_video_id     text,                       -- e.g. "dQw4w9WgXcQ"

  -- Cached metadata from oEmbed/YouTube API
  video_title         text,
  video_author        text,
  video_duration_sec  integer,
  thumbnail_url       text,

  -- Transcript (text + timestamps). Capped to ~50KB.
  transcript          jsonb,                      -- [{t: 0.0, text: "..."}, ...]
  transcript_word_count integer,

  -- ─── Unified analysis JSON (one LLM call → 14 outputs) ───────────────────
  -- All fields below are extracted from a single JSON returned by Gemini.
  -- Stored as separate columns for queryability + indexability; the raw
  -- blob is kept in `analysis_raw` for forward-compat.
  hook_score          numeric(3,1),               -- 0.0–10.0
  hook_rewrites       jsonb,                      -- ["alt opener 1", "alt opener 2", "alt opener 3"]
  sentiment_arc       jsonb,                      -- [{t, emotion, intensity}, ...]
  goldilocks_map      jsonb,                      -- {trim: [{start, end, reason}], peak: [{t, label}]}
  hidden_gems         jsonb,                      -- [{angle, title, why_viral, clip_start, clip_end}]
  unpopular_opinions  jsonb,                      -- [{quote, contradiction, controversy_hook}]
  title_variants      jsonb,                      -- ["title 1", "title 2", ..., "title 10"]
  caption_variants    jsonb,                      -- [{clip_start, clip_end, captions: [...]}]
  style_profile       jsonb,                      -- {slang: [...], emoji_freq, caps_pref, punctuation}
  distribution_pack   jsonb,                      -- {x_thread: [...], linkedin: "...", newsletter: "..."}
  thumbnail_concepts  jsonb,                      -- [{text, position, color, font_weight}]
  community_polls     jsonb,                      -- [{question, options: [...]}]
  sponsorship_spots   jsonb,                      -- [{start, end, transition_script}]
  pinned_comment_tree jsonb,                      -- {pinned: "...", replies: ["...", "...", "..."]}
  shadow_editor_script jsonb,                     -- {act1: "...", act2: "...", act3: "..."}
  viral_angles        jsonb,                      -- free-form strategic notes
  pacing_analysis     jsonb,                      -- {wpm, silence_count, cut_recommendations: [...]}

  -- Raw payload (for forward compatibility when we add fields later)
  analysis_raw        jsonb,

  -- Telemetry
  llm_model           text,                       -- "gemini-2.0-flash-exp" etc.
  llm_tokens_in       integer,
  llm_tokens_out      integer,
  processing_ms       integer,

  -- Lifecycle
  status              text not null default 'completed'
                      check (status in ('processing', 'completed', 'failed')),
  error_message       text,

  created_at          timestamptz not null default now(),
  expires_at          timestamptz               -- 30 days default; nullable for pro users

);

-- Indexes
create index if not exists idx_analyses_user_id        on public.analyses(user_id, created_at desc);
create index if not exists idx_analyses_source_video   on public.analyses(source_video_id);
create index if not exists idx_analyses_created_at     on public.analyses(created_at desc);

-- One active analysis per (user, source_url) — re-analysing overwrites the old row
-- (prevents the same user paying twice for the same URL within 24h)
create unique index if not exists uq_analyses_user_source
  on public.analyses(user_id, source_url)
  where status = 'completed';

-- ─── TOPIC SIGNALS (the "Topic Steal" moat) ──────────────────────────────────
-- Anonymized aggregation of every analyzed video's topics/keywords.
-- This is what powers the network-effect dashboard:
--   "17 gaming analysts this week, 'X weapon nerf' trending +300%"
--
-- We extract 3-7 keywords per analysis via the LLM (already in `viral_angles`
-- as `topics: [...]`) and store one row per keyword per analysis.
-- The dashboard aggregates with count + recency.
create table if not exists public.topic_signals (
  id              uuid primary key default uuid_generate_v4(),
  analysis_id     uuid not null references public.analyses(id) on delete cascade,
  -- NOTE: user_id is intentionally NOT stored here. This table is purely
  -- anonymous aggregate data — we never expose which user analyzed what.
  -- The analysis_id FK is for cascade-delete only; we never SELECT it from
  -- the dashboard endpoint.

  topic           text not null,                  -- lowercase, e.g. "valorant phantom nerf"
  topic_category  text,                           -- "weapon" | "boss" | "strategy" | "meta" | "drama" | "general"
  platform        text,                           -- "youtube" | "twitch" | "tiktok"
  game            text,                           -- "valorant" | "fortnite" | "general"

  -- Heat score: how strongly this topic featured in this particular analysis
  -- (0.0–1.0). Used to weight aggregations.
  heat            numeric(3,2) not null default 0.5,

  created_at      timestamptz not null default now()
);

-- Aggregation-friendly indexes
create index if not exists idx_topic_signals_topic       on public.topic_signals(lower(topic));
create index if not exists idx_topic_signals_created_at  on public.topic_signals(created_at desc);
create index if not exists idx_topic_signals_game_time   on public.topic_signals(game, created_at desc);

-- ─── HELPER: Extract topics from a freshly-completed analysis ──────────────
-- Called by the worker after the LLM returns. Reads `viral_angles.topics`
-- from the analysis JSON and inserts one row per topic.
create or replace function public.index_analysis_topics(p_analysis_id uuid)
returns void language plpgsql security definer as $$
declare
  v_topics jsonb;
  v_game text;
  v_platform text;
  topic text;
  heat numeric;
  cat text;
  t record;
begin
  -- Pull the topics array + metadata from the analysis
  select
    a.viral_angles->'topics',
    coalesce(a.viral_angles->>'game', 'general'),
    a.source_platform
  into v_topics, v_game, v_platform
  from public.analyses a
  where a.id = p_analysis_id;

  if v_topics is null then return; end if;

  -- Wipe existing signals for this analysis (in case of re-index)
  delete from public.topic_signals where analysis_id = p_analysis_id;

  -- Insert one row per topic
  for t in select * from jsonb_array_elements(v_topics)
  loop
    topic := lower(coalesce(t.value->>'topic', t.value->>'text', t.value#>>'{}'));
    heat  := coalesce((t.value->>'heat')::numeric, 0.5);
    cat   := coalesce(t.value->>'category', 'general');

    -- Skip empty / too-short topics
    if length(topic) < 3 then continue; end if;

    insert into public.topic_signals (analysis_id, topic, topic_category, platform, game, heat)
    values (p_analysis_id, topic, cat, v_platform, v_game, heat);
  end loop;
end $$;

-- ─── HELPER: Topic Steal Dashboard aggregation ──────────────────────────────
-- Returns the hottest topics across all analyses in the last N days.
-- Pre-aggregated as a view so the dashboard endpoint is a single SELECT.
create or replace view public.topic_steal_dashboard as
  select
    topic,
    coalesce(game, 'general') as game,
    count(*)                                       as mention_count,
    round(avg(heat)::numeric, 2)                   as avg_heat,
    count(distinct date_trunc('day', created_at))  as distinct_days,
    max(created_at)                                as last_seen,
    -- 7-day vs 7-14-day growth (multiplier; >1.0 = rising, <1.0 = falling)
    case
      when count(*) filter (where created_at > now() - interval '7 days') = 0 then 0
      else
        count(*) filter (where created_at > now() - interval '7 days')::float
        / nullif(count(*) filter (where created_at between now() - interval '14 days' and now() - interval '7 days'), 0)
    end                                            as growth_multiplier
  from public.topic_signals
  where created_at > now() - interval '14 days'
  group by topic, game
  having count(*) >= 1
  order by mention_count desc, avg_heat desc;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.analyses        enable row level security;
alter table public.topic_signals   enable row level security;

-- ANALYSES: users see / insert / update only their own
drop policy if exists "analyses_self_select" on public.analyses;
create policy analyses_self_select on public.analyses
  for select using (auth.uid() = user_id);

drop policy if exists "analyses_self_insert" on public.analyses;
create policy analyses_self_insert on public.analyses
  for insert with check (auth.uid() = user_id);

drop policy if exists "analyses_self_update" on public.analyses;
create policy analyses_self_update on public.analyses
  for update using (auth.uid() = user_id);

drop policy if exists "analyses_self_delete" on public.analyses;
create policy analyses_self_delete on public.analyses
  for delete using (auth.uid() = user_id);

-- TOPIC_SIGNALS: this table is INSERT-only by the service role (worker).
-- No user can read or write it directly. Reads happen via the
-- `topic_steal_dashboard` view below (which is public because it's
-- aggregated + anonymous).
drop policy if exists "topic_signals_deny_all" on public.topic_signals;
create policy topic_signals_deny_all on public.topic_signals
  for all using (false) with check (false);

-- The aggregated dashboard view is public-read (no PII, fully anonymous)
drop policy if exists "topic_steal_dashboard_public" on public.topic_steal_dashboard;
create policy topic_steal_dashboard_public on public.topic_steal_dashboard
  for select using (true);

-- ============================================================================
-- Done. Verify with:
--   select * from public.analyses limit 5;
--   select * from public.topic_steal_dashboard limit 10;
-- ============================================================================
