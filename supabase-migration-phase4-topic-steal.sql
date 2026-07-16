-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4 migration: parameterised Topic Steal aggregation.
--
-- The existing `topic_steal_dashboard` view is hard-coded to 14 days. To
-- support 7d / 14d / 30d / 90d toggles in the UI, we add a Postgres function
-- `get_topic_steal(p_days int)` that performs the same aggregation but with
-- a dynamic window. Callable via PostgREST RPC.
--
-- Idempotent: uses `create or replace function`.
-- Safe: function runs as owner (postgres) and returns only aggregated,
-- anonymous rows — no user-identifying data leaks.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old `index_analysis_topics` function temporarily to avoid the
-- "cannot change return type of existing function" error if the signature
-- differs. (We re-create it afterwards with its original signature.)
-- NOTE: index_analysis_topics is unchanged here — we only add a NEW function.

create or replace function public.get_topic_steal(p_days int default 14)
returns table (
  topic        text,
  game         text,
  mention_count bigint,
  avg_heat     numeric,
  distinct_days bigint,
  last_seen    timestamptz,
  growth_multiplier numeric
)
language sql
security definer
set search_path = public
as $$
  with windowed as (
    select
      ts.topic,
      coalesce(ts.game, 'general') as game,
      ts.created_at,
      ts.heat
    from public.topic_signals ts
    where ts.created_at > now() - (p_days || ' days')::interval
  ),
  agg as (
    select
      topic,
      game,
      count(*)                                       as mention_count,
      round(avg(heat)::numeric, 2)                   as avg_heat,
      count(distinct date_trunc('day', created_at))  as distinct_days,
      max(created_at)                                as last_seen,
      -- Growth = recent half of window vs older half.
      -- For 14d: 0-7d vs 7-14d. For 30d: 0-15d vs 15-30d. For 90d: 0-45d vs 45-90d.
      case
        when count(*) filter (
          where created_at > now() - ((p_days / 2) || ' days')::interval
        ) = 0 then 0
        else
          count(*) filter (
            where created_at > now() - ((p_days / 2) || ' days')::interval
          )::float
          / nullif(count(*) filter (
            where created_at between
              now() - (p_days || ' days')::interval and
              now() - ((p_days / 2) || ' days')::interval
          ), 0)
      end as growth_multiplier
    from windowed
    group by topic, game
    having count(*) >= 1
  )
  select
    agg.topic,
    agg.game,
    agg.mention_count,
    agg.avg_heat,
    agg.distinct_days,
    agg.last_seen,
    agg.growth_multiplier
  from agg
  order by agg.mention_count desc, agg.avg_heat desc;
$$;

-- Grant execute to anon + authenticated so the worker (using service role)
-- and any anon callers can invoke via RPC.
grant execute on function public.get_topic_steal(int) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification (run manually if needed):
--   select * from public.get_topic_steal(7)  limit 5;
--   select * from public.get_topic_steal(30) limit 5;
--   select * from public.get_topic_steal(90) limit 5;
-- ─────────────────────────────────────────────────────────────────────────────
