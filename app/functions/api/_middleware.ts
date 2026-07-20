/**
 * ClipAI Worker — Cloudflare Pages Function (Phase 1 port from Python/Flask)
 * ============================================================================
 * Mounted at /api/* on the same Cloudflare Pages domain. Video editor endpoints
 * (/upload, /analyse, /render, /captions) are SKIPPED — the editor is locked
 * behind a waitlist until December 2026.
 *
 * Endpoints (all under /api/):
 *   GET  /health
 *   GET  /auth/me                  (require_auth + daily streak logic)
 *   POST /waitlist/join
 *   GET  /clips                    (require_auth)
 *   GET  /leaderboard              (require_auth)
 *   GET  /rank/me                  (require_auth)
 *   GET  /referrals/stats          (require_auth)
 *   POST /referrals/apply          (require_auth)
 *   POST /payment/init             (require_auth)
 *   POST /payment/webhook          (HMAC-SHA512 verify)
 *   GET  /payment/verify           (require_auth)
 *   PATCH /settings/profile        (require_auth)
 *   PATCH /settings/notifications  (require_auth)
 *   POST /forge/vote               (require_auth)
 *   GET  /forge/top-captions
 *   POST /forge/titles             (require_auth + 2 credits)
 *   POST /forge/captions           (require_auth + 2 credits)
 *   POST /forge/hashtags           (require_auth + 2 credits)
 *   POST /forge/hooks              (require_auth + 2 credits)
 *   POST /clipbot                  (require_auth + 1 credit + daily limit)
 *   GET  /clipbot/history          (require_auth)
 *   GET  /trends                   (5-platform multi-source)
 *   POST /trends/assets            (require_auth + 1 credit)
 *   POST /intel/spy                (require_auth + plan=pro|creator + 5 credits)
 *   POST /intel/timing             (require_auth + 1 credit)
 *   POST /intel/abtitle            (require_auth + 1 credit)
 *   POST /analyse/youtube          (require_auth + 5 credits) — Phase 1 unified analysis
 *   GET  /analyses                 (require_auth) — list user's past analyses
 *   GET  /analyses/:id             (require_auth) — fetch one saved analysis
 *   GET  /topic-steal              (require_auth) — anonymized trending topics dashboard
 *   POST /analyse/compare          (require_auth + pro/creator + 10 credits) — Phase 2 Competitor Lab
 *   POST /playlist/sequence        (require_auth + pro/creator + 5 credits)  — Phase 3 Playlist Architect
 *   POST /analyse/audio-trend      (require_auth + 3 credits) — Phase 4 Audio Trend Sync
 *   POST /analyse/comments         (require_auth + 2 credits) — Phase 4 Predictive Comments Lite
 *   POST /analyse/shadow           (require_auth + 4 credits) — Phase 4 Shadow Editor (faceless script)
 *   POST /audit-channel            (require_auth + 1 credit after first free) — Phase 5 channel audit
 *   GET  /channel-audits           (require_auth) — list user's saved audits
 *   POST /audit-insights           (require_auth, free) — extensive AI review of a channel
 *   GET  /daily-insight            (require_auth, free) — daily AI brief synthesised from all tools
 */
import { Hono } from 'hono';
import { jwtVerify, decodeJwt } from 'jose';

// ─── Types ───────────────────────────────────────────────────────────────────
interface Env {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  // AI
  SILICONFLOW_API_KEY: string;
  GROQ_API_KEY: string;
  MISTRAL_API_KEY: string;
  LLM_MODEL: string;        // optional override — see pickLlm() for defaults per provider
  GEMINI_API_KEY: string;
  // Trends
  YOUTUBE_API_KEY: string;
  REDDIT_USER_AGENT: string;
  SERPER_API_KEY: string;   // serper.dev — powers TikTok/X site-search + Google Trends news layer
  // Channel audit — platform scrapers (all optional, all free-tier)
  // Primary chain: Sociavault → ScrapeCreators → SocialData → Serper (lite)
  SOCIAVAULT_API_KEY?: string;      // api.sociavault.com — TikTok + Instagram + Twitter (free: 50 credits/key)
  SOCIAVAULT_API_KEY_2?: string;    // backup Sociavault key (rotated when primary runs out)
  SOCIAVAULT_API_KEY_3?: string;    // backup Sociavault key (rotated when primary runs out)
  SCRAPECREATORS_API_KEY?: string;  // api.scrapecreators.com — TikTok + Instagram backup (free: 100 credits)
  SOCIALDATA_API_KEY?: string;      // api.socialdata.tools — X/Twitter primary (key format: "9846|xxx")
  SOCIALDATA_API_KEY_2?: string;    // backup SocialData key (the KHT2LXKT2mSi key currently 401s — kept for reference)
  SOCIALDATA_API_KEY_3?: string;    // 3rd SocialData key (9860|Z0t4fuql...) — rotated when primary 401s or rate-limits
  SOCIALDATA_API_KEY_4?: string;    // 4th SocialData key (9859|xZm6kpcB...) — last-resort rotation before Sociavault fallback
  REDDIT_CLIENT_ID?: string;        // Reddit OAuth app creds — bypass 403 rate limit on www.reddit.com (register at reddit.com/prefs/apps → "script" type)
  REDDIT_CLIENT_SECRET?: string;    // paired with REDDIT_CLIENT_ID. App-only OAuth → oauth.reddit.com (60 req/min)
  LAMATOK_API_KEY?: string;         // (deprecated) LamaTok RapidAPI — kept for backward compat
  KONBINI_API_KEY?: string;         // (deprecated) KonbiniAPI RapidAPI — kept for backward compat
  // Paystack
  PAYSTACK_SECRET_KEY: string;
  // Worker
  WORKER_SECRET: string;
  // Cache (Cloudflare KV namespace — optional but recommended)
  CACHE_KV?: KVNamespace;
  // Rate limiting (Cloudflare KV namespace — optional)
  RATELIMIT_KV?: KVNamespace;
  // Sentry DSN (optional)
  SENTRY_DSN?: string;
}

type Profile = {
  id: string;
  email: string;
  full_name?: string;
  plan: 'free' | 'starter' | 'pro' | 'creator';
  credits: number;
  clips_used: number;
  referral_code: string;
  xp: number;
  streak_days: number;
  last_active_date?: string;
  avatar_url?: string;
  notification_prefs?: Record<string, boolean>;
  // Phase 5 audit quota — counts audits re-run today, resets every 24h.
  // The worker checks + resets this before each audit (see checkAndIncrementDailyQuota).
  audits_used_today?: number;
  audit_quota_reset_at?: string;
  // Phase 5b — true once the user has used their one free lifetime audit.
  // First audit (cache miss) is free; subsequent audits cost 1 credit each.
  // Cached audits (re-audit same URL within TTL) are always free.
  free_audit_used?: boolean;
};

type Ctx = { Bindings: Env; Variables: { userId: string; profile: Profile } };

const app = new Hono<Ctx>().basePath('/api');

// ─── Config (mirrors config.py) ──────────────────────────────────────────────
const PLAN_FEATURES: Record<string, { credits_monthly: number; clipbot_daily_limit: number }> = {
  free:    { credits_monthly: 50,   clipbot_daily_limit: 10 },
  starter: { credits_monthly: 200,  clipbot_daily_limit: 25  },
  pro:     { credits_monthly: 1000, clipbot_daily_limit: 100 },
  creator: { credits_monthly: 3000, clipbot_daily_limit: -1  },
};

const XP_REWARDS = {
  signup: 100, analyse: 50, render: 20, caption: 10,
  referral_signup: 100, referral_paid: 200,
  daily_streak: 25, clips_voted: 5, chat_message: 1,
} as const;

const PLAN_AMOUNT_KOBO: Record<string, number> = {
  starter: 1000 * 100,
  pro: 2500 * 100,
  creator: 6000 * 100,
};

const RANK_TIERS = [
  { name: 'Rookie',         min_xp: 0,     color: '#9CA3AF' },
  { name: 'Clipper',        min_xp: 500,   color: '#3B82F6' },
  { name: 'Highlight Reel', min_xp: 2000,  color: '#8B5CF6' },
  { name: 'Legend',         min_xp: 5000,  color: '#FF9500' },
  { name: 'GOD TIER',       min_xp: 10000, color: '#EF4444' },
];

const GAME_SUBREDDITS: Record<string, string[]> = {
  valorant: ['valorant', 'valorantclips', 'valorantcompetitive'],
  apex: ['apexlegends', 'apexclips'],
  'apex legends': ['apexlegends', 'apexclips'],
  fortnite: ['fortnitebr', 'fortniteclips'],
  minecraft: ['minecraft', 'minecraftbuilds'],
  roblox: ['roblox', 'robloxgamedev'],
  'call of duty': ['modernwarfare', 'callofduty', 'warzone'],
  warzone: ['warzone', 'modernwarfare'],
  all: ['gaming', 'gamingsclips'],
};

const CLIPBOT_SYSTEM = `You are ClipBot, an expert AI gaming content coach built into ClipAI.
You help gaming content creators — especially Nigerian and African teenagers — grow their channels,
go viral, and create better content.

You know everything about:
- TikTok, YouTube Shorts, Instagram Reels algorithms
- What makes gaming clips go viral in Nigeria/Africa
- Titles, captions, hashtags, hooks that actually work
- Growth strategies for small channels
- Free Fire, Bloodstrike, PUBG, COD, Mobile Legends content trends
- Best posting times for Nigerian audiences (WAT timezone)

Tone: Friendly, hype, knowledgeable. Like a big brother who's a successful gaming creator.
Be direct. Use bullet points. Keep responses under 200 words unless a detailed plan is needed.
Don't be corporate. Say "bro" occasionally. Use gaming slang naturally.`;

// ─── Helpers: JSON responses ─────────────────────────────────────────────────
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// ─── CORS + Security headers + Rate limiting ────────────────────────────────
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '*';
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Paystack-Signature');
  // Security headers (CSP is loose because the SPA is on a different origin; tighten after custom domain)
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // HSTS — tell browsers to always use HTTPS for the next 2 years
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  if (c.req.method === 'OPTIONS') return new Response(null, { status: 204 });

  // Rate limit: 60 req/min per IP (skips webhooks + health to avoid breaking monitors)
  const path = new URL(c.req.url).pathname;
  const skipRl = path === '/api/health' || path === '/api/payment/webhook';
  if (!skipRl) {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const ok = await rateLimit(c.env, `ip:${ip}`, 60, 60);
    if (!ok) {
      return json({ error: 'Rate limit exceeded. Try again in a minute.', retry_after: 60 }, 429);
    }
  }
  await next();
});

// ─── Supabase REST helpers ───────────────────────────────────────────────────
async function sbFetch<T = any>(
  env: Env,
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return null;
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  try {
    const r = await fetch(url, { ...init, headers });
    if (!r.ok) {
      console.warn(`Supabase ${init.method || 'GET'} ${path} → ${r.status}: ${await r.text()}`);
      return null;
    }
    if (r.status === 204) return null;
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) return (await r.json()) as T;
    return null;
  } catch (e) {
    console.warn('Supabase fetch error:', e);
    return null;
  }
}

async function sbHead(env: Env, path: string): Promise<number> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return 0;
  const url = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;
  try {
    const r = await fetch(url, {
      method: 'HEAD',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        Prefer: 'count=exact',
      },
    });
    const cr = r.headers.get('content-range') || '*/0';
    const n = cr.split('/').pop();
    return n ? parseInt(n, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

async function fetchProfile(env: Env, userId: string): Promise<Profile | null> {
  const rows = await sbFetch<Profile[]>(env, `profiles?id=eq.${userId}&select=*`);
  return rows && rows.length > 0 ? rows[0] : null;
}

async function updateProfile(env: Env, userId: string, fields: Record<string, unknown>): Promise<boolean> {
  const r = await sbFetch(env, `profiles?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(fields),
  });
  return r !== null || true; // sbFetch returns null both on success-no-content and on failure
}

// ─── Settings prefs helpers (jsonb merge) ────────────────────────────────────
// The `settings` table has (user_id, prefs jsonb, updated_at). These helpers
// read the prefs object, merge a patch into it, and upsert back — so multiple
// features can stash state under their own key inside `prefs` without
// overwriting each other (e.g. `prefs.onboarding`, `prefs.audits`).
async function readSettingsPrefs(env: Env, userId: string): Promise<Record<string, any>> {
  const rows = await sbFetch<any[]>(env, `settings?user_id=eq.${userId}&select=prefs`);
  return (rows && rows.length > 0 && rows[0].prefs && typeof rows[0].prefs === 'object')
    ? rows[0].prefs
    : {};
}

async function writeSettingsPrefs(env: Env, userId: string, prefs: Record<string, any>): Promise<void> {
  // Upsert via Supabase REST — `resolution=merge-duplicates` makes POST behave
  // as upsert on the primary key (user_id).
  await sbFetch(env, 'settings', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: userId, prefs, updated_at: new Date().toISOString() }),
  });
}

async function mergeSettingsPrefs(env: Env, userId: string, patch: Record<string, any>): Promise<Record<string, any>> {
  const existing = await readSettingsPrefs(env, userId);
  const merged = { ...existing, ...patch };
  await writeSettingsPrefs(env, userId, merged);
  return merged;
}

// ─── channel_audits table adapter (Phase 5) ──────────────────────────────────
// The dedicated `channel_audits` table is the new source of truth for audit
// persistence. The legacy jsonb blob in `settings.prefs.audits` is kept in
// sync as a fallback (so the dashboard still works even if the table is
// somehow unavailable, and existing in-flight deployments don't lose data).
//
// Writes go to BOTH the table and the jsonb blob.
// Reads prefer the table, fall back to the jsonb blob.

// Free-tier daily audit quota — separate from the 8-channel SAVED limit (which
// is enforced by the DB trigger on channel_audits). This stops a user from
// spamming refresh on the same 8 channels to drain our scraper credit budget.
// The quota is per-user, per-24h-rolling-window (not calendar UTC day, to be
// forgiving of timezone fuzz).
const DAILY_AUDIT_QUOTA = 50;

// Maps the audit table row (snake_case) to the audit entry shape the dashboard
// expects (camelCase, with `avatar` instead of `avatar_url`).
function channelAuditRowToEntry(r: any): any {
  return {
    url: r.url,
    platform: r.platform,
    channelName: r.channel_name,
    channelHandle: r.channel_handle,
    avatar: r.avatar_url,
    source: r.source,
    auditedAt: r.last_refreshed_at || r.created_at,
  };
}

// Read the user's saved audits from the channel_audits table.
// Falls back to settings.prefs.audits (jsonb) if the table is unavailable.
async function listChannelAudits(env: Env, userId: string): Promise<any[]> {
  try {
    const rows = await sbFetch<any[]>(
      env,
      `channel_audits?user_id=eq.${encodeURIComponent(userId)}&order=last_refreshed_at.desc&select=*`,
    );
    if (rows !== null) {
      return rows.map(channelAuditRowToEntry);
    }
  } catch (e) {
    console.warn('listChannelAudits: table read failed, falling back to prefs.audits:', e);
  }
  // Fallback: read from settings.prefs.audits
  const prefs = await readSettingsPrefs(env, userId);
  return Array.isArray(prefs.audits) ? prefs.audits : [];
}

// Upsert an audit into the channel_audits table (dedupe via (user_id, url)
// unique constraint — the table uses `Prefer: resolution=merge-duplicates` so
// POST behaves as upsert on the constraint).
//
// Also mirrors the entry into settings.prefs.audits for backward compatibility.
//
// Returns { saved, count } where count is the user's total saved-audit count
// (used by the frontend to show "3 of 8 channels saved").
async function upsertChannelAudit(env: Env, userId: string, audit: any): Promise<{ saved: any; count: number }> {
  const auditEntry = {
    url: audit.url,
    platform: audit.platform,
    channelName: audit.channelName,
    channelHandle: audit.channelHandle,
    avatar: audit.avatar,
    auditedAt: audit.auditedAt,
  };

  // 1. Upsert into channel_audits table.
  let tableWriteOk = false;
  try {
    const body = {
      user_id: userId,
      url: audit.url,
      platform: audit.platform,
      channel_name: audit.channelName || null,
      channel_handle: audit.channelHandle || null,
      avatar_url: audit.avatar || null,
      source: audit.source || null,
      // last_refreshed_at is auto-touched by the BEFORE UPDATE trigger;
      // on INSERT it defaults to now().
    };
    await sbFetch(env, 'channel_audits', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(body),
    });
    // sbFetch returns null both on success (no content) and on failure (logged).
    // Verify by reading back.
    const verifyRows = await sbFetch<any[]>(
      env,
      `channel_audits?user_id=eq.${encodeURIComponent(userId)}&url=eq.${encodeURIComponent(audit.url)}&select=id`,
    );
    tableWriteOk = (verifyRows !== null && verifyRows.length > 0);
    if (!tableWriteOk) {
      console.warn('upsertChannelAudit: table write verification failed');
    }
  } catch (e) {
    console.warn('upsertChannelAudit: table upsert failed:', e);
  }

  // 2. Mirror to settings.prefs.audits (backward-compat / fallback).
  let prefs = await readSettingsPrefs(env, userId);
  const audits = Array.isArray(prefs.audits) ? prefs.audits : [];
  const filtered = audits.filter((a: any) => a.url !== audit.url);
  filtered.unshift(auditEntry);
  prefs.audits = filtered.slice(0, 8);
  await writeSettingsPrefs(env, userId, prefs);

  // 3. Count for the response — prefer table count (authoritative), fall back
  //    to prefs count if the table is unavailable.
  let count = filtered.length;
  if (tableWriteOk) {
    try {
      const tableCount = await sbHead(env, `channel_audits?user_id=eq.${encodeURIComponent(userId)}`);
      if (tableCount > 0 || filtered.length === 0) count = tableCount;
    } catch {}
  }

  return { saved: auditEntry, count };
}

// Delete an audit by URL — removes from BOTH the table and the jsonb blob.
// Returns true if either side deleted anything (best-effort).
async function deleteChannelAudit(env: Env, userId: string, url: string): Promise<boolean> {
  let tableDeleted = false;
  // 1. Delete from the table.
  try {
    // First HEAD to check existence — Supabase DELETE returns 200 even if no rows matched.
    const beforeCount = await sbHead(env, `channel_audits?user_id=eq.${encodeURIComponent(userId)}&url=eq.${encodeURIComponent(url)}`);
    if (beforeCount > 0) {
      await sbFetch(env, `channel_audits?user_id=eq.${encodeURIComponent(userId)}&url=eq.${encodeURIComponent(url)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
      const afterCount = await sbHead(env, `channel_audits?user_id=eq.${encodeURIComponent(userId)}&url=eq.${encodeURIComponent(url)}`);
      tableDeleted = (afterCount < beforeCount);
    }
  } catch (e) {
    console.warn('deleteChannelAudit: table delete failed:', e);
  }

  // 2. Also delete from the jsonb blob.
  const prefs = await readSettingsPrefs(env, userId);
  const audits = Array.isArray(prefs.audits) ? prefs.audits : [];
  const filtered = audits.filter((a: any) => a.url !== url);
  const jsonbDeleted = (filtered.length !== audits.length);
  if (jsonbDeleted) {
    prefs.audits = filtered;
    await writeSettingsPrefs(env, userId, prefs);
  }

  return tableDeleted || jsonbDeleted;
}

// Check + enforce the daily audit quota. If the user has hit the limit, return
// allowed=false. Otherwise, increment the counter (resetting if the 24h window
// has elapsed) and return allowed=true.
//
// Best-effort: if Supabase is unreachable, allow the audit through (we don't
// want to block the user because their DB is briefly down).
async function checkAndIncrementDailyQuota(env: Env, userId: string): Promise<{ allowed: boolean; used: number; quota: number; resetAt: string }> {
  const quota = DAILY_AUDIT_QUOTA;
  const profile = await fetchProfile(env, userId);
  if (!profile) {
    // Can't read profile — allow the audit (best-effort).
    return { allowed: true, used: 0, quota, resetAt: new Date().toISOString() };
  }
  const now = Date.now();
  const resetAtMs = profile.audit_quota_reset_at ? Date.parse(profile.audit_quota_reset_at) : 0;
  const used = (typeof profile.audits_used_today === 'number') ? profile.audits_used_today : 0;
  const isStale = (now - resetAtMs) > 24 * 60 * 60 * 1000;
  const effectiveUsed = isStale ? 0 : used;

  if (effectiveUsed >= quota) {
    return { allowed: false, used: effectiveUsed, quota, resetAt: profile.audit_quota_reset_at || new Date().toISOString() };
  }

  // Increment — reset to 1 if stale, else used + 1.
  const newUsed = isStale ? 1 : (effectiveUsed + 1);
  const newResetAt = isStale ? new Date().toISOString() : (profile.audit_quota_reset_at || new Date().toISOString());
  await updateProfile(env, userId, {
    audits_used_today: newUsed,
    audit_quota_reset_at: newResetAt,
  });

  return { allowed: true, used: newUsed, quota, resetAt: newResetAt };
}

// ─── Phase 5b — audit credit cost ────────────────────────────────────────────
// First audit (cache miss) per user is FREE. After that, every cache-miss
// audit costs 1 credit. Cache HIT audits (re-auditing same URL within TTL)
// are always free — no scraper cost is incurred, so we don't charge.
//
// This helper is called AFTER the audit runs but BEFORE we persist the entry,
// so we can return a 402 to the frontend if the user is out of credits
// (without saving a half-baked audit row).
//
// Returns:
//   { charged: 0, free: true, balance } — first free audit used OR cache hit
//   { charged: 1, free: false, balance } — credit deducted
//   { error: 'insufficient_credits', balance } — user has 0 credits, audit refused
const AUDIT_CREDIT_COST = 1;

async function chargeAuditCredit(env: Env, userId: string, cacheHit: boolean): Promise<{ charged: number; free: boolean; balance: number; error?: string }> {
  const profile = await fetchProfile(env, userId);
  if (!profile) {
    // Can't read profile — don't block the audit (best-effort).
    return { charged: 0, free: true, balance: 0 };
  }

  // Cache hits are always free — no scraper cost.
  if (cacheHit) {
    return { charged: 0, free: true, balance: profile.credits || 0 };
  }

  // First cache-miss audit is free — mark the flag + return.
  if (!profile.free_audit_used) {
    await updateProfile(env, userId, { free_audit_used: true });
    return { charged: 0, free: true, balance: profile.credits || 0 };
  }

  // Subsequent cache-miss audits cost 1 credit each.
  const balance = profile.credits || 0;
  if (balance < AUDIT_CREDIT_COST) {
    return { charged: 0, free: false, balance, error: 'insufficient_credits' };
  }

  // Deduct + log the transaction.
  const newBalance = balance - AUDIT_CREDIT_COST;
  await updateProfile(env, userId, { credits: newBalance });
  await sbFetch(env, 'credit_transactions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      delta: -AUDIT_CREDIT_COST,
      reason: 'channel_audit',
      reference_id: null,
    }),
  });

  return { charged: AUDIT_CREDIT_COST, free: false, balance: newBalance };
}

async function awardCredits(env: Env, userId: string, delta: number, reason: string, referenceId?: string): Promise<boolean> {
  const p = await fetchProfile(env, userId);
  if (!p) return false;
  const newBalance = Math.max(0, (p.credits || 0) + delta);
  await updateProfile(env, userId, { credits: newBalance });
  await sbFetch(env, 'credit_transactions', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, delta, reason, reference_id: referenceId ?? null }),
  });
  return true;
}

async function awardXp(env: Env, userId: string, action: string, xpDelta: number, referenceId?: string): Promise<boolean> {
  const p = await fetchProfile(env, userId);
  if (!p) return false;
  const newXp = (p.xp || 0) + xpDelta;
  await updateProfile(env, userId, { xp: newXp });
  await sbFetch(env, 'xp_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, action, xp_delta: xpDelta, reference_id: referenceId ?? null }),
  });
  return true;
}

// ─── Auth middleware ─────────────────────────────────────────────────────────
async function requireAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing or malformed Authorization header' }, 401);
  }
  const token = authHeader.slice(7).trim();
  try {
    const secret = new TextEncoder().encode(c.env.SUPABASE_JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], audience: 'authenticated' });
    const userId = payload.sub as string;
    if (!userId) return json({ error: 'Invalid token: missing sub' }, 401);
    const profile = await fetchProfile(c.env, userId);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    c.set('userId', userId);
    c.set('profile', profile);
    await next();
  } catch (e: any) {
    // Fallback: decode without verification (older tokens) — but only trust if profile exists
    try {
      const decoded = decodeJwt(token);
      const userId = decoded.sub as string;
      if (!userId) throw e;
      const profile = await fetchProfile(c.env, userId);
      if (!profile) return json({ error: 'Profile not found' }, 404);
      c.set('userId', userId);
      c.set('profile', profile);
      await next();
    } catch {
      return json({ error: 'Invalid or expired token', detail: e?.message }, 401);
    }
  }
}

function requirePlan(...plans: string[]) {
  return async (c: any, next: any) => {
    const profile = c.get('profile') as Profile;
    if (!plans.includes(profile.plan || 'free')) {
      return json({
        error: 'Plan upgrade required',
        required_plan: plans[0],
        current_plan: profile.plan || 'free',
        plan_required: true,
      }, 402);
    }
    await next();
  };
}

// ─── Credit gating ──────────────────────────────────────────────────────────
// Checks that the user has at least `n` credits. Returns 402 with
// `insufficient_credits: true` if not — the frontend listens for this and
// shows the UpgradeModal automatically.
function requireCredits(n: number) {
  return async (c: any, next: any) => {
    const profile = c.get('profile') as Profile;
    const current = profile.credits || 0;
    if (current < n) {
      return json({
        error: 'Insufficient credits',
        insufficient_credits: true,
        required: n,
        current,
        plan: profile.plan || 'free',
      }, 402);
    }
    await next();
  };
}

// Deducts `n` credits from the user's balance and returns the new balance.
// Logs a row to `credit_transactions` for audit. Idempotent — if the user
// profile can't be loaded we just return the original balance.
async function spendCredits(env: Env, userId: string, n: number, reason: string): Promise<number> {
  const p = await fetchProfile(env, userId);
  if (!p) return 0;
  const newBalance = Math.max(0, (p.credits || 0) - n);
  await updateProfile(env, userId, { credits: newBalance });
  try {
    await sbFetch(env, 'credit_transactions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, delta: -n, reason }),
    });
  } catch {}
  return newBalance;
}

// ─── LLM helpers (SiliconFlow primary, Mistral fallback, Groq last) ────────
// All three providers expose OpenAI-compatible /v1/chat/completions endpoints,
// so we route to whichever key is configured. Provider priority:
//   1. SILICONFLOW_API_KEY → SiliconFlow (China-friendly egress, reasoning models)
//   2. MISTRAL_API_KEY     → Mistral (OpenAI-compatible, cheap, fast)
//   3. GROQ_API_KEY        → Groq (free tier, llama 70b)
//
// SiliconFlow notes:
//   - Most models on SiliconFlow (Qwen3, GLM-5, DeepSeek-V4, Kimi-K2) are
//     reasoning models: they emit `reasoning_content` BEFORE the final answer
//     in `content`. Reasoning tokens count against `max_tokens`, so we use a
//     larger default (6000) to leave headroom.
//   - International endpoint is api.siliconflow.com (NOT .cn).
//
// Default models (chosen for trend synthesis / forge quality + speed):
//   SiliconFlow → 'Qwen/Qwen3-32B'        (32B params, good JSON, balanced)
//   Mistral     → 'mistral-small-latest'   (~$0.20/1M in, ~$0.60/1M out)
//   Groq        → 'llama-3.3-70b-versatile' (free tier)
//
// Override any default with LLM_MODEL env var. Good SiliconFlow alternatives:
//   'deepseek-ai/DeepSeek-V4-Pro'   — flagship reasoning, highest quality
//   'deepseek-ai/DeepSeek-V4-Flash' — faster/cheaper reasoning
//   'zai-org/GLM-5.2'               — Z.ai flagship, 128k context
//   'moonshotai/Kimi-K2.7'          — strong at long-context synthesis
//   'MiniMaxAI/MiniMax-M3'          — multimodal-capable, fast
type LlmProvider = 'siliconflow' | 'mistral' | 'groq';

function pickLlm(env: Env): { provider: LlmProvider; url: string; key: string; model: string } {
  if (env.SILICONFLOW_API_KEY) {
    return {
      provider: 'siliconflow',
      url: 'https://api.siliconflow.com/v1/chat/completions',
      key: env.SILICONFLOW_API_KEY,
      model: env.LLM_MODEL || 'Qwen/Qwen3-32B',
    };
  }
  if (env.MISTRAL_API_KEY) {
    return {
      provider: 'mistral',
      url: 'https://api.mistral.ai/v1/chat/completions',
      key: env.MISTRAL_API_KEY,
      model: env.LLM_MODEL || 'mistral-small-latest',
    };
  }
  if (env.GROQ_API_KEY) {
    return {
      provider: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: env.GROQ_API_KEY,
      model: env.LLM_MODEL || 'llama-3.3-70b-versatile',
    };
  }
  throw new Error('No LLM provider configured. Set SILICONFLOW_API_KEY, MISTRAL_API_KEY, or GROQ_API_KEY in Cloudflare env vars.');
}

// Returns ALL configured providers in priority order — used for automatic
// fallback if the primary returns 5xx / 402 / 429 (transient or quota errors).
function allLlmProviders(env: Env): { provider: LlmProvider; url: string; key: string; model: string }[] {
  const out: { provider: LlmProvider; url: string; key: string; model: string }[] = [];
  if (env.SILICONFLOW_API_KEY) out.push({ provider: 'siliconflow', url: 'https://api.siliconflow.com/v1/chat/completions', key: env.SILICONFLOW_API_KEY, model: env.LLM_MODEL || 'Qwen/Qwen3-32B' });
  if (env.MISTRAL_API_KEY)     out.push({ provider: 'mistral',     url: 'https://api.mistral.ai/v1/chat/completions',     key: env.MISTRAL_API_KEY,     model: env.LLM_MODEL || 'mistral-small-latest' });
  if (env.GROQ_API_KEY)        out.push({ provider: 'groq',        url: 'https://api.groq.com/openai/v1/chat/completions',  key: env.GROQ_API_KEY,        model: env.LLM_MODEL || 'llama-3.3-70b-versatile' });
  return out;
}

async function llmChat(env: Env, messages: any[], opts: { max_tokens?: number; temperature?: number } = {}): Promise<string> {
  const providers = allLlmProviders(env);
  if (providers.length === 0) {
    throw new Error('No LLM provider configured. Set SILICONFLOW_API_KEY, MISTRAL_API_KEY, or GROQ_API_KEY in Cloudflare env vars.');
  }
  // Try each provider in priority order. Fail over on:
  //   - 5xx (server errors, "system busy")
  //   - 402 / 30001 (SiliconFlow balance-insufficient)
  //   - 429 (rate limit)
  // Do NOT fail over on 4xx client errors (400 bad request, 401 auth) — those
  // would fail on every provider, so just throw the first one.
  let lastErr: Error | null = null;
  for (const { provider, url, key, model } of providers) {
    const defaultMax = provider === 'siliconflow' ? 6000 : 800;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: opts.max_tokens ?? defaultMax,
          temperature: opts.temperature ?? 0.85,
        }),
      });
      // Failover-worthy status codes
      if (r.status >= 500 || r.status === 429 || r.status === 402) {
        const body = await r.text();
        lastErr = new Error(`${provider} API ${r.status}: ${body}`);
        console.warn(`[llmChat] ${provider} failed (${r.status}), trying next provider…`);
        continue;
      }
      // SiliconFlow sometimes returns 200 with a balance error in the body — handle that
      if (!r.ok) {
        const body = await r.text();
        // Check for SiliconFlow balance-insufficient body even on 200
        if (body.includes('balance is insufficient') || body.includes('"code":30001')) {
          lastErr = new Error(`${provider} balance insufficient`);
          console.warn(`[llmChat] ${provider} balance insufficient, trying next provider…`);
          continue;
        }
        throw new Error(`${provider} API ${r.status}: ${body}`);
      }
      const data = (await r.json()) as any;
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      // Even on 200, SiliconFlow sometimes embeds the balance error in the response
      if (data.code === 30001 || (typeof data.message === 'string' && data.message.includes('balance is insufficient'))) {
        lastErr = new Error(`${provider} balance insufficient`);
        console.warn(`[llmChat] ${provider} balance insufficient (in 200 body), trying next provider…`);
        continue;
      }
      return content;
    } catch (e: any) {
      // Network error — try next provider
      lastErr = e;
      console.warn(`[llmChat] ${provider} threw: ${e.message}, trying next provider…`);
      continue;
    }
  }
  throw lastErr ?? new Error('All LLM providers failed');
}

async function llmJson<T = any>(env: Env, prompt: string, system = '', maxTokens = 6000): Promise<T> {
  const msgs: any[] = [];
  if (system) msgs.push({ role: 'system', content: system });
  msgs.push({ role: 'user', content: prompt });
  let raw = await llmChat(env, msgs, { max_tokens: maxTokens });
  // Strip code fences
  for (const fence of ['```json', '```']) raw = raw.replace(fence, '');
  // If the model wrapped JSON in prose, extract the outermost {...} or [...]
  raw = raw.trim();
  const firstBrace = raw.search(/[{[]/);
  if (firstBrace > 0) raw = raw.slice(firstBrace);
  // Find matching closing brace/bracket (last one wins — simple heuristic)
  const lastClose = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
  if (lastClose > 0 && lastClose < raw.length - 1) raw = raw.slice(0, lastClose + 1);
  try {
    return JSON.parse(raw) as T;
  } catch {
    // If still failing, try aggressive repair: trim trailing commas before } or ]
    const repaired = raw.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(repaired) as T;
  }
}

// ─── Paystack webhook HMAC ───────────────────────────────────────────────────
async function hmacSha512(secret: string, body: ArrayBuffer): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, body);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ════════════════════════════════════════════════════════════════════════════
// CACHE LAYER (L1 in-memory + L2 Cloudflare KV + single-flight + stale-while-error)
// ════════════════════════════════════════════════════════════════════════════
// L1: Per-isolate Map. Survives across requests in the same isolate (minutes-hours).
// L2: Cloudflare KV namespace `CACHE_KV`. Globally replicated, eventually consistent.
// Single-flight: when N concurrent requests hit the same key, only one upstream
//   call fires — the rest await the same promise.
// Stale-while-error: if upstream throws AND we have any cached value (even
//   expired), serve the stale value rather than erroring. This keeps the app
//   resilient during LLM/Serper/Reddit outages.

declare global {
  // eslint-disable-next-line no-var
  var __clipaiL1: Map<string, { data: any; expires: number }> | undefined;
  // eslint-disable-next-line no-var
  var __clipaiInflight: Map<string, Promise<any>> | undefined;
}
const l1Cache: Map<string, { data: any; expires: number }> =
  (globalThis as any).__clipaiL1 ?? new Map();
(globalThis as any).__clipaiL1 = l1Cache;
const inflight: Map<string, Promise<any>> =
  (globalThis as any).__clipaiInflight ?? new Map();
(globalThis as any).__clipaiInflight = inflight;

const STALE_WINDOW = 24 * 60 * 60; // 24h stale fallback window (KV TTL)

async function cacheRead<T>(env: Env, key: string): Promise<{ data: T; fresh: boolean } | null> {
  // L1
  const l1 = l1Cache.get(key);
  if (l1) {
    if (l1.expires > Date.now()) return { data: l1.data as T, fresh: true };
    // expired L1 — keep for fallback but treat as miss
  }
  // L2 (KV)
  if (env.CACHE_KV) {
    try {
      const raw = await env.CACHE_KV.get<any>(`c:${key}`, 'json');
      if (raw) {
        const fresh = raw.expires > Date.now();
        // promote to L1 (even if stale, for fast fallback)
        l1Cache.set(key, { data: raw.data, expires: raw.expires });
        return { data: raw.data as T, fresh };
      }
    } catch (e) {
      console.warn('[cache] KV read failed:', (e as Error).message);
    }
  }
  return null;
}

async function cacheWrite<T>(env: Env, key: string, data: T, ttl: number): Promise<void> {
  const expires = Date.now() + ttl * 1000;
  l1Cache.set(key, { data, expires });
  // Light L1 GC: if L1 is over 300 entries, drop the 100 oldest
  if (l1Cache.size > 300) {
    const entries = [...l1Cache.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (let i = 0; i < 100; i++) l1Cache.delete(entries[i][0]);
  }
  if (env.CACHE_KV) {
    try {
      await env.CACHE_KV.put(`c:${key}`, JSON.stringify({ data, expires }), {
        expirationTtl: ttl + STALE_WINDOW,
      });
    } catch (e) {
      console.warn('[cache] KV write failed:', (e as Error).message);
    }
  }
}

async function cacheReadStale<T>(env: Env, key: string): Promise<T | null> {
  const l1 = l1Cache.get(key);
  if (l1) return l1.data as T;
  if (env.CACHE_KV) {
    try {
      const raw = await env.CACHE_KV.get<any>(`c:${key}`, 'json');
      if (raw) return raw.data as T;
    } catch {}
  }
  return null;
}

/**
 * Wrap a function with cache.
 *  1. Return fresh cache if present.
 *  2. Otherwise single-flight the upstream call (dedupe concurrent requests).
 *  3. On upstream error, serve stale if available (never error if we have anything).
 */
async function withCache<T>(
  env: Env,
  key: string,
  ttl: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await cacheRead<T>(env, key);
  if (cached && cached.fresh) return cached.data;

  // Single-flight
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    try {
      const data = await fn();
      await cacheWrite(env, key, data, ttl);
      return data;
    } catch (e: any) {
      const stale = await cacheReadStale<T>(env, key);
      if (stale !== null) {
        console.warn(`[cache] upstream failed, serving stale for ${key}: ${e.message}`);
        return stale;
      }
      throw e;
    } finally {
      // Briefly retain the promise to absorb concurrent bursts
      setTimeout(() => inflight.delete(key), 200);
    }
  })();
  inflight.set(key, p);
  return p;
}

async function hashKey(...parts: (string | number | undefined)[]): Promise<string> {
  const input = parts.filter(p => p !== undefined).join('|').toLowerCase().trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).slice(0, 10).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ════════════════════════════════════════════════════════════════════════════
// AUDIT CREDIT TRACKING — last-seen balances, updated as audits run
// ════════════════════════════════════════════════════════════════════════════
// Each audit scraper exposes its remaining credits differently:
//   - Sociavault: GET /v1/credits returns {credits, subscriptionStatus} (free call)
//   - ScrapeCreators: every API response body includes credits_remaining (passive)
//   - SocialData: x-ratelimit-remaining / x-ratelimit-limit headers on every call (per-minute, NOT balance)
// We record the last-seen values in L1 cache so /audit-credits can return them
// without making extra probe calls. KV-backed so values survive isolate restarts.
type CreditSnapshot = {
  credits?: number;          // ScrapeCreators: credits_remaining · Sociavault: credits
  subscription?: string;     // Sociavault: "free" | "paid"
  rate_limit_remaining?: number;  // SocialData: per-minute remaining
  rate_limit_limit?: number;      // SocialData: per-minute limit
  last_updated: string;       // ISO timestamp
  last_source?: string;       // which audit call last wrote this (e.g. "audit:tiktok:khaby.lame")
};

const CREDIT_KV_TTL = 7 * 24 * 60 * 60;  // 7 days — keep history even if no audits run

async function recordCreditSnapshot(
  env: Env,
  provider: 'sociavault' | 'scrapecreators' | 'socialdata',
  keyLabel: string,  // e.g. "primary", "backup_2", "backup_3" — for Sociavault multi-key
  snap: Omit<CreditSnapshot, 'last_updated'>,
): Promise<void> {
  const full: CreditSnapshot = { ...snap, last_updated: new Date().toISOString() };
  const kvKey = `audit_credits:${provider}:${keyLabel}`;
  l1Cache.set(`credit:${kvKey}`, { data: full, expires: Date.now() + CREDIT_KV_TTL * 1000 });
  if (env.CACHE_KV) {
    try {
      await env.CACHE_KV.put(kvKey, JSON.stringify(full), { expirationTtl: CREDIT_KV_TTL });
    } catch (e) {
      console.warn('[credits] KV write failed:', (e as Error).message);
    }
  }
}

async function readCreditSnapshot(
  env: Env,
  provider: 'sociavault' | 'scrapecreators' | 'socialdata',
  keyLabel: string,
): Promise<CreditSnapshot | null> {
  const kvKey = `audit_credits:${provider}:${keyLabel}`;
  const l1 = l1Cache.get(`credit:${kvKey}`);
  if (l1) return l1.data as CreditSnapshot;
  if (env.CACHE_KV) {
    try {
      const raw = await env.CACHE_KV.get<CreditSnapshot>(kvKey, 'json');
      if (raw) {
        l1Cache.set(`credit:${kvKey}`, { data: raw, expires: Date.now() + CREDIT_KV_TTL * 1000 });
        return raw;
      }
    } catch {}
  }
  return null;
}

/** Live-probe Sociavault credits. GET /v1/credits is free (no quota impact). */
async function probeSociavaultCredits(apiKey: string): Promise<{ credits: number; subscription: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://api.sociavault.com/v1/credits', {
      headers: { 'x-api-key': apiKey },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json() as any;
    if (typeof j?.credits === 'number') {
      return { credits: j.credits, subscription: String(j.subscriptionStatus || j.subscription || 'unknown') };
    }
    return null;
  } catch {
    return null;
  }
}

const SOCIAVAULT_PROBE_INTERVAL_MS = 5 * 60 * 1000;  // probe at most every 5 min per key

/**
 * Throttled Sociavault credit probe — if we've probed this key in the last
 * 5 minutes, skip. Otherwise fire-and-forget a probe and record the result.
 * Designed to be called inside an audit flow without blocking the response
 * (caller should wrap in executionCtx.waitUntil if available).
 */
async function maybeProbeAndRecordSociavaultCredits(
  env: Env,
  apiKey: string,
  keyLabel: 'primary' | 'backup_2' | 'backup_3',
  lastSource: string,
): Promise<void> {
  // Check L1 cache age — skip if probed recently
  const cached = await readCreditSnapshot(env, 'sociavault', keyLabel);
  if (cached?.last_updated) {
    const age = Date.now() - new Date(cached.last_updated).getTime();
    if (age < SOCIAVAULT_PROBE_INTERVAL_MS) return;
  }
  const probe = await probeSociavaultCredits(apiKey);
  if (probe) {
    await recordCreditSnapshot(env, 'sociavault', keyLabel, {
      credits: probe.credits,
      subscription: probe.subscription,
      last_source: lastSource,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// RATE LIMITING (token bucket via Cloudflare KV)
// ════════════════════════════════════════════════════════════════════════════
// Default: 30 requests per minute per user (or per IP if not authed).
// KV-backed so the limit is global, not per-isolate. Falls open if RATELIMIT_KV
// is not bound (so dev mode still works).

async function rateLimit(env: Env, key: string, limit = 30, windowSec = 60): Promise<boolean> {
  if (!env.RATELIMIT_KV) return true; // fail open in dev
  const kvKey = `rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
  try {
    const cur = parseInt((await env.RATELIMIT_KV.get(kvKey)) || '0', 10);
    if (cur >= limit) return false;
    await env.RATELIMIT_KV.put(kvKey, String(cur + 1), { expirationTtl: windowSec + 5 });
    return true;
  } catch {
    return true; // fail open
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ─── Health (rich — pings every upstream dependency) ─────────────────────────
app.get('/health', async (c) => {
  const env = c.env as Env;
  const checks: Record<string, { status: string; latency_ms?: number; detail?: string }> = {};

  // L1 cache size
  checks.l1_cache = { status: 'ok', detail: `${l1Cache.size} entries, ${inflight.size} inflight` };

  // KV binding
  checks.kv = { status: env.CACHE_KV ? 'ok' : 'unbound' };
  checks.ratelimit_kv = { status: env.RATELIMIT_KV ? 'ok' : 'unbound' };

  // Supabase ping (5s timeout, uses service_role key — same key as backend ops)
  const sbStart = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    checks.supabase = { status: r.ok ? 'ok' : 'degraded', latency_ms: Date.now() - sbStart, detail: `HTTP ${r.status}` };
  } catch (e: any) {
    checks.supabase = { status: 'down', latency_ms: Date.now() - sbStart, detail: e.message };
  }

  // LLM provider configured? (Don't leak which one in the public response.)
  const llmProvider = env.SILICONFLOW_API_KEY ? 'siliconflow'
    : env.MISTRAL_API_KEY ? 'mistral'
    : env.GROQ_API_KEY ? 'groq' : 'none';
  checks.llm = { status: llmProvider !== 'none' ? 'ok' : 'down', detail: llmProvider !== 'none' ? 'configured' : 'none' };

  // Serper (just check key presence — actual ping costs quota)
  checks.serper = { status: env.SERPER_API_KEY ? 'ok' : 'unbound' };

  // Channel audit scrapers (all optional)
  const sociavaultKeysCount = [env.SOCIAVAULT_API_KEY, env.SOCIAVAULT_API_KEY_2, env.SOCIAVAULT_API_KEY_3].filter(Boolean).length;
  checks.sociavault = {
    status: env.SOCIAVAULT_API_KEY ? 'ok' : 'unbound',
    detail: env.SOCIAVAULT_API_KEY
      ? `TikTok + IG + X audits enabled (${sociavaultKeysCount} key${sociavaultKeysCount === 1 ? '' : 's'} configured)`
      : 'Audits fall back to ScrapeCreators/SocialData/Serper',
  };
  checks.scrapecreators = { status: env.SCRAPECREATORS_API_KEY ? 'ok' : 'unbound', detail: env.SCRAPECREATORS_API_KEY ? 'TikTok + IG backup enabled' : 'TikTok/IG fall back to Serper (lite)' };
  const socialdataKeysCount = [env.SOCIALDATA_API_KEY, env.SOCIALDATA_API_KEY_2, env.SOCIALDATA_API_KEY_3, env.SOCIALDATA_API_KEY_4].filter(Boolean).length;
  checks.socialdata = {
    status: env.SOCIALDATA_API_KEY ? 'ok' : 'unbound',
    detail: env.SOCIALDATA_API_KEY
      ? `X/Twitter audits enabled (${socialdataKeysCount} key${socialdataKeysCount === 1 ? '' : 's'} configured)`
      : 'X audits fall back to Sociavault or Serper (lite)',
  };
  checks.reddit_oauth = {
    status: (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) ? 'ok' : 'unbound',
    detail: (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET)
      ? 'Reddit audits via oauth.reddit.com (60 req/min)'
      : 'Reddit audits fall back to www.reddit.com (rate-limited) → Pullpush → RSS',
  };

  // Paystack
  checks.paystack = { status: env.PAYSTACK_SECRET_KEY ? 'ok' : 'unbound' };

  // Aggregate status
  const allOk = Object.values(checks).every(c => c.status === 'ok' || c.status === 'unbound');
  const degraded = !allOk && Object.values(checks).some(c => c.status === 'ok');

  return json({
    status: allOk ? 'ok' : (degraded ? 'degraded' : 'down'),
    service: 'clipai-worker',
    version: '5.0-cf',
    runtime: 'cloudflare-pages',
    timestamp: new Date().toISOString(),
    checks,
  }, allOk ? 200 : 503);
});

// ─── Auth ────────────────────────────────────────────────────────────────────
app.get('/auth/me', requireAuth, async (c) => {
  const env = c.env as Env;
  const profile = c.get('profile') as Profile;
  const userId = c.get('userId') as string;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const lastActiveStr = profile.last_active_date ? String(profile.last_active_date).slice(0, 10) : null;
  let streakBumped = false;
  let streakCredits = 0;

  if (lastActiveStr !== todayStr) {
    const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const newStreak = lastActiveStr === yesterday ? (profile.streak_days || 0) + 1 : 1;
    await updateProfile(env, userId, { streak_days: newStreak, last_active_date: todayStr });
    await awardCredits(env, userId, 5, 'daily_streak');
    await awardXp(env, userId, 'daily_streak', XP_REWARDS.daily_streak);
    streakBumped = true;
    streakCredits = 5;
    const fresh = await fetchProfile(env, userId);
    if (fresh) Object.assign(profile, fresh);
    profile.streak_days = newStreak;
  }

  return json({
    id: profile.id,
    email: profile.email || '',
    name: profile.full_name || 'Gamer',
    plan: profile.plan || 'free',
    credits: profile.credits || 0,
    clipsUsed: profile.clips_used || 0,
    referralCode: profile.referral_code || '',
    xp: profile.xp || 0,
    streakDays: profile.streak_days || 0,
    avatarUrl: profile.avatar_url,
    streakBumped,
    streakCreditsAwarded: streakCredits,
  });
});

// ─── Waitlist ────────────────────────────────────────────────────────────────
app.post('/waitlist/join', async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const email = (body.email || '').toString().trim().toLowerCase();
  if (!email || !email.includes('@')) return json({ error: 'Valid email required' }, 400);

  const gameInterest = (body.game_interest || '').toString().trim().toLowerCase() || null;
  const source = (body.source || 'upload_page').toString();

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return json({
      success: true, position: 1, creditsAwarded: 0,
      message: "You're on the list! We'll email you when the editor launches.",
    });
  }

  const existing = await sbFetch<any[]>(env, `waitlist?email=eq.${encodeURIComponent(email)}&select=id,credits_awarded`);
  if (existing && existing.length > 0) {
    const position = (await sbHead(env, 'waitlist?select=id')) || 1;
    return json({
      success: true, position, creditsAwarded: 0,
      message: "You're already on the waitlist!",
    });
  }

  const profileRows = await sbFetch<any[]>(env, `profiles?email=eq.${encodeURIComponent(email)}&select=id,credits`);
  let userId: string | null = null;
  if (profileRows && profileRows.length > 0) userId = profileRows[0].id;

  await sbFetch(env, 'waitlist', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      email, user_id: userId, game_interest: gameInterest, source, credits_awarded: false,
    }),
  });

  let creditsAwarded = 0;
  if (userId) {
    if (await awardCredits(env, userId, 25, 'waitlist_bonus')) {
      await sbFetch(env, `waitlist?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ credits_awarded: true }),
      });
      creditsAwarded = 25;
    }
  }

  const position = (await sbHead(env, 'waitlist?select=id')) || 1;
  return json({
    success: true,
    position,
    creditsAwarded,
    message: "Welcome to the v3 waitlist! We'll email you when the editor launches.",
  });
});

// ─── Clips ───────────────────────────────────────────────────────────────────
app.get('/clips', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const rows = await sbFetch<any[]>(env, `clips?user_id=eq.${userId}&order=created_at.desc&limit=20`);
  return json({ clips: rows || [] });
});

// ─── Leaderboard ─────────────────────────────────────────────────────────────
app.get('/leaderboard', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const type = c.req.query('type') === 'weekly' ? 'weekly' : 'alltime';
  const view = type === 'alltime' ? 'leaderboard_alltime' : 'leaderboard_weekly';

  // 5min cache per type — leaderboard is global, doesn't need to be realtime
  const cacheKey = `leaderboard:${type}`;
  const data = await withCache(env, cacheKey, 5 * 60, async () => {
    const rows = await sbFetch<any[]>(env, `${view}?order=rank.asc&limit=100`);
    return { rows: rows || [] };
  });

  let me = data.rows.find((r: any) => r.id === userId) || null;
  if (!me) {
    const myRow = await sbFetch<any[]>(env, `${view}?id=eq.${userId}`);
    me = myRow && myRow.length > 0 ? myRow[0] : { rank: 999, id: userId, xp: 0 };
  }
  return json({ players: data.rows, currentUser: me });
});

// ─── Rank ────────────────────────────────────────────────────────────────────
app.get('/rank/me', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const profile = c.get('profile') as Profile;
  const xp = profile.xp || 0;
  const tier = RANK_TIERS.reduce((acc, t) => (xp >= t.min_xp ? t : acc), RANK_TIERS[0]);
  const nextTier = RANK_TIERS.find((t) => t.min_xp > xp) || null;

  const rank = (await sbHead(env, `profiles?xp=gt.${xp}&select=id`)) + 1;

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekRows = await sbFetch<any[]>(env, `xp_events?user_id=eq.${userId}&created_at=gt.${weekAgo}&select=xp_delta`);
  const weeklyXp = (weekRows || []).reduce((s, r) => s + (r.xp_delta || 0), 0);

  return json({
    xp, weeklyXp, tier, nextTier,
    globalRank: rank,
    streakDays: profile.streak_days || 0,
    clipsAnalysed: profile.clips_used || 0,
  });
});

// ─── Referrals ───────────────────────────────────────────────────────────────
app.get('/referrals/stats', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const rows = await sbFetch<any[]>(env, `referrals?referrer_id=eq.${userId}&select=referred_id,credits_awarded_referrer,created_at`);
  if (!rows) return json({ total: 0, creditsEarned: 0, referred: [] });
  return json({
    total: rows.length,
    creditsEarned: rows.reduce((s, r) => s + (r.credits_awarded_referrer || 0), 0),
    referred: rows.slice(0, 5),
  });
});

app.post('/referrals/apply', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const code = (body.code || '').toString().toUpperCase().trim();
  if (!code) return json({ valid: false, error: 'No code provided' }, 400);
  const rows = await sbFetch<any[]>(env, `profiles?referral_code=eq.${encodeURIComponent(code)}&select=id,full_name`);
  if (!rows || rows.length === 0) return json({ valid: false, error: 'Code not found' });
  const owner = rows[0];
  if (owner.id === userId) return json({ valid: false, error: 'Cannot use your own code' });
  return json({ valid: true, ownerName: owner.full_name || 'Gamer', discountPercent: 10 });
});

// ─── Paystack ────────────────────────────────────────────────────────────────
app.post('/payment/init', requireAuth, async (c) => {
  const env = c.env as Env;
  const profile = c.get('profile') as Profile;
  const body = await c.req.json().catch(() => ({}));
  const plan = (body.plan || 'pro').toString().toLowerCase();
  if (!PLAN_AMOUNT_KOBO[plan]) return json({ error: `Invalid plan: ${plan}` }, 400);
  const interval = body.interval === 'annual' ? 'annual' : 'monthly';
  let amount = PLAN_AMOUNT_KOBO[plan];
  if (interval === 'annual') amount = Math.floor(amount * 12 * 0.8);
  const callbackUrl = body.callbackUrl || 'https://clipai-bqo.pages.dev/?payment=success';

  const payload = {
    email: profile.email,
    amount,
    currency: 'NGN',
    callback_url: callbackUrl,
    metadata: {
      user_id: c.get('userId'),
      plan_code: plan,
      interval,
      referral_code: body.referralCode || '',
    },
  };

  try {
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = (await r.json()) as any;
    if (!r.ok) throw new Error(data.message || `Paystack ${r.status}`);
    return json({
      authorization_url: data.data.authorization_url,
      reference: data.data.reference,
      amount_kobo: amount,
      plan,
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.post('/payment/webhook', async (c) => {
  const env = c.env as Env;
  const secret = env.PAYSTACK_SECRET_KEY || '';
  const sig = c.req.header('X-Paystack-Signature') || '';
  const rawBody = await c.req.text();
  const expected = await hmacSha512(secret, new TextEncoder().encode(rawBody).buffer as ArrayBuffer);
  if (sig !== expected) return json({ error: 'Invalid signature' }, 401);

  const event = JSON.parse(rawBody) as any;
  console.log(`Paystack event: ${event.event}`);

  if (event.event === 'charge.success') {
    const data = event.data || {};
    const reference = data.reference || '';
    const metadata = data.metadata || {};
    const planCode = metadata.plan_code || '';
    const planName = PLAN_AMOUNT_KOBO[planCode] ? planCode : 'pro';
    const userId = metadata.user_id || '';
    const amount = data.amount || 0;

    if (userId && env.SUPABASE_URL) {
      const monthlyCredits = (PLAN_FEATURES[planName] || PLAN_FEATURES.free).credits_monthly;
      await updateProfile(env, userId, { plan: planName, credits: monthlyCredits });
      await awardXp(env, userId, 'referral_paid', XP_REWARDS.referral_paid);

      const refCode = metadata.referral_code || '';
      if (refCode) {
        const referrerRows = await sbFetch<any[]>(env, `profiles?referral_code=eq.${encodeURIComponent(refCode.toUpperCase())}&select=id`);
        if (referrerRows && referrerRows.length > 0) {
          const referrerId = referrerRows[0].id;
          await sbFetch(env, `referrals?referred_id=eq.${userId}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ paid: true }),
          });
          await awardXp(env, referrerId, 'referral_paid', XP_REWARDS.referral_paid, userId);
          await awardCredits(env, referrerId, 50, 'referral_paid_bonus', userId);
        }
      }

      await sbFetch(env, 'subscriptions', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId, plan: planName, paystack_ref: reference,
          status: 'success', amount_kobo: amount, interval: metadata.interval || 'monthly',
        }),
      });
    }
  }
  return json({ status: 'ok' });
});

app.get('/payment/verify', requireAuth, async (c) => {
  const env = c.env as Env;
  const reference = c.req.query('reference') || '';
  if (!reference) return json({ success: false, error: 'No reference' }, 400);
  try {
    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
    });
    const data = (await r.json()) as any;
    if (!data.status || data.data?.status !== 'success') {
      return json({ success: false, error: 'Payment not verified' });
    }
    const metadata = data.data.metadata || {};
    const planCode = metadata.plan_code || '';
    const planName = PLAN_AMOUNT_KOBO[planCode] ? planCode : 'pro';
    return json({ success: true, plan: planName, reference });
  } catch (e: any) {
    return json({ success: false, error: e.message }, 500);
  }
});

// ─── Settings ────────────────────────────────────────────────────────────────
app.patch('/settings/profile', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const fields: Record<string, unknown> = {};
  if (typeof body.full_name === 'string') fields.full_name = body.full_name.slice(0, 100);
  if (typeof body.avatar_url === 'string') fields.avatar_url = body.avatar_url.slice(0, 500);
  if (Object.keys(fields).length === 0) return json({ error: 'No updatable fields' }, 400);
  await updateProfile(env, userId, fields);
  return json({ success: true });
});

app.patch('/settings/notifications', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const profile = c.get('profile') as Profile;
  const body = await c.req.json().catch(() => ({}));
  const prefs: Record<string, boolean> = { ...(profile.notification_prefs || {}) };
  for (const k of ['email_updates', 'product_news', 'clip_ready', 'weekly_digest']) {
    if (typeof body[k] === 'boolean') prefs[k] = body[k];
  }
  await updateProfile(env, userId, { notification_prefs: prefs });
  return json({ success: true, prefs });
});

// ─── Forge voting ────────────────────────────────────────────────────────────
app.post('/forge/vote', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const caption = (body.caption || '').toString().trim();
  const vote = parseInt(body.vote, 10) || 0;
  if (!caption || (vote !== 1 && vote !== -1)) return json({ error: 'Invalid vote' }, 400);

  await sbFetch(env, `caption_votes?user_id=eq.${userId}&caption_text=eq.${encodeURIComponent(caption)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  await sbFetch(env, 'caption_votes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id: userId, caption_text: caption, vote,
      game: body.game || null, vibe: body.vibe || null,
    }),
  });
  await awardXp(env, userId, 'clips_voted', XP_REWARDS.clips_voted);
  return json({ success: true });
});

app.get('/forge/top-captions', async (c) => {
  const env = c.env as Env;
  // 5min cache — top captions change slowly
  const data = await withCache(env, 'forge_top_captions', 5 * 60, async () => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const rows = await sbFetch<any[]>(env, `caption_votes?created_at=gt.${weekAgo}&select=caption_text,vote,game,vibe&order=created_at.desc&limit=50`);
    if (!rows) return { captions: [] };
    const agg: Record<string, any> = {};
    for (const r of rows) {
      const t = r.caption_text;
      if (!agg[t]) agg[t] = { caption: t, score: 0, game: r.game, vibe: r.vibe };
      agg[t].score += r.vote;
    }
    const top = Object.values(agg).sort((a: any, b: any) => b.score - a.score).slice(0, 10);
    return { captions: top };
  });
  return json(data);
});

// ─── Forge tools (Groq) ──────────────────────────────────────────────────────
app.post('/forge/titles', requireAuth, requireCredits(2), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
  const platform = body.platform || 'TikTok';

  // 7d cache — deterministic per (desc, game, platform)
  const cacheKey = await hashKey('forge_titles', desc, game, platform);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 7 * 24 * 60 * 60, async () => {
      const system = 'You are a viral gaming content strategist. Return ONLY valid JSON.';
      const prompt = `Generate 7 viral title options for this gaming clip:
Description: "${desc}"
Game: ${game}
Platform: ${platform}

Return JSON:
{
  "titles": [
    {
      "id": "t1",
      "text": "<full title with emoji>",
      "viralScore": <65-99 integer>,
      "searchVolume": "<e.g. 24K>",
      "trend": "<rising|stable|declining>",
      "votes": 0
    }
  ]
}

Rules:
- Titles must be 6-14 words
- Include 1-2 emojis per title
- Optimise for ${platform} algorithm
- Rank by viralScore descending
- Make them feel authentic, not corporate`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 2, 'forge_titles');
  return json(data);
});

app.post('/forge/captions', requireAuth, requireCredits(2), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
  const vibe = body.vibe || 'Hype';
  const platform = body.platform || 'TikTok';

  // 7d cache — deterministic
  const cacheKey = await hashKey('forge_captions', desc, game, vibe, platform);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 7 * 24 * 60 * 60, async () => {
      const system = 'You are a viral gaming caption writer who knows what Nigerian teens love. Return ONLY valid JSON.';
      const prompt = `Write 6 viral captions for this gaming clip:
Description: "${desc}"
Game: ${game}, Vibe: ${vibe}, Platform: ${platform}

Return JSON:
{
  "captions": [
    {
      "id": "c1",
      "text": "<caption with 1-2 emojis, under 120 chars>",
      "vibe": "${vibe}",
      "viralScore": <70-99>,
      "votes": 0
    }
  ]
}

Rules:
- Mix conversational tone with hype
- Include comment bait (ask viewers to react)
- Reference Nigerian gaming culture where natural
- No corporate language`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 2, 'forge_captions');
  return json(data);
});

app.post('/forge/hashtags', requireAuth, requireCredits(2), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
  const platform = body.platform || 'TikTok';

  // 7d cache
  const cacheKey = await hashKey('forge_hashtags', desc, game, platform);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 7 * 24 * 60 * 60, async () => {
      const system = 'You are a hashtag strategist for gaming creators. Return ONLY valid JSON.';
      const prompt = `Generate the perfect hashtag set for:
Description: "${desc}", Game: ${game}, Platform: ${platform}

Return JSON: {"hashtags": ["#tag1", "#tag2", ...]}

Requirements:
- 14-18 total hashtags
- First 3: mega tags (100M+ posts) — platform general
- Next 5: mid-tier (1M-100M posts) — gaming specific
- Last 6-10: niche (under 1M) — game specific + Nigerian gaming
- Include #naijagamer and #gamingafrica
- All lowercase, no spaces`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 2, 'forge_hashtags');
  return json(data);
});

app.post('/forge/hooks', requireAuth, requireCredits(2), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';

  // 7d cache
  const cacheKey = await hashKey('forge_hooks', desc, game);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 7 * 24 * 60 * 60, async () => {
      const system = 'You are a viral short-form video scriptwriter. Return ONLY valid JSON.';
      const prompt = `Write 8 killer opening hook lines for this ${game} gaming clip:
"${desc}"

Return JSON: {"hooks": ["hook1", "hook2", ...]}

Rules:
- Each hook is 1-2 sentences max
- Must stop the scroll in under 2 seconds
- Mix formats: POV, question, statement, challenge
- Optimised for TikTok/Reels viewer psychology
- Reference ${game} naturally`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 2, 'forge_hooks');
  return json(data);
});

// ─── ClipBot ─────────────────────────────────────────────────────────────────
app.post('/clipbot', requireAuth, requireCredits(1), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const profile = c.get('profile') as Profile;
  const body = await c.req.json().catch(() => ({}));
  const message = (body.message || '').toString();
  const history = Array.isArray(body.history) ? body.history : [];
  if (!message) return json({ error: 'No message' }, 400);

  const plan = profile.plan || 'free';
  const dailyLimit = (PLAN_FEATURES[plan] || PLAN_FEATURES.free).clipbot_daily_limit;
  if (dailyLimit > 0) {
    const cutoff = new Date().toISOString();
    const usedToday = await sbHead(env, `clipbot_history?user_id=eq.${userId}&created_at=lt.${cutoff}&select=id`);
    if (usedToday >= dailyLimit) {
      return json({
        error: 'Daily message limit reached',
        limit: dailyLimit, used: usedToday,
        upgrade_required: true,
        plan_required: true,
      }, 402);
    }
  }

  try {
    const msgs: any[] = [{ role: 'system', content: CLIPBOT_SYSTEM }];
    for (const h of history.slice(-8)) msgs.push({ role: h.role, content: h.content });
    msgs.push({ role: 'user', content: message });
    const reply = await llmChat(env, msgs, { max_tokens: 600, temperature: 0.9 });

    for (const [role, content] of [['user', message], ['assistant', reply]] as const) {
      await sbFetch(env, 'clipbot_history', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, role, content }),
      });
    }
    await awardXp(env, userId, 'chat_message', XP_REWARDS.chat_message);
    const creditsRemaining = await spendCredits(env, userId, 1, 'clipbot_message');
    return json({ reply, credits_remaining: creditsRemaining });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.get('/clipbot/history', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const rows = await sbFetch<any[]>(env, `clipbot_history?user_id=eq.${userId}&order=created_at.desc&limit=50&select=role,content,created_at`);
  if (!rows) return json({ history: [] });
  rows.reverse();
  return json({ history: rows });
});

// ─── Trends (5 platforms) ────────────────────────────────────────────────────
async function ytTrending(env: Env, game: string, max = 10): Promise<any[]> {
  if (!env.YOUTUBE_API_KEY) return [];
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(game + ' gaming highlights')}&type=video&videoDuration=short&order=viewCount&maxResults=${max}&key=${env.YOUTUBE_API_KEY}&regionCode=NG`);
    if (!r.ok) return [];
    const data = (await r.json()) as any;
    const items = data.items || [];
    if (!items.length) return [];

    // Fetch view counts in one batched call — search.list doesn't include
    // statistics. videos.list?part=statistics&id=...&id=... returns them.
    // Used by the dashboard's "Trending Views" chart.
    const videoIds = items.map((it: any) => it.id?.videoId || it.id).filter(Boolean).join(',');
    if (videoIds) {
      try {
        const sr = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds}&key=${env.YOUTUBE_API_KEY}`);
        if (sr.ok) {
          const sdata = (await sr.json()) as any;
          const viewMap: Record<string, number> = {};
          for (const v of (sdata.items || [])) {
            viewMap[v.id] = parseInt(v.statistics?.viewCount || '0', 10) || 0;
          }
          // Attach viewCount to each search item
          for (const it of items) {
            const vid = it.id?.videoId || it.id;
            (it as any).viewCount = viewMap[vid] || 0;
          }
        }
      } catch {
        // Stats fetch failed — items still have everything else, just no viewCount
      }
    }
    return items;
  } catch {
    return [];
  }
}

async function redditTop(env: Env, game: string, limit = 8): Promise<any[]> {
  // Reddit's `.json` endpoint blocks datacenter IPs with 403. The `.rss`
  // (Atom) feed is more permissive and works keyless from Cloudflare Workers.
  // We lose the score field (RSS doesn't include upvotes), but the title +
  // permalink + subreddit are enough for the Groq trend synthesizer.
  //
  // Reddit aggressively rate-limits unauthenticated requests (~10s between
  // requests per IP). We use Cloudflare's Cache API (caches.default) to cache
  // responses for 90 seconds, so repeat /trends calls within that window don't
  // re-hit Reddit. We also only fetch ONE subreddit per call (not 2) to halve
  // the request count.
  const key = (game || 'all').toLowerCase().trim();
  const subs = GAME_SUBREDDITS[key] || GAME_SUBREDDITS.all;
  const ua = env.REDDIT_USER_AGENT
    || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 ClipAI/2.0';
  const cacheKey = new Request(`https://cache.clipai.local/reddit/${key}/${limit}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    try {
      const out = await cached.json();
      if (Array.isArray(out) && out.length > 0) return out;
    } catch {}
  }
  const out: any[] = [];
  // Only fetch the FIRST subreddit to halve request volume. The cache above
  // makes this cheap on repeat calls.
  for (const subName of subs.slice(0, 1)) {
    try {
      const url = `https://www.reddit.com/r/${subName}/top/.rss?t=day&limit=${limit}`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (!r.ok) continue;
      const xml = await r.text();
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let m: RegExpExecArray | null;
      while ((m = entryRegex.exec(xml)) !== null) {
        const block = m[1];
        const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
        const linkMatch = block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/);
        if (!titleMatch) continue;
        const title = decodeXmlEntities(titleMatch[1].trim());
        const linkUrl = linkMatch ? linkMatch[1] : '';
        out.push({
          title,
          score: 0,
          url: linkUrl,
          subreddit: subName,
          platform: 'reddit',
        });
        if (out.length >= limit) break;
      }
    } catch (e) {
      console.warn(`redditTop: r/${subName} threw:`, e);
    }
  }
  // Cache for 90 seconds. Reddit returns new "top of day" content slowly,
  // so 90s is a good balance between freshness and rate-limit safety.
  if (out.length > 0) {
    try {
      await cache.put(cacheKey, new Response(JSON.stringify(out), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=90' },
      }));
    } catch {}
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');
}

// ─── Google Trends (layered fallback) ─────────────────────────────────────────
// Three strategies, all returning the same shape { title, value, platform }:
//   Layer 1: explore → widgetdata/related_searches  (most game-specific; pytrends pattern)
//   Layer 2: Google News RSS (geo=NG)               (real-time gaming news headlines)
//   Layer 3: Serper.dev /news           (optional — uses SERPER_API_KEY quota, high quality)
//
// As of 2026, Google deprecated the trends.google.com /api/dailytrends endpoint
// (returns 404 for all geos), and the /api/explore endpoint is heavily rate-
// limited against datacenter IPs (429). Layer 2 (Google News RSS) is the most
// reliable keyless signal we have — it gives us real gaming news headlines from
// Google's index, geo-targeted to Nigeria (our primary audience).
function stripTrendsPrefix(text: string): string {
  // Google Trends API responses start with )]}'  (XSSI protection)
  return text.replace(/^\)\]\}'\s*\n?/, '');
}

function watDateString(): string {
  // Compute yesterday's date in WAT (UTC+1) as YYYYMMDD.
  const now = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const wat = new Date(now.getTime() + 60 * 60 * 1000);
  return wat.toISOString().slice(0, 10).replace(/-/g, '');
}

async function googleTrendsRelated(env: Env, game: string, limit: number): Promise<any[]> {
  const kw = (game && game.toLowerCase() !== 'all') ? `${game} gaming` : 'gaming';
  const exploreReq = JSON.stringify({
    comparisonItem: [{ keyword: kw, geo: '', time: 'now 7-d' }],
    category: 833, // Games
    property: '',
  });
  const exploreUrl = `https://trends.google.com/trends/api/explore?hl=en-US&tz=60&req=${encodeURIComponent(exploreReq)}`;
  const r1 = await fetch(exploreUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipAI-TrendRadar/2.0)' } });
  if (!r1.ok) return [];
  const json1 = JSON.parse(stripTrendsPrefix(await r1.text()));
  const widgets = json1.widgets || [];
  const relatedWidget = widgets.find((w: any) => w.id === 'RELATED_QUERIES');
  if (!relatedWidget) return [];

  const req2 = JSON.stringify({
    restriction: { geo: {}, time: 'now 7-d', originalTimeRangeForExploreUrl: 'now 7-d' },
    keyword: kw,
    metric: ['TOP', 'RISING'],
    language: 'en',
  });
  const r2 = await fetch(
    `https://trends.google.com/trends/api/widgetdata/related_searches?hl=en-US&tz=60&req=${encodeURIComponent(req2)}&token=${relatedWidget.token}`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipAI-TrendRadar/2.0)' } },
  );
  if (!r2.ok) return [];
  const json2 = JSON.parse(stripTrendsPrefix(await r2.text()));
  const ranked = (json2.default?.rankedList || []).flatMap((rl: any) => rl.rankedKeyword || []);
  const out: any[] = [];
  for (const r of ranked.slice(0, limit)) {
    const value = typeof r.value === 'number'
      ? r.value
      : parseInt(String(r.formattedValue || '0').replace(/\D/g, ''), 10) || 0;
    out.push({ title: r.query || r.topic?.title || '', value, platform: 'google_trends', layer: 'related_searches' });
  }
  return out;
}

async function googleTrendsNews(env: Env, game: string, limit: number): Promise<any[]> {
  // Layer 2 strategy: try Google News RSS (geo=NG) first, then Bing News RSS
  // as fallback. Google News is more geo-targeted but blocks datacenter IPs
  // with 503 ("unusual traffic"). Bing News is more permissive but worldwide.
  const kw = (game && game.toLowerCase() !== 'all') ? `${game} gaming` : 'gaming';
  const ua = 'Mozilla/5.0 (compatible; ClipAI-TrendRadar/2.0)';

  // Try 1: Google News RSS
  try {
    const r = await fetch(
      `https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=en-US&gl=NG&ceid=NG:en`,
      { headers: { 'User-Agent': ua }, redirect: 'follow' },
    );
    if (r.ok) {
      const xml = await r.text();
      const items = parseNewsRssItems(xml, 'google_news_rss', 'NG');
      if (items.length > 0) return items.slice(0, limit);
    }
  } catch (e) {
    console.warn('googleTrendsNews: Google News RSS failed:', e);
  }

  // Try 2: Bing News RSS
  try {
    const r = await fetch(
      `https://www.bing.com/news/search?q=${encodeURIComponent(kw)}&format=rss`,
      { headers: { 'User-Agent': ua } },
    );
    if (r.ok) {
      const xml = await r.text();
      const items = parseNewsRssItems(xml, 'bing_news_rss', 'WW');
      if (items.length > 0) return items.slice(0, limit);
    }
  } catch (e) {
    console.warn('googleTrendsNews: Bing News RSS failed:', e);
  }

  return [];
}

function parseNewsRssItems(xml: string, layer: string, region: string): any[] {
  // Both Google News and Bing News use the standard RSS 2.0 <item> shape.
  // Google News titles look like "Headline - Source", Bing titles are just "Headline".
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const out: any[] = [];
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml))) {
    const block = m[1];
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const pubMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    if (!titleMatch) continue;
    const raw = decodeXmlEntities(titleMatch[1].trim());
    const dashIdx = raw.lastIndexOf(' - ');
    const headline = dashIdx > 0 ? raw.slice(0, dashIdx) : raw;
    const source = dashIdx > 0 ? raw.slice(dashIdx + 3) : '';
    const pubDate = pubMatch ? new Date(pubMatch[1].trim()).getTime() : Date.now();
    // Recency score: 100 for items <6h old, decaying to 0 over 48h.
    const ageHours = (Date.now() - pubDate) / (60 * 60 * 1000);
    const recency = Math.max(0, Math.round(100 * (1 - ageHours / 48)));
    out.push({
      title: headline,
      value: recency,
      source,
      platform: 'google_trends',
      layer,
      region,
      publishedAt: pubMatch ? pubMatch[1].trim() : '',
    });
  }
  return out;
}

async function googleTrendsSerper(env: Env, game: string, limit: number): Promise<any[]> {
  // Serper.dev /news — high-quality, geo-targeted, no RSS parsing needed.
  // Replaces the old SerpAPI google_trends engine (10x cheaper, more reliable).
  const kw = (game && game.toLowerCase() !== 'all') ? `${game} gaming esports` : 'gaming esports';
  const r = await fetch('https://google.serper.dev/news', {
    method: 'POST',
    headers: {
      'X-API-KEY': env.SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: kw, gl: 'ng', hl: 'en', num: limit + 4 }),
  });
  if (!r.ok) return [];
  const data = (await r.json()) as any;
  const stories = data.news || [];
  return stories.slice(0, limit).map((s: any) => ({
    title: s.title || '',
    value: 50,   // Serper doesn't expose growth %; use stable midpoint
    platform: 'google_trends',
    layer: 'serper_news',
    source: s.source || '',
    url: s.link || s.url || '',
    publishedAt: s.date || '',
  }));
}

async function googleTrends(env: Env, game: string, limit = 6): Promise<any[]> {
  // Layer 1: explore → related_searches (most specific to the game; often 429'd)
  try {
    const related = await googleTrendsRelated(env, game, limit);
    if (related.length > 0) return related;
    console.warn('Google Trends layer 1 (related_searches) returned 0 results — falling through');
  } catch (e) {
    console.warn('Google Trends layer 1 (related_searches) failed:', e);
  }

  // Layer 2: Google News RSS (NG) — stable, real-time, geo-targeted
  try {
    const news = await googleTrendsNews(env, game, limit);
    if (news.length > 0) return news;
    console.warn('Google Trends layer 2 (google news rss) returned 0 results — falling through');
  } catch (e) {
    console.warn('Google Trends layer 2 (google news rss) failed:', e);
  }

  // Layer 3: Serper.dev /news (only if SERPER_API_KEY configured)
  if (env.SERPER_API_KEY) {
    try {
      const serper = await googleTrendsSerper(env, game, limit);
      if (serper.length > 0) return serper;
      console.warn('Google Trends layer 3 (Serper /news) returned 0 results — falling through');
    } catch (e) {
      console.warn('Google Trends layer 3 (Serper /news) failed:', e);
    }
  }

  console.warn('Google Trends: all layers exhausted, returning []');
  return [];
}

// Serper.dev /search — used for TikTok and Twitter/X data without paying for
// native APIs. We use site: queries (site:tiktok.com, site:x.com) to scope
// Google's index to each platform. ~$0.001 per search vs $0.01 for SerpAPI.
async function serperSearch(env: Env, query: string, num = 10, tbs?: string): Promise<any[]> {
  if (!env.SERPER_API_KEY) return [];
  try {
    const body: Record<string, any> = { q: query, gl: 'ng', hl: 'en', num };
    if (tbs) body.tbs = tbs;
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as any;
    return data.organic || [];
  } catch {
    return [];
  }
}

async function serpTiktok(env: Env, game: string, limit = 6): Promise<any[]> {
  // Use Google's index via Serper — site:tiktok.com scopes to TikTok videos only.
  const q = (game && game.toLowerCase() !== 'all')
    ? `site:tiktok.com ${game} gaming viral`
    : 'site:tiktok.com gaming viral 2026';
  const raw = await serperSearch(env, q, limit + 4);
  return raw.slice(0, limit).map((v: any) => ({
    title: v.title || '',
    views: 0,   // Serper doesn't expose play counts
    author: '', // TikTok author is in the URL path, not the search result
    url: v.link || '',
    platform: 'tiktok',
  }));
}

async function serpTwitter(env: Env, game: string, limit = 6): Promise<any[]> {
  // Use Google's index via Serper — site:x.com scopes to Twitter/X posts.
  const q = (game && game.toLowerCase() !== 'all')
    ? `site:x.com ${game} gaming clips`
    : 'site:x.com gaming clips viral 2026';
  const raw = await serperSearch(env, q, limit + 4);
  return raw.slice(0, limit).map((t: any) => ({
    title: t.title || '',
    views: 0,
    author: '',
    url: t.link || '',
    platform: 'twitter',
  }));
}

async function serpInstagram(env: Env, game: string, limit = 4): Promise<any[]> {
  // Use Google's index via Serper — site:instagram.com/reels scopes to IG Reels.
  // Instagram doesn't expose public play counts, so we set views=0 (UI handles
  // null/0 by hiding the chart bar for that video).
  const q = (game && game.toLowerCase() !== 'all')
    ? `site:instagram.com/reels ${game} gaming`
    : 'site:instagram.com/reels gaming viral 2026';
  const raw = await serperSearch(env, q, limit + 4);
  return raw.slice(0, limit).map((v: any) => {
    const url = v.link || '';
    // instagram.com/reels/<shortcode>/ or instagram.com/p/<shortcode>/
    // Author is often in the page title: "Username on Instagram: ..."
    const titleParts = (v.title || '').split(' on Instagram');
    const author = titleParts.length > 1 ? titleParts[0].trim() : 'Instagram creator';
    return {
      title: v.title || 'Instagram Reel',
      views: 0,
      author,
      url,
      platform: 'instagram',
    };
  });
}

// ─── Gaming News / Dev Tweets / Reddit (Dashboard enrichment) ────────────────
// Three sources, fetched in parallel, cached 2h globally:
//   1. NEWS  — official gaming journalism (IGN, Polygon, Eurogamer, Kotaku,
//              GameSpot, Rock Paper Shotgun, PC Gamer) via Serper.dev web search
//              scoped to the user's game. We exclude site:reddit.com and
//              site:tiktok.com to keep it to articles, not social posts.
//   2. TWEETS — official game-dev accounts via Serper.dev Twitter search.
//               We hard-code the official @-handles per game so we always get
//               the publisher's voice (not random gamers tweeting about it).
//   3. REDDIT — top posts from r/gaming + the game's dedicated subreddit
//               (reuses the existing redditTop function — RSS-based, keyless).

// Official game → Twitter @-handles for the dev accounts we want to surface.
// Sourced from each publisher's verified primary account. NULL = use generic
// gaming search (no official dev account or game not in the map).
const GAME_DEV_TWITTERS: Record<string, string[]> = {
  valorant:        ['@valorant', '@playvalorant'],
  'call of duty':  ['@callofduty'],
  warzone:         ['@callofduty'],
  cod:             ['@callofduty'],
  fortnite:        ['@fortnitegame', '@fortnitestatus'],
  apex:            ['@playapex'],
  'apex legends':  ['@playapex'],
  minecraft:       ['@minecraft', '@minecraftnet'],
  roblox:          ['@roblox', '@robloxtc'],
  'free fire':     ['@freefirebr', '@garenafreefire'],
  'free fire max': ['@freefirebr', '@garenafreefire'],
  pubg:            ['@pubg', '@pubghelp'],
  'pubg mobile':   ['@pubgmobile', '@pubgm_sports'],
  'mobile legends':['@mobilelegendsgame', '@mlbbdev'],
  mlbb:            ['@mobilelegendsgame', '@mlbbdev'],
  fifa:            ['@easportsfifa'],
  'ea fc':         ['@easportsfc'],
  'ea fc 25':      ['@easportsfc'],
  'grand theft auto': ['@rockstargames'],
  gta:             ['@rockstargames'],
  'gta v':         ['@rockstargames'],
  'gta 6':         ['@rockstargames'],
  genshin:         ['@genshinimpact'],
  'genshin impact':['@genshinimpact'],
  'league of legends': ['@leagueoflegends', '@riotgames'],
  lol:             ['@leagueoflegends', '@riotgames'],
  'counter-strike':['@csgo', '@cs2dev'],
  cs2:             ['@csgo', '@cs2dev'],
  csgo:            ['@csgo', '@cs2dev'],
  dota:            ['@dota2', '@wykrhm'],
  'dota 2':        ['@dota2'],
  overwatch:       ['@playoverwatch', '@overwatchbeta'],
  rocket:          ['@rocketleague'],
  'rocket league': ['@rocketleague'],
  destiny:         ['@destinythegame', '@bungie'],
  'destiny 2':     ['@destinythegame', '@bungie'],
  warcraft:        ['@warcraft', '@blizzardent'],
  'world of warcraft': ['@warcraft', '@blizzardent'],
  wow:             ['@warcraft', '@blizzardent'],
  hearthstone:     ['@playhearthstone'],
};

// Trusted gaming-news domains we surface in the NEWS section. Serper.dev gives
// us the title + URL + snippet; we filter to these domains so the dashboard
// only shows reputable journalism (no SEO spam).
const GAMING_NEWS_DOMAINS = new Set([
  // Major gaming journalism
  'ign.com', 'www.ign.com',
  'polygon.com', 'www.polygon.com',
  'eurogamer.net', 'www.eurogamer.net',
  'kotaku.com', 'www.kotaku.com',
  'gamespot.com', 'www.gamespot.com',
  'rockpapershotgun.com', 'www.rockpapershotgun.com',
  'pcgamer.com', 'www.pcgamer.com',
  'vg247.com', 'www.vg247.com',
  'pushsquare.com', 'www.pushsquare.com',
  'nintendolife.com', 'www.nintendolife.com',
  'purexbox.com', 'www.purexbox.com',
  'thegamer.com', 'www.thegamer.com',
  'comicbook.com', 'www.comicbook.com',
  'screenrant.com', 'www.screenrant.com',
  'gamerant.com', 'www.gamerant.com',
  'insider-gaming.com', 'www.insider-gaming.com',
  // Esports / competitive
  'dexerto.com', 'www.dexerto.com',
  'esports.com', 'www.esports.com',
  'dotesports.com', 'www.dotesports.com',
  'win.gg', 'www.win.gg',
  'vlr.gg', 'www.vlr.gg',                     // Valorant esports
  'liquipedia.net', 'www.liquipedia.net',     // Esports wikis
  'hltv.org', 'www.hltv.org',                  // CS esports
  'op.gg', 'www.op.gg',                       // LoL stats
  // Publisher / official game sites
  'playvalorant.com', 'valorant.com',
  'playoverwatch.com', 'overwatch.blizzard.com',
  'worldofwarcraft.com', 'worldofwarcraft.blizzard.com',
  'dota2.com', 'www.dota2.com',
  'leagueoflegends.com', 'www.leagueoflegends.com',
  'fortnite.com', 'www.fortnite.com',
  'ea.com', 'www.ea.com',
  'rockstargames.com', 'www.rockstargames.com',
  'news.xbox.com', 'news.xbox.com',
  'blog.playstation.com', 'blog.playstation.com',
  'nintendo.com', 'www.nintendo.com',
  // Tools / community coverage
  'blitz.gg', 'www.blitz.gg',
  'mobalytics.gg', 'www.mobalytics.gg',
  'tracker.gg', 'www.tracker.gg',
]);

/** Fetch gaming news articles for a specific game via Serper.dev web search.
 *  Filters to trusted domains only (IGN, Polygon, etc.) so we never surface
 *  SEO spam. Returns at most `limit` items, most recent first.
 *
 *  Time filter strategy: try `tbs=qdr:w` (past week) first. If that yields
 *  fewer than `limit` trusted-domain hits, retry without the time filter —
 *  game-specific queries (e.g. "valorant patch notes news update") often
 *  have no trusted-domain coverage in the past week, but plenty of evergreen
 *  articles that are still worth surfacing on the dashboard. */
async function fetchGamingNews(env: Env, game: string, limit = 8): Promise<any[]> {
  const gameLabel = (game || 'gaming').toLowerCase();
  const q = gameLabel === 'gaming' || gameLabel === 'all'
    ? 'gaming news patch notes update'
    : `${gameLabel} patch notes news update`;

  const filterTrusted = (raw: any[]) => raw.filter((r: any) => {
    if (!r.link) return false;
    try {
      const host = new URL(r.link).hostname.toLowerCase();
      return GAMING_NEWS_DOMAINS.has(host);
    } catch {
      return false;
    }
  });

  const mapToNews = (filtered: any[]) => filtered.slice(0, limit).map((r: any) => {
    let host = '';
    try { host = new URL(r.link).hostname.replace(/^www\./, ''); } catch {}
    return {
      title: r.title || 'Untitled',
      snippet: r.snippet || '',
      url: r.link,
      source: host,
      date: r.date || '',
    };
  });

  // 1. Try past-week filter first — prefer fresh news.
  const weekRaw = await serperSearch(env, q, limit * 4, 'qdr:w');
  const weekFiltered = filterTrusted(weekRaw);
  if (weekFiltered.length >= Math.min(limit, 3)) {
    return mapToNews(weekFiltered);
  }

  // 2. Fallback: no time filter — evergreen articles from trusted domains.
  const allRaw = await serperSearch(env, q, limit * 4);
  const allFiltered = filterTrusted(allRaw);
  // Merge & dedupe by URL (week-first, then evergreen fillers).
  const seen = new Set<string>();
  const merged = [...weekFiltered, ...allFiltered].filter((r: any) => {
    if (seen.has(r.link)) return false;
    seen.add(r.link);
    return true;
  });
  return mapToNews(merged);
}

/** Fetch recent tweets from official game-dev accounts for a given game.
 *  Uses Serper.dev's web search scoped to each dev account's Twitter URL path
 *  (x.com/<handle>/status/). This is more reliable than the `from:` operator,
 *  which Serper treats as a keyword search rather than a Twitter-native filter.
 *  Returns at most `limit` items, most recent first. */
async function fetchDevTweets(env: Env, game: string, limit = 6): Promise<any[]> {
  const gameLabel = (game || 'gaming').toLowerCase();
  const handles = GAME_DEV_TWITTERS[gameLabel];
  if (!handles || handles.length === 0) return [];
  // Build a query like: site:x.com/valorant/status OR site:x.com/playvalorant/status
  // This scopes results to tweets FROM those specific accounts.
  const siteClauses = handles
    .map(h => `site:x.com/${h.replace('@', '')}/status`)
    .join(' OR ');
  const q = siteClauses;
  const raw = await serperSearch(env, q, limit + 2);
  return raw.slice(0, limit).map((t: any) => {
    const url = t.link || '';
    // Extract @username from URL: x.com/username/status/123
    const authorMatch = url.match(/x\.com\/([^/?]+)\/status/i);
    const author = authorMatch ? `@${authorMatch[1]}` : (handles[0] || '@dev');
    return {
      title: t.title || '',
      snippet: t.snippet || '',
      url,
      author,
      date: t.date || '',
    };
  });
}

/** Fetch top Reddit posts for a game (reuses the existing redditTop function
 *  which uses the .rss endpoint — keyless, works from Cloudflare Workers). */
async function fetchRedditPosts(env: Env, game: string, limit = 5): Promise<any[]> {
  const items = await redditTop(env, game, limit);
  return items.map((it: any) => ({
    title: it.title || 'Reddit post',
    url: it.url || '',
    subreddit: it.subreddit || `r/${(game || 'gaming').toLowerCase()}`,
    author: it.author || '',
    publishedAt: it.publishedAt || '',
  }));
}


// ─── Channel Audit helpers ───────────────────────────────────────────────────
// Powers the "Free Channel Audit" flow: user pastes a YouTube/TikTok/X/IG
// channel URL, we fetch real analytics where available and return a rich audit
// object. YouTube has a real Data API (subscribers, total views, recent uploads
// with per-video view counts). TikTok/X/IG don't expose public APIs, so we fall
// back to Serper to surface recent posts only (no follower counts).
type AuditPlatform = 'youtube' | 'tiktok' | 'twitter' | 'instagram' | 'reddit';

/** Detect the audit platform from a URL or bare username.
 *  Accepts full URLs (youtube.com/@MrBeast) or bare usernames with optional
 *  platform prefix: "@MrBeast", "tt:khaby.lame", "ig:keke", "x:elonmusk",
 *  "reddit:spez", "youtube.com/@MrBeast", etc. Returns the platform + the
 *  normalised URL (constructed from username if input was bare). */
function detectPlatform(url: string): AuditPlatform | null {
  const u = (url || '').toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('x.com') || u.includes('twitter.com')) return 'twitter';
  if (u.includes('reddit.com') || u.includes('redd.it')) return 'reddit';
  return null;
}

/** Normalises a user input into a full URL the audit functions can parse.
 *  Supports:
 *    - Full URLs:        "https://youtube.com/@MrBeast"      → returned as-is
 *    - Bare usernames:   "@MrBeast"                          → requires `platformHint`
 *    - Platform prefix:  "yt:MrBeast" / "tt:khaby.lame" / "ig:keke" /
 *                        "x:elonmusk" / "r:spez" / "rdt:spez"  → prefix extracted
 *    - With @:           "@MrBeast" + platformHint='youtube' → youtube.com/@MrBeast
 *  Returns the normalised URL or null if we can't safely resolve it. */
function normaliseAuditInput(raw: string, platformHint?: string): { url: string; platform: AuditPlatform } | null {
  const s = (raw || '').trim();
  if (!s) return null;

  // ─── Canonicalise URL-form input ──────────────────────────────────────────
  // Previously we returned the URL as-is, which meant "https://www.youtube.com/@MrBeast"
  // and "https://youtube.com/@MrBeast" and "youtube.com/@MrBeast" all produced DIFFERENT
  // cache keys. The user could audit the same channel via three different URL strings
  // and never hit the cache. This is the root cause of the "audit is not caching" bug.
  //
  // Now: parse the URL, strip "www.", lowercase the host, and re-emit a canonical URL.
  // This guarantees the same channel always produces the same cache key.
  if (/^https?:\/\//i.test(s) || /^(?:www\.)?(youtube|tiktok|instagram|x|twitter|reddit)\.com\//i.test(s)) {
    const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
    try {
      const u = new URL(withProto);
      u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
      // All supported platforms force HTTPS redirects — normalise http → https
      // so the same channel always produces the same cache key regardless of
      // which protocol the user typed.
      u.protocol = 'https:';
      // Drop tracking query params (utm_*, fbclid, gclid, ref, etc.) — these
      // vary per visit but reference the same channel, so they shouldn't
      // fragment the cache.
      const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
                              'utm_content', 'fbclid', 'gclid', 'ref', 'igshid', 'si'];
      trackingParams.forEach(p => u.searchParams.delete(p));
      let path = u.pathname.replace(/\/+$/, '') || '/';
      const canonical = `${u.protocol}//${u.hostname}${path}${u.search}`;
      const platform = detectPlatform(canonical);
      return platform ? { url: canonical, platform } : null;
    } catch {
      // Fall through to bare-username handling
    }
  }

  // Strip leading @ for bare username handling
  let username = s.replace(/^@+/, '');
  let platform: AuditPlatform | null = null;

  // Check for platform prefix: "yt:name", "tt:name", "ig:name", "x:name", "r:name", "rdt:name"
  const prefixMatch = username.match(/^(yt|tt|ig|tw|x|rdt|r|reddit):(.+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    username = prefixMatch[2].trim().replace(/^@+/, '');
    if (prefix === 'yt') platform = 'youtube';
    else if (prefix === 'tt') platform = 'tiktok';
    else if (prefix === 'ig') platform = 'instagram';
    else if (prefix === 'tw' || prefix === 'x') platform = 'twitter';
    else if (prefix === 'r' || prefix === 'rdt' || prefix === 'reddit') platform = 'reddit';
  }

  // If no prefix matched, use the platformHint from the request body
  if (!platform && platformHint) {
    const hint = platformHint.toLowerCase();
    if (hint === 'youtube' || hint === 'yt') platform = 'youtube';
    else if (hint === 'tiktok' || hint === 'tt') platform = 'tiktok';
    else if (hint === 'instagram' || hint === 'ig') platform = 'instagram';
    else if (hint === 'twitter' || hint === 'x' || hint === 'tw') platform = 'twitter';
    else if (hint === 'reddit' || hint === 'r' || hint === 'rdt') platform = 'reddit';
  }

  if (!platform || !username) return null;

  // Construct the canonical URL for the platform
  switch (platform) {
    case 'youtube':   return { url: `https://youtube.com/@${username}`, platform };
    case 'tiktok':    return { url: `https://www.tiktok.com/@${username}`, platform };
    case 'instagram': return { url: `https://www.instagram.com/${username}`, platform };
    case 'twitter':   return { url: `https://x.com/${username}`, platform };
    case 'reddit':    return { url: `https://www.reddit.com/user/${username}`, platform };
  }
  return null;
}

/** Parse any YouTube channel URL or bare handle into a resolvable identifier. */
function parseYouTubeChannelInput(raw: string): {
  channelId?: string; handle?: string; customName?: string;
} {
  const s = raw.trim();
  let m = s.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})/);
  if (m) return { channelId: m[1] };
  m = s.match(/youtube\.com\/@([A-Za-z0-9_.\-]+)/);
  if (m) return { handle: '@' + m[1] };
  m = s.match(/youtube\.com\/(?:c|user)\/([A-Za-z0-9_.\-]+)/);
  if (m) return { customName: m[1] };
  if (/^@[A-Za-z0-9_.\-]+$/.test(s)) return { handle: s };
  if (/^UC[A-Za-z0-9_-]{22}$/.test(s)) return { channelId: s };
  return {};
}

/** Pick the best TikTok thumbnail URL from an aweme's `video` object.
 *  TikTok's CDN serves multiple cover variants with different formats:
 *    - `cover`              : HEIC format — Safari-only, broken in Chrome/Firefox
 *    - `origin_cover`       : HEIC format — same problem
 *    - `dynamic_cover`      : WebP format — universally renderable (animated)
 *    - `animated_cover`     : WebP format — universally renderable (animated)
 *    - `ai_dynamic_cover`   : WebP format — universally renderable (AI animated)
 *  Sociavault returns `url_list` as a JSON OBJECT {"0":"url1","1":"url2"} instead
 *  of an array, so we use Object.values() to safely handle both shapes. */
function pickTikTokThumb(video: any): string {
  if (!video || typeof video !== 'object') return '';
  // Priority: WebP variants first (universal), then HEIC as last resort
  const fields = ['dynamic_cover', 'animated_cover', 'ai_dynamic_cover', 'cover', 'origin_cover'];
  for (const field of fields) {
    const node = video[field];
    if (!node || typeof node !== 'object') continue;
    const ul = node.url_list;
    if (Array.isArray(ul) && ul.length > 0 && typeof ul[0] === 'string') return ul[0];
    if (ul && typeof ul === 'object') {
      const vals = Object.values(ul as Record<string, string>);
      if (vals.length > 0 && typeof vals[0] === 'string') return vals[0];
    }
    if (typeof node.url === 'string' && node.url) return node.url;
  }
  // Also check top-level `cover` field on the aweme itself
  const topCover = video.cover;
  if (topCover && typeof topCover === 'object') {
    const ul = topCover.url_list;
    if (Array.isArray(ul) && ul.length > 0 && typeof ul[0] === 'string') return ul[0];
    if (ul && typeof ul === 'object') {
      const vals = Object.values(ul as Record<string, string>);
      if (vals.length > 0 && typeof vals[0] === 'string') return vals[0];
    }
  }
  return '';
}

/** Pick the best Instagram thumbnail URL from a media node.
 *  Sociavault returns IG posts with `display_uri` (top-level URL string) plus
 *  `image_versions2.candidates` as a JSON OBJECT {"0":{url,width,height},...}.
 *  We try `display_uri` first (simplest), then fall back to the candidates. */
function pickInstagramThumb(node: any): string {
  if (!node || typeof node !== 'object') return '';
  // Direct URL strings (Sociavault-specific top-level fields)
  if (typeof node.display_uri === 'string' && node.display_uri) return node.display_uri;
  if (typeof node.thumbnail_url === 'string' && node.thumbnail_url) return node.thumbnail_url;
  if (typeof node.display_url === 'string' && node.display_url) return node.display_url;
  if (typeof node.thumbnail_src === 'string' && node.thumbnail_src) return node.thumbnail_src;
  // image_versions2.candidates (Instagram Graph API shape)
  const iv2 = node.image_versions2;
  if (iv2 && typeof iv2 === 'object') {
    const cands = iv2.candidates;
    if (Array.isArray(cands) && cands.length > 0 && cands[0]?.url) return cands[0].url;
    if (cands && typeof cands === 'object') {
      const vals = Object.values(cands as Record<string, any>);
      if (vals.length > 0 && vals[0]?.url) return vals[0].url;
    }
  }
  // carousel_media (for multi-image posts — use first item's thumbnail)
  if (Array.isArray(node.carousel_media) && node.carousel_media.length > 0) {
    const first = node.carousel_media[0];
    if (first?.image_versions2?.candidates) {
      const cands = first.image_versions2.candidates;
      if (Array.isArray(cands) && cands.length > 0 && cands[0]?.url) return cands[0].url;
      if (cands && typeof cands === 'object') {
        const vals = Object.values(cands as Record<string, any>);
        if (vals.length > 0 && vals[0]?.url) return vals[0].url;
      }
    }
  }
  return '';
}

async function auditYouTubeChannel(env: Env, raw: string): Promise<any> {
  if (!env.YOUTUBE_API_KEY) return { error: 'YouTube API key not configured', platform: 'youtube' };
  const parsed = parseYouTubeChannelInput(raw);
  if (!parsed.channelId && !parsed.handle && !parsed.customName) {
    return { error: 'Could not parse YouTube channel URL', platform: 'youtube' };
  }

  // Step 1: resolve handle/custom name → channel ID
  let channelId = parsed.channelId;
  if (!channelId && parsed.handle) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(parsed.handle)}&key=${env.YOUTUBE_API_KEY}`,
        { cf: { cacheTtl: 3600, cacheEverything: true } },
      );
      if (r.ok) {
        const d = await r.json() as any;
        channelId = d.items?.[0]?.id;
      }
    } catch {}
  }
  if (!channelId && parsed.customName) {
    // No direct API for /c/ custom names — fall back to search
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(parsed.customName)}&type=channel&maxResults=1&key=${env.YOUTUBE_API_KEY}`,
        { cf: { cacheTtl: 3600, cacheEverything: true } },
      );
      if (r.ok) {
        const d = await r.json() as any;
        channelId = d.items?.[0]?.id?.channelId;
      }
    } catch {}
  }
  if (!channelId) return { error: 'Channel not found', platform: 'youtube' };

  // Step 2: fetch channel snippet + statistics + branding
  let channelData: any = null;
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&id=${channelId}&key=${env.YOUTUBE_API_KEY}`,
      { cf: { cacheTtl: 3600, cacheEverything: true } },
    );
    if (r.ok) {
      const d = await r.json() as any;
      channelData = d.items?.[0];
    }
  } catch {}
  if (!channelData) return { error: 'Could not fetch channel data', platform: 'youtube' };

  const stats = channelData.statistics || {};
  const snippet = channelData.snippet || {};
  const branding = channelData.brandingSettings || {};

  // Step 3: fetch recent uploads via the uploads playlist (UCxxxx → UUxxxx)
  const uploadsPlaylistId = 'UU' + channelId.slice(2);
  const recentVideos: any[] = [];
  try {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&key=${env.YOUTUBE_API_KEY}`,
      { cf: { cacheTtl: 1800, cacheEverything: true } },
    );
    if (r.ok) {
      const d = await r.json() as any;
      const items = d.items || [];
      const videoIds = items.map((it: any) => it.contentDetails?.videoId).filter(Boolean);
      if (videoIds.length) {
        const vr = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet,contentDetails&id=${videoIds.join(',')}&key=${env.YOUTUBE_API_KEY}`,
          { cf: { cacheTtl: 1800, cacheEverything: true } },
        );
        if (vr.ok) {
          const vd = await vr.json() as any;
          const vmap: Record<string, any> = {};
          for (const v of (vd.items || [])) vmap[v.id] = v;
          for (const it of items) {
            const vid = it.contentDetails?.videoId;
            const v = vmap[vid];
            if (!v) continue;
            recentVideos.push({
              id: vid,
              title: v.snippet?.title || 'Untitled',
              thumbnail: v.snippet?.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
              url: `https://www.youtube.com/watch?v=${vid}`,
              publishedAt: v.snippet?.publishedAt || it.contentDetails?.videoPublishedAt || '',
              viewCount: parseInt(v.statistics?.viewCount || '0', 10) || 0,
              likeCount: parseInt(v.statistics?.likeCount || '0', 10) || 0,
              commentCount: parseInt(v.statistics?.commentCount || '0', 10) || 0,
              duration: v.contentDetails?.duration || '',
            });
          }
        }
      }
    }
  } catch {}

  // Compute engagement metrics from recent videos
  const totalRecentViews = recentVideos.reduce((s, v) => s + (v.viewCount || 0), 0);
  const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
  const totalRecentLikes = recentVideos.reduce((s, v) => s + (v.likeCount || 0), 0);
  const avgEngagementRate = totalRecentViews > 0
    ? parseFloat(((totalRecentLikes / totalRecentViews) * 100).toFixed(2))
    : 0;

  return {
    platform: 'youtube',
    channelId,
    channelName: snippet.title || 'Unknown',
    channelHandle: parsed.handle || '',
    description: snippet.description || '',
    avatar: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
    banner: branding.image?.bannerExternalUrl || '',
    country: snippet.country || '',
    publishedAt: snippet.publishedAt || '',
    statistics: {
      subscribers: parseInt(stats.subscriberCount || '0', 10) || 0,
      totalViews: parseInt(stats.viewCount || '0', 10) || 0,
      videoCount: parseInt(stats.videoCount || '0', 10) || 0,
      hiddenSubscriberCount: !!stats.hiddenSubscriberCount,
    },
    recentVideos,
    metrics: {
      avgRecentViews,
      totalRecentViews,
      avgEngagementRate,
      recentVideoCount: recentVideos.length,
    },
    auditedAt: new Date().toISOString(),
  };
}

/** TikTok audit — chain: Sociavault → ScrapeCreators → Serper (lite).
 *  Sociavault: api.sociavault.com/v1/scrape/tiktok/profile?handle=NAME  (x-api-key)
 *              api.sociavault.com/v1/scrape/tiktok/videos?handle=NAME  (x-api-key)
 *  ScrapeCreators: api.scrapecreators.com/v1/tiktok/profile?handle=NAME  (x-api-key)
 *                  api.scrapecreators.com/v1/tiktok/profile/videos?secUid=ID  (x-api-key)
 *  Both free: Sociavault (50 credits/key), ScrapeCreators (100 credits). */
async function auditTikTokProfile(env: Env, url: string): Promise<any> {
  const m = url.match(/tiktok\.com\/@?([A-Za-z0-9_.]+)/);
  const username = (m ? m[1] : '').replace(/^@/, '');
  const handle = username ? '@' + username : '';
  if (!username) return { error: 'Could not parse TikTok username from URL. Use format: tiktok.com/@username', platform: 'tiktok' };

  // ── Sociavault (primary) — TikTok profile + videos ───────────────────────────
  if (env.SOCIAVAULT_API_KEY) {
    try {
      const profileRes = await fetch(`https://api.sociavault.com/v1/scrape/tiktok/profile?handle=${encodeURIComponent(username)}`, {
        headers: { 'x-api-key': env.SOCIAVAULT_API_KEY },
      });
      // Record Sociavault credit snapshot (throttled — only probes if >5min since last probe)
      try {
        await maybeProbeAndRecordSociavaultCredits(env, env.SOCIAVAULT_API_KEY, 'primary', `audit:tiktok:${username}`);
      } catch {}
      if (profileRes.ok) {
        const profileJson = await profileRes.json() as any;
        const wrapper = profileJson?.data?.user ? profileJson.data : (profileJson?.user ? profileJson : {});
        const u = wrapper?.user || profileJson?.data?.user || profileJson?.user || {};
        const stats = wrapper?.stats || profileJson?.data?.stats || profileJson?.stats || u.statsV2 || {};
        if (u.uniqueId || u.id) {
          const channelName = u.nickname || u.uniqueId || username;
          const avatar = u.avatarLarger || u.avatarMedium || u.avatarThumb || '';
          const description = u.signature || '';
          const subscribers = Number(stats.followerCount || 0);
          const following = Number(stats.followingCount || 0);
          const totalLikes = Number(stats.heart || stats.heartCount || 0);  // heart is the safe 64-bit field; heartCount overflows on big accounts
          const videoCount = Number(stats.videoCount || 0);
          const isVerified = u.verified || false;
          const publishedAt = u.createTime ? new Date(u.createTime * 1000).toISOString() : '';
          const secUid = u.secUid || '';

          // Fetch recent videos (best-effort — don't fail the audit if this fails)
          let recentVideos: any[] = [];
          try {
            const vidsRes = await fetch(`https://api.sociavault.com/v1/scrape/tiktok/videos?handle=${encodeURIComponent(username)}&count=10`, {
              headers: { 'x-api-key': env.SOCIAVAULT_API_KEY },
            });
            if (vidsRes.ok) {
              const vidsText = await vidsRes.text();
              // Sociavault sometimes returns concatenated JSON; grab the first object
              const firstJson = vidsText.slice(0, 5_000_000).match(/^\{[\s\S]*\}(?=\n\{)/) || [vidsText];
              const vidsJson = JSON.parse(firstJson[0]) as any;
              const aweme = vidsJson?.data?.aweme_list || vidsJson?.aweme_list || vidsJson?.data?.awemeList || [];
              const list = Array.isArray(aweme) ? aweme : Object.values(aweme);
              recentVideos = list.slice(0, 10).map((v: any, i: number) => ({
                id: String(v.id || v.aweme_id || `tt_audit_${i}`),
                title: v.desc || `TikTok post ${i + 1}`,
                // TikTok's CDN serves HEIC for `cover`/`origin_cover` (Safari-only) and
                // WebP for `dynamic_cover`/`animated_cover`/`ai_dynamic_cover` (universal).
                // Prefer the WebP variants so thumbnails render in Chrome + Firefox.
                thumbnail: pickTikTokThumb(v.video || v),
                url: v.share_url || (v.id ? `https://www.tiktok.com/@${u.uniqueId || username}/video/${v.id}` : ''),
                publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : '',
                viewCount: Number(v.stats?.play_count || v.statistics?.play_count || 0),
                likeCount: Number(v.stats?.digg_count || v.statistics?.digg_count || 0),
                commentCount: Number(v.stats?.comment_count || v.statistics?.comment_count || 0),
              }));
            }
          } catch {}

          const totalRecentViews = recentVideos.reduce((s: number, v: any) => s + (v.viewCount || 0), 0);
          const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
          const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
          const avgEngagementRate = totalRecentViews > 0 ? (totalRecentLikes / totalRecentViews) * 100 : 0;

          return {
            platform: 'tiktok',
            channelId: String(u.id || ''),
            channelName,
            channelHandle: u.uniqueId ? '@' + u.uniqueId : handle,
            description,
            avatar,
            banner: '',
            country: u.region || '',
            publishedAt,
            statistics: { subscribers, totalViews: totalLikes, videoCount, hiddenSubscriberCount: false },
            recentVideos,
            metrics: { avgRecentViews, totalRecentViews, avgEngagementRate, recentVideoCount: recentVideos.length },
            auditedAt: new Date().toISOString(),
            note: isVerified ? 'Verified TikTok account.' : '',
            _source: 'sociavault',
            _secUid: secUid,
          };
        }
      }
    } catch {}
  }

  // ── ScrapeCreators (fallback) — TikTok profile + videos ──────────────────────
  if (env.SCRAPECREATORS_API_KEY) {
    try {
      const profileRes = await fetch(`https://api.scrapecreators.com/v1/tiktok/profile?handle=${encodeURIComponent(username)}`, {
        headers: { 'x-api-key': env.SCRAPECREATORS_API_KEY },
      });
      if (profileRes.ok) {
        const profileJson = await profileRes.json() as any;
        // Record ScrapeCreators credit snapshot (passive — every response includes credits_remaining)
        if (typeof profileJson?.credits_remaining === 'number') {
          try {
            await recordCreditSnapshot(env, 'scrapecreators', 'primary', {
              credits: profileJson.credits_remaining,
              last_source: `audit:tiktok:${username}`,
            });
          } catch {}
        }
        if (profileJson?.success && profileJson?.user) {
          const u = profileJson.user;
          const stats = profileJson.stats || u.statsV2 || {};
          const channelName = u.nickname || u.uniqueId || username;
          const avatar = u.avatarLarger || u.avatarMedium || u.avatarThumb || '';
          const description = u.signature || '';
          const subscribers = Number(stats.followerCount || 0);
          const following = Number(stats.followingCount || 0);
          const totalLikes = Number(stats.heart || stats.heartCount || 0);  // heart is the safe 64-bit field; heartCount overflows on big accounts
          const videoCount = Number(stats.videoCount || 0);
          const isVerified = u.verified || false;
          const publishedAt = u.createTime ? new Date(u.createTime * 1000).toISOString() : '';
          const secUid = u.secUid || '';

          // Fetch recent videos via secUid (ScrapeCreators requires secUid for /profile/videos)
          let recentVideos: any[] = [];
          if (secUid) {
            try {
              const vidsRes = await fetch(`https://api.scrapecreators.com/v1/tiktok/profile/videos?secUid=${encodeURIComponent(secUid)}&count=10`, {
                headers: { 'x-api-key': env.SCRAPECREATORS_API_KEY },
              });
              if (vidsRes.ok) {
                const vidsJson = await vidsRes.json() as any;
                const vids = vidsJson?.data?.aweme_list || vidsJson?.aweme_list || vidsJson?.data || [];
                const list = Array.isArray(vids) ? vids : Object.values(vids);
                recentVideos = list.slice(0, 10).map((v: any, i: number) => ({
                  id: String(v.id || v.aweme_id || `tt_audit_${i}`),
                  title: v.desc || `TikTok post ${i + 1}`,
                  thumbnail: pickTikTokThumb(v.video || v),
                  url: v.share_url || (v.id ? `https://www.tiktok.com/@${u.uniqueId || username}/video/${v.id}` : ''),
                  publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : '',
                  viewCount: Number(v.stats?.play_count || v.statistics?.play_count || 0),
                  likeCount: Number(v.stats?.digg_count || v.statistics?.digg_count || 0),
                  commentCount: Number(v.stats?.comment_count || v.statistics?.comment_count || 0),
                }));
              }
            } catch {}
          }

          const totalRecentViews = recentVideos.reduce((s: number, v: any) => s + (v.viewCount || 0), 0);
          const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
          const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
          const avgEngagementRate = totalRecentViews > 0 ? (totalRecentLikes / totalRecentViews) * 100 : 0;

          return {
            platform: 'tiktok',
            channelId: String(u.id || ''),
            channelName,
            channelHandle: u.uniqueId ? '@' + u.uniqueId : handle,
            description,
            avatar,
            banner: '',
            country: u.region || '',
            publishedAt,
            statistics: { subscribers, totalViews: totalLikes, videoCount, hiddenSubscriberCount: false },
            recentVideos,
            metrics: { avgRecentViews, totalRecentViews, avgEngagementRate, recentVideoCount: recentVideos.length },
            auditedAt: new Date().toISOString(),
            note: isVerified ? 'Verified TikTok account.' : '',
            _source: 'scrapecreators',
          };
        }
      }
    } catch {}
  }

  // ── Serper fallback (lite — no follower count, posts only) ───────────────────
  if (!env.SERPER_API_KEY) return { error: 'Set SOCIAVAULT_API_KEY or SCRAPECREATORS_API_KEY for full TikTok audits. Serper fallback also requires SERPER_API_KEY.', platform: 'tiktok' };
  const q = username ? `site:tiktok.com ${username}` : `site:tiktok.com ${url.split('/').pop() || ''}`;
  const raw = await serperSearch(env, q, 8);
  const recentVideos = raw.slice(0, 6).map((v: any, i: number) => ({
    id: `tt_audit_${i}`,
    title: v.title || 'TikTok post',
    thumbnail: '',
    url: v.link || '',
    publishedAt: '',
    viewCount: 0, likeCount: 0, commentCount: 0,
  }));
  return {
    platform: 'tiktok',
    channelId: '',
    channelName: username || 'TikTok creator',
    channelHandle: handle,
    description: '',
    avatar: '', banner: '', country: '', publishedAt: '',
    statistics: { subscribers: 0, totalViews: 0, videoCount: recentVideos.length, hiddenSubscriberCount: true },
    recentVideos,
    metrics: { avgRecentViews: 0, totalRecentViews: 0, avgEngagementRate: 0, recentVideoCount: recentVideos.length },
    auditedAt: new Date().toISOString(),
    note: 'Lite audit — set SOCIAVAULT_API_KEY or SCRAPECREATORS_API_KEY to see real follower counts and recent video engagement.',
  };
}

/** Instagram audit — chain: Sociavault → ScrapeCreators → Serper (lite).
 *  Sociavault: api.sociavault.com/v1/scrape/instagram/profile?handle=NAME  (x-api-key)
 *              api.sociavault.com/v1/scrape/instagram/posts?handle=NAME   (x-api-key)
 *  ScrapeCreators: api.scrapecreators.com/v1/instagram/profile?handle=NAME      (x-api-key)
 *                  api.scrapecreators.com/v1/instagram/user/posts?handle=NAME   (x-api-key)
 *  Both free: Sociavault (50 credits/key), ScrapeCreators (100 credits). */
async function auditInstagramProfile(env: Env, url: string): Promise<any> {
  const m = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  const username = (m ? m[1] : '').replace(/^@/, '');
  const handle = username ? '@' + username : '';
  if (!username) return { error: 'Could not parse Instagram username from URL. Use format: instagram.com/username', platform: 'instagram' };

  // ── Sociavault (primary) — Instagram profile + posts ─────────────────────────
  if (env.SOCIAVAULT_API_KEY) {
    try {
      const profileRes = await fetch(`https://api.sociavault.com/v1/scrape/instagram/profile?handle=${encodeURIComponent(username)}`, {
        headers: { 'x-api-key': env.SOCIAVAULT_API_KEY },
      });
      // Throttled Sociavault credit probe (same key as TikTok — only records if >5min since last probe)
      try {
        await maybeProbeAndRecordSociavaultCredits(env, env.SOCIAVAULT_API_KEY, 'primary', `audit:instagram:${username}`);
      } catch {}
      if (profileRes.ok) {
        const profileJson = await profileRes.json() as any;
        const wrapper = profileJson?.data?.user ? profileJson.data : (profileJson?.data?.data?.user ? profileJson.data.data : {});
        const u = wrapper?.user || profileJson?.data?.user || profileJson?.data?.data?.user || {};
        if (u.username || u.id) {
          const channelName = u.full_name || u.username || username;
          const avatar = u.profile_pic_url || u.profile_pic_url_hd || '';
          const description = u.biography || u.bio || '';
          const subscribers = Number(u.edge_followed_by?.count ?? u.follower_count ?? u.followers ?? 0);
          const following = Number(u.edge_follow?.count ?? u.following_count ?? u.following ?? 0);
          const videoCount = Number(u.edge_owner_to_timeline_media?.count ?? u.media_count ?? u.posts ?? 0);
          const isPrivate = u.is_private || false;
          const isVerified = u.is_verified || false;
          const externalUrl = u.external_url || '';

          // Fetch recent posts
          let recentVideos: any[] = [];
          try {
            const postsRes = await fetch(`https://api.sociavault.com/v1/scrape/instagram/posts?handle=${encodeURIComponent(username)}&count=10`, {
              headers: { 'x-api-key': env.SOCIAVAULT_API_KEY },
            });
            if (postsRes.ok) {
              const postsJson = await postsRes.json() as any;
              const items = postsJson?.data?.items || postsJson?.data?.data?.items || postsJson?.data?.edges || postsJson?.items || [];
              const list = Array.isArray(items) ? items : Object.values(items);
              recentVideos = list.slice(0, 10).map((edge: any, i: number) => {
                const n = edge?.node || edge?.media || edge;
                const caption = n.caption?.text || n.caption || (n.is_video ? 'Reel' : 'Post') + ` ${i + 1}`;
                const shortcode = n.shortcode || n.code || '';
                return {
                  id: String(n.id || `ig_audit_${i}`),
                  title: typeof caption === 'string' ? caption.slice(0, 120) : `Post ${i + 1}`,
                  thumbnail: pickInstagramThumb(n),
                  url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : (n.permalink || ''),
                  publishedAt: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : (n.taken_at ? new Date(n.taken_at * 1000).toISOString() : (n.device_timestamp ? new Date(Math.floor(Number(n.device_timestamp) / (Number(n.device_timestamp) > 1e14 ? 1000 : 1))).toISOString() : (n.caption?.created_at ? new Date(n.caption.created_at * 1000).toISOString() : ''))),
                  viewCount: Number(n.video_view_count || n.video_views || n.play_count || 0),
                  likeCount: Number(n.edge_media_preview_like?.count ?? (n.like_and_view_counts_disabled ? 0 : (n.like_count ?? n.likes?.count ?? 0))),
                  commentCount: Number(n.edge_media_to_comment?.count ?? n.comment_count ?? (n.comments?.count ?? 0)),
                };
              });
            }
          } catch {}

          const totalRecentViews = recentVideos.reduce((s: number, v: any) => s + (v.viewCount || 0), 0);
          const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
          const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
          const avgEngagementRate = (subscribers > 0 && recentVideos.length > 0)
            ? (totalRecentLikes / recentVideos.length / subscribers) * 100
            : 0;

          return {
            platform: 'instagram',
            channelId: String(u.id || ''),
            channelName,
            channelHandle: u.username ? '@' + u.username : handle,
            description,
            avatar,
            banner: '',
            country: '',
            publishedAt: '',
            statistics: { subscribers, totalViews: 0, videoCount, hiddenSubscriberCount: isPrivate },
            recentVideos,
            metrics: { avgRecentViews, totalRecentViews, avgEngagementRate, recentVideoCount: recentVideos.length },
            auditedAt: new Date().toISOString(),
            note: isPrivate ? 'Account is private — limited data.' : (isVerified ? 'Verified Instagram account.' : (externalUrl ? `External link: ${externalUrl}` : '')),
            _source: 'sociavault',
          };
        }
      }
    } catch {}
  }

  // ── ScrapeCreators (fallback) — Instagram profile + posts ────────────────────
  if (env.SCRAPECREATORS_API_KEY) {
    try {
      const profileRes = await fetch(`https://api.scrapecreators.com/v1/instagram/profile?handle=${encodeURIComponent(username)}`, {
        headers: { 'x-api-key': env.SCRAPECREATORS_API_KEY },
      });
      if (profileRes.ok) {
        const profileJson = await profileRes.json() as any;
        // Record ScrapeCreators credit snapshot (passive — every response includes credits_remaining)
        if (typeof profileJson?.credits_remaining === 'number') {
          try {
            await recordCreditSnapshot(env, 'scrapecreators', 'primary', {
              credits: profileJson.credits_remaining,
              last_source: `audit:instagram:${username}`,
            });
          } catch {}
        }
        if (profileJson?.success) {
          const u = profileJson?.data?.user || profileJson?.user || {};
          if (u.username || u.id) {
            const channelName = u.full_name || u.username || username;
            const avatar = u.profile_pic_url || u.profile_pic_url_hd || '';
            const description = u.biography || u.bio || '';
            const subscribers = Number(u.edge_followed_by?.count ?? u.follower_count ?? u.followers ?? 0);
            const following = Number(u.edge_follow?.count ?? u.following_count ?? u.following ?? 0);
            const videoCount = Number(u.edge_owner_to_timeline_media?.count ?? u.media_count ?? u.posts ?? 0);
            const isPrivate = u.is_private || false;
            const isVerified = u.is_verified || false;

            // Fetch recent posts
            let recentVideos: any[] = [];
            try {
              const postsRes = await fetch(`https://api.scrapecreators.com/v1/instagram/user/posts?handle=${encodeURIComponent(username)}&count=10`, {
                headers: { 'x-api-key': env.SCRAPECREATORS_API_KEY },
              });
              if (postsRes.ok) {
                const postsJson = await postsRes.json() as any;
                const items = postsJson?.posts || postsJson?.data?.posts || postsJson?.data?.edges || [];
                const list = Array.isArray(items) ? items : Object.values(items);
                recentVideos = list.slice(0, 10).map((edge: any, i: number) => {
                  const n = edge?.node || edge;
                  const caption = n.caption?.text || n.caption || (n.is_video ? 'Reel' : 'Post') + ` ${i + 1}`;
                  const shortcode = n.shortcode || n.code || '';
                  return {
                    id: String(n.id || `ig_audit_${i}`),
                    title: typeof caption === 'string' ? caption.slice(0, 120) : `Post ${i + 1}`,
                    thumbnail: pickInstagramThumb(n),
                    url: shortcode ? `https://www.instagram.com/p/${shortcode}/` : (n.permalink || ''),
                    publishedAt: n.taken_at_timestamp ? new Date(n.taken_at_timestamp * 1000).toISOString() : '',
                    viewCount: Number(n.video_view_count || n.video_views || 0),
                    likeCount: Number(n.edge_media_preview_like?.count ?? n.like_count ?? 0),
                    commentCount: Number(n.edge_media_to_comment?.count ?? n.comment_count ?? 0),
                  };
                });
              }
            } catch {}

            const totalRecentViews = recentVideos.reduce((s: number, v: any) => s + (v.viewCount || 0), 0);
            const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
            const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
            const avgEngagementRate = (subscribers > 0 && recentVideos.length > 0)
              ? (totalRecentLikes / recentVideos.length / subscribers) * 100
              : 0;

            return {
              platform: 'instagram',
              channelId: String(u.id || ''),
              channelName,
              channelHandle: u.username ? '@' + u.username : handle,
              description,
              avatar,
              banner: '',
              country: '',
              publishedAt: '',
              statistics: { subscribers, totalViews: 0, videoCount, hiddenSubscriberCount: isPrivate },
              recentVideos,
              metrics: { avgRecentViews, totalRecentViews, avgEngagementRate, recentVideoCount: recentVideos.length },
              auditedAt: new Date().toISOString(),
              note: isPrivate ? 'Account is private — limited data.' : (isVerified ? 'Verified Instagram account.' : ''),
              _source: 'scrapecreators',
            };
          }
        }
      }
    } catch {}
  }

  // ── Serper fallback (lite — no follower count) ───────────────────────────────
  if (!env.SERPER_API_KEY) return { error: 'Set SOCIAVAULT_API_KEY or SCRAPECREATORS_API_KEY for full Instagram audits. Serper fallback also requires SERPER_API_KEY.', platform: 'instagram' };
  const q = username ? `site:instagram.com ${username}` : 'site:instagram.com';
  const raw = await serperSearch(env, q, 8);
  const recentVideos = raw.slice(0, 6).map((v: any, i: number) => ({
    id: `ig_audit_${i}`,
    title: v.title || 'Instagram post',
    thumbnail: '',
    url: v.link || '',
    publishedAt: '',
    viewCount: 0, likeCount: 0, commentCount: 0,
  }));
  return {
    platform: 'instagram',
    channelId: '',
    channelName: username || 'Instagram creator',
    channelHandle: handle,
    description: '',
    avatar: '', banner: '', country: '', publishedAt: '',
    statistics: { subscribers: 0, totalViews: 0, videoCount: recentVideos.length, hiddenSubscriberCount: true },
    recentVideos,
    metrics: { avgRecentViews: 0, totalRecentViews: 0, avgEngagementRate: 0, recentVideoCount: recentVideos.length },
    auditedAt: new Date().toISOString(),
    note: 'Lite audit — set SOCIAVAULT_API_KEY or SCRAPECREATORS_API_KEY to see real follower counts and recent media engagement.',
  };
}

/** X/Twitter audit — chain: SocialData → Sociavault → Serper (lite).
 *  SocialData: api.socialdata.tools/twitter/user/NAME                         (Bearer auth, key format "9846|xxx")
 *              api.socialdata.tools/twitter/search?query=from:NAME&count=10    (Bearer auth)
 *  Sociavault: api.sociavault.com/v1/scrape/twitter/profile?handle=NAME       (x-api-key)
 *              api.sociavault.com/v1/scrape/twitter/user-tweets?handle=NAME   (x-api-key)
 *  Free tier: SocialData (~$1 free credit), Sociavault (50 credits/key). */
async function auditXProfile(env: Env, url: string): Promise<any> {
  const m = url.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/);
  const username = (m ? m[1] : '').replace(/^@/, '');
  const handle = username ? '@' + username : '';
  if (!username) return { error: 'Could not parse X username from URL. Use format: x.com/username', platform: 'twitter' };

  // ── SocialData (primary chain — try all configured keys in rotation) ──────────
  // SocialData keys are short-lived (~$1 free credit each, 120 req/min rate).
  // We try primary → backup_2 → backup_3 → backup_4 until one succeeds.
  // The first key that returns a valid profile wins; subsequent keys are skipped.
  const socialdataKeys: Array<{ label: string; key?: string }> = [
    { label: 'primary',  key: env.SOCIALDATA_API_KEY },
    { label: 'backup_2', key: env.SOCIALDATA_API_KEY_2 },
    { label: 'backup_3', key: env.SOCIALDATA_API_KEY_3 },
    { label: 'backup_4', key: env.SOCIALDATA_API_KEY_4 },
  ].filter(k => !!k.key) as Array<{ label: string; key?: string }>;

  for (const { label, key } of socialdataKeys) {
    if (!key) continue;
    try {
      const profileRes = await fetch(`https://api.socialdata.tools/twitter/user/${encodeURIComponent(username)}`, {
        headers: { 'Authorization': `Bearer ${key}` },
      });
      // Record SocialData rate-limit snapshot for THIS key (per-minute rate).
      try {
        const rlRemaining = Number(profileRes.headers.get('x-ratelimit-remaining') || '');
        const rlLimit = Number(profileRes.headers.get('x-ratelimit-limit') || '');
        if (!Number.isNaN(rlRemaining) || !Number.isNaN(rlLimit)) {
          await recordCreditSnapshot(env, 'socialdata', label as any, {
            rate_limit_remaining: Number.isNaN(rlRemaining) ? undefined : rlRemaining,
            rate_limit_limit: Number.isNaN(rlLimit) ? undefined : rlLimit,
            last_source: `audit:twitter:${username}`,
          });
        }
      } catch {}
      // If this key 401s or 429s, fall through to the next key in the rotation
      if (profileRes.status === 401 || profileRes.status === 403) continue;
      if (profileRes.status === 429) continue;
      if (profileRes.ok) {
        const profile = await profileRes.json() as any;
        if (profile && (profile.screen_name || profile.id)) {
          const channelName = profile.name || profile.screen_name || username;
          const avatar = (profile.profile_image_url_https || profile.profile_image_url || '').replace('_normal.', '_400x400.');
          const banner = profile.profile_banner_url || '';
          const description = profile.description || '';
          const subscribers = Number(profile.followers_count || 0);
          const following = Number(profile.friends_count || 0);
          const videoCount = Number(profile.statuses_count || 0);
          const favouritesCount = Number(profile.favourites_count || 0);
          const isVerified = profile.verified || false;
          const publishedAt = profile.created_at || '';

          // Fetch recent tweets via search (from:USERNAME query)
          let recentVideos: any[] = [];
          try {
            const tweetsRes = await fetch(`https://api.socialdata.tools/twitter/search?query=${encodeURIComponent('from:' + username)}&count=10`, {
              headers: { 'Authorization': `Bearer ${key}` },
            });
            if (tweetsRes.ok) {
              const tweetsJson = await tweetsRes.json() as any;
              const tweets = tweetsJson?.tweets || [];
              recentVideos = (Array.isArray(tweets) ? tweets : []).slice(0, 10).map((t: any, i: number) => ({
                id: String(t.id || t.id_str || `x_audit_${i}`),
                title: (t.text || t.full_text || 'X post').slice(0, 100),
                thumbnail: t.extended_entities?.media?.[0]?.media_url_https || t.entities?.media?.[0]?.media_url || '',
                url: t.id_str ? `https://x.com/${username}/status/${t.id_str}` : '',
                publishedAt: t.tweet_created_at || t.created_at || '',
                viewCount: Number(t.view_count || 0),
                likeCount: Number(t.favorite_count || 0),
                commentCount: Number(t.reply_count || 0),
              }));
            }
          } catch {}

          const totalRecentViews = recentVideos.reduce((s: number, v: any) => s + (v.viewCount || 0), 0);
          const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
          const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
          const avgEngagementRate = (subscribers > 0 && recentVideos.length > 0)
            ? (totalRecentLikes / recentVideos.length / subscribers) * 100
            : 0;

          return {
            platform: 'twitter',
            channelId: String(profile.id_str || profile.id || ''),
            channelName,
            channelHandle: profile.screen_name ? '@' + profile.screen_name : handle,
            description,
            avatar,
            banner,
            country: profile.location || '',
            publishedAt,
            statistics: { subscribers, totalViews: favouritesCount, videoCount, hiddenSubscriberCount: false },
            recentVideos,
            metrics: { avgRecentViews, totalRecentViews, avgEngagementRate, recentVideoCount: recentVideos.length },
            auditedAt: new Date().toISOString(),
            note: isVerified ? 'Verified X account.' : '',
            _source: 'socialdata',
          };
        }
      }
    } catch {}
  }

  // ── Sociavault (fallback) — X profile + user-tweets ──────────────────────────
  if (env.SOCIAVAULT_API_KEY) {
    try {
      const profileRes = await fetch(`https://api.sociavault.com/v1/scrape/twitter/profile?handle=${encodeURIComponent(username)}`, {
        headers: { 'x-api-key': env.SOCIAVAULT_API_KEY },
      });
      // Throttled Sociavault credit probe
      try {
        await maybeProbeAndRecordSociavaultCredits(env, env.SOCIAVAULT_API_KEY, 'primary', `audit:twitter:${username}`);
      } catch {}
      if (profileRes.ok) {
        const profileJson = await profileRes.json() as any;
        const wrapper = profileJson?.data?.data || profileJson?.data || {};
        const u = wrapper?.legacy || wrapper?.user?.legacy || wrapper || {};
        const restId = wrapper?.rest_id || wrapper?.user?.rest_id || '';
        const core = wrapper?.core || wrapper?.user?.core || {};
        if ((core.screen_name || u.screen_name || restId) && (u.followers_count !== undefined || restId)) {
          const channelName = core.name || u.name || username;
          const avatar = (u.profile_image_url_https || '').replace('_normal.', '_400x400.');
          const banner = u.profile_banner_url || '';
          const description = u.description || '';
          const subscribers = Number(u.followers_count || 0);
          const following = Number(u.friends_count || 0);
          const videoCount = Number(u.statuses_count || 0);
          const favouritesCount = Number(u.favourites_count || 0);
          const isVerified = wrapper?.is_blue_verified || u.verified || false;
          const publishedAt = u.created_at || '';

          // Fetch recent tweets
          let recentVideos: any[] = [];
          try {
            const tweetsRes = await fetch(`https://api.sociavault.com/v1/scrape/twitter/user-tweets?handle=${encodeURIComponent(username)}&count=10`, {
              headers: { 'x-api-key': env.SOCIAVAULT_API_KEY },
            });
            if (tweetsRes.ok) {
              const tweetsText = await tweetsRes.text();
              const firstJson = tweetsText.slice(0, 5_000_000).match(/^\{[\s\S]*\}(?=\n\{)/) || [tweetsText];
              const tweetsJson = JSON.parse(firstJson[0]) as any;
              const tweets = tweetsJson?.data?.tweets || tweetsJson?.tweets || {};
              const list = Array.isArray(tweets) ? tweets : Object.values(tweets);
              recentVideos = list.slice(0, 10).map((t: any, i: number) => {
                const legacy = t?.legacy || t;
                return {
                  id: String(t?.rest_id || legacy.id_str || legacy.id || `x_audit_${i}`),
                  title: (legacy.full_text || legacy.text || 'X post').slice(0, 100),
                  thumbnail: legacy.extended_entities?.media?.[0]?.media_url_https || legacy.entities?.media?.[0]?.media_url_https || '',
                  url: (t?.rest_id || legacy.id_str) ? `https://x.com/${username}/status/${t.rest_id || legacy.id_str}` : '',
                  publishedAt: legacy.created_at || '',
                  viewCount: Number(legacy.view_count || 0),
                  likeCount: Number(legacy.favorite_count || 0),
                  commentCount: Number(legacy.reply_count || 0),
                };
              });
            }
          } catch {}

          const totalRecentViews = recentVideos.reduce((s: number, v: any) => s + (v.viewCount || 0), 0);
          const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
          const avgRecentViews = recentVideos.length ? Math.round(totalRecentViews / recentVideos.length) : 0;
          const avgEngagementRate = (subscribers > 0 && recentVideos.length > 0)
            ? (totalRecentLikes / recentVideos.length / subscribers) * 100
            : 0;

          return {
            platform: 'twitter',
            channelId: String(restId || ''),
            channelName,
            channelHandle: core.screen_name ? '@' + core.screen_name : (u.screen_name ? '@' + u.screen_name : handle),
            description,
            avatar,
            banner,
            country: u.location || '',
            publishedAt,
            statistics: { subscribers, totalViews: favouritesCount, videoCount, hiddenSubscriberCount: false },
            recentVideos,
            metrics: { avgRecentViews, totalRecentViews, avgEngagementRate, recentVideoCount: recentVideos.length },
            auditedAt: new Date().toISOString(),
            note: isVerified ? 'Verified X account.' : '',
            _source: 'sociavault',
          };
        }
      }
    } catch {}
  }

  // ── Serper fallback (lite — no follower count) ─────────────────────────────
  if (!env.SERPER_API_KEY) return { error: 'Set SOCIALDATA_API_KEY (socialdata.tools) or SOCIAVAULT_API_KEY for full X audits. Serper fallback also requires SERPER_API_KEY.', platform: 'twitter' };
  const q = username ? `site:x.com ${username}` : 'site:x.com';
  const raw = await serperSearch(env, q, 8);
  const recentVideos = raw.slice(0, 6).map((v: any, i: number) => ({
    id: `x_audit_${i}`,
    title: v.title || 'X post',
    thumbnail: '',
    url: v.link || '',
    publishedAt: '',
    viewCount: 0, likeCount: 0, commentCount: 0,
  }));
  return {
    platform: 'twitter',
    channelId: '',
    channelName: handle || 'X creator',
    channelHandle: handle,
    description: '',
    avatar: '', banner: '', country: '', publishedAt: '',
    statistics: { subscribers: 0, totalViews: 0, videoCount: recentVideos.length, hiddenSubscriberCount: true },
    recentVideos,
    metrics: { avgRecentViews: 0, totalRecentViews: 0, avgEngagementRate: 0, recentVideoCount: recentVideos.length },
    auditedAt: new Date().toISOString(),
    note: 'Lite audit — set SOCIALDATA_API_KEY or SOCIAVAULT_API_KEY to see real follower counts and tweet engagement.',
  };
}

/** Reddit audit — primary chain:
 *   Layer 0: Reddit OAuth app-only flow (oauth.reddit.com — 60 req/min, works from CF egress)
 *            Requires REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET env vars. Register an app at
 *            https://www.reddit.com/prefs/apps (script type, redirect URI = http://localhost).
 *   Layer 1: Reddit public JSON (www.reddit.com — works for non-CF-egress IPs)
 *   Layer 2: Pullpush archive mirror (api.pullpush.io) — submissions + comments with scores
 *   Layer 3: Reddit RSS feed (www.reddit.com/user/NAME/.rss) — titles + URLs only, no scores
 *
 *  Reddit aggressively rate-limits anonymous server-side requests, so Layer 0 (OAuth)
 *  is the only reliable path from Cloudflare's egress IP. Without OAuth creds, the
 *  audit will degrade through Layers 1-3 and may return limited data via RSS. */
async function auditRedditProfile(env: Env, url: string): Promise<any> {
  const m = url.match(/reddit\.com\/(?:user|u)\/([A-Za-z0-9_-]+)/);
  const username = m ? m[1] : '';
  if (!username) return { error: 'Could not parse Reddit username from URL. Use format: reddit.com/u/username', platform: 'reddit' };

  const userAgent = env.REDDIT_USER_AGENT || 'ClipAI/1.0 (channel audit; +https://clipai-bqo.pages.dev)';
  const headers = { 'User-Agent': userAgent };

  // ── Layer 0: Reddit OAuth (app-only flow → oauth.reddit.com) ─────────────────
  if (env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET) {
    const oauthAudit = await redditOAuthAudit(env, username, userAgent);
    if (oauthAudit) return oauthAudit;
    // If OAuth fails (e.g. user not found), fall through to other layers
  }

  // ── Layer 1: Reddit public JSON (works for non-CF-egress IPs) ────────────────
  try {
    const aboutCtrl = new AbortController();
    const aboutT = setTimeout(() => aboutCtrl.abort(), 10000);
    const aboutRes = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/about.json`, { headers, signal: aboutCtrl.signal });
    clearTimeout(aboutT);
    if (aboutRes.ok) {
      const aboutJson = await aboutRes.json() as any;
      const data = aboutJson?.data || {};
      const subreddit = data?.subreddit || {};
      const channelName = subreddit.title || data.name || username;
      const avatar = subreddit.icon_img || subreddit.icon_url || '';
      const description = subreddit.public_description || subreddit.description || '';
      const subscribers = Number(subreddit.subscribers || 0);
      const totalKarma = Number(data.total_karma || 0);
      const commentKarma = Number(data.comment_karma || 0);
      const linkKarma = Number(data.link_karma || 0);
      const accountAge = data.created_utc ? new Date(data.created_utc * 1000).toISOString() : '';
      const isVerified = data.verified || data.is_employee || false;

      // Fetch recent posts
      let recentVideos: any[] = [];
      try {
        const postsCtrl = new AbortController();
        const postsT = setTimeout(() => postsCtrl.abort(), 10000);
        const postsRes = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/.json?limit=10`, { headers, signal: postsCtrl.signal });
        clearTimeout(postsT);
        if (postsRes.ok) {
          const postsJson = await postsRes.json() as any;
          const children = postsJson?.data?.children || [];
          recentVideos = children.map((c: any, i: number) => {
            const p = c?.data || {};
            return {
              id: p.id || `rd_audit_${i}`,
              title: p.title || p.body?.slice(0, 100) || 'Reddit post',
              thumbnail: (p.thumbnail && p.thumbnail.startsWith('http')) ? p.thumbnail : '',
              url: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
              publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : '',
              viewCount: Number(p.view_count || 0),
              likeCount: Number(p.score || 0),
              commentCount: Number(p.num_comments || 0),
            };
          }).slice(0, 10);
        }
      } catch {}

      const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
      const avgRecentLikes = recentVideos.length ? Math.round(totalRecentLikes / recentVideos.length) : 0;
      const avgEngagementRate = recentVideos.length > 0 ? (recentVideos.reduce((s: number, v: any) => s + (v.commentCount || 0), 0) / recentVideos.length) : 0;

      return {
        platform: 'reddit',
        channelId: data.id || '',
        channelName,
        channelHandle: 'u/' + username,
        description,
        avatar,
        banner: subreddit.banner_img || subreddit.banner_background_image || '',
        country: '',
        publishedAt: accountAge,
        statistics: { subscribers, totalViews: totalKarma, videoCount: recentVideos.length, hiddenSubscriberCount: false },
        recentVideos,
        metrics: { avgRecentViews: avgRecentLikes, totalRecentViews: totalKarma, avgEngagementRate, recentVideoCount: recentVideos.length },
        auditedAt: new Date().toISOString(),
        note: isVerified ? 'Verified Reddit account.' : '',
        _source: 'reddit_json',
      };
    }
    // If 404, the user truly doesn't exist — fall through to error
    if (aboutRes.status === 404) {
      // Try Pullpush to confirm — sometimes Reddit returns 404 for rate-limited users that actually exist
      const pp = await pullpushRedditAudit(username);
      if (pp) return pp;
      return { error: `Reddit user "${username}" not found (404). Check the username and try again.`, platform: 'reddit' };
    }
    // 403/429 → fall through to Pullpush
  } catch {
    // network error → fall through to Pullpush
  }

  // ── Layer 2: Pullpush archive mirror (api.pullpush.io) ──────────────────────
  // Reddit blocks Cloudflare's egress IP with 403/429 for anonymous server-side
  // requests. Pullpush is a third-party archive mirror that proxies Reddit data
  // — it returns submissions + comments with scores + permalinks. Profile
  // metadata (karma, avatar, account age) is not available via Pullpush.
  const pullpush = await pullpushRedditAudit(username);
  if (pullpush) return pullpush;

  // ── Layer 3: Reddit RSS feed (last resort) ─────────────────────────────────
  // RSS works from CF egress when JSON doesn't (different rate limit policy).
  // Returns recent posts with titles, permalinks, and pubDates — but no scores,
  // no comment counts, no profile metadata. Useful as a final fallback so the
  // audit at least shows *something* for valid users.
  const rssAudit = await redditRssAudit(username, headers);
  if (rssAudit) return rssAudit;

  return {
    error: `Reddit audit failed: Reddit is rate-limiting our server IP (403/429), the Pullpush archive mirror is rate-limited (429), and the RSS feed is also unavailable. For reliable Reddit audits, set REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET (register an app at https://www.reddit.com/prefs/apps — script type, free).`,
    platform: 'reddit',
  };
}

/** Reddit OAuth app-only flow. Returns null if creds aren't set, OAuth fails,
 *  or the user doesn't exist. Uses oauth.reddit.com which has a separate
 *  (much higher) rate limit policy than www.reddit.com anonymous access. */
async function redditOAuthAudit(env: Env, username: string, userAgent: string): Promise<any | null> {
  if (!env.REDDIT_CLIENT_ID || !env.REDDIT_CLIENT_SECRET) return null;

  // Step 1: Get app-only bearer token (cached for 50min in L1+KV)
  const tokenKey = 'reddit_oauth_token';
  let token: string | null = null;
  const cached = await cacheRead<{ token: string }>(env, tokenKey);
  if (cached?.fresh && cached.data?.token) {
    token = cached.data.token;
  } else {
    try {
      const basicAuth = btoa(`${env.REDDIT_CLIENT_ID}:${env.REDDIT_CLIENT_SECRET}`);
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent,
        },
        body: 'grant_type=client_credentials',
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!r.ok) return null;
      const j = await r.json() as any;
      if (!j?.access_token) return null;
      token = j.access_token as string;
      // expires_in is typically 86400 (24h); cache for 50min to be safe
      await cacheWrite(env, tokenKey, { token }, 50 * 60);
    } catch {
      return null;
    }
  }

  if (!token) return null;

  // Step 2: Use the token to fetch the user's profile + recent posts
  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'User-Agent': userAgent,
  };

  try {
    const aboutCtrl = new AbortController();
    const aboutT = setTimeout(() => aboutCtrl.abort(), 10000);
    const aboutRes = await fetch(`https://oauth.reddit.com/user/${encodeURIComponent(username)}/about`, {
      headers: authHeaders,
      signal: aboutCtrl.signal,
    });
    clearTimeout(aboutT);
    if (!aboutRes.ok) {
      if (aboutRes.status === 404) return null;  // user truly doesn't exist
      return null;  // OAuth issue or rate limit — fall through
    }
    const aboutJson = await aboutRes.json() as any;
    const data = aboutJson?.data || {};
    const subreddit = data?.subreddit || {};
    const channelName = subreddit.title || data.name || username;
    const avatar = subreddit.icon_img || subreddit.icon_url || '';
    const description = subreddit.public_description || subreddit.description || '';
    const subscribers = Number(subreddit.subscribers || 0);
    const totalKarma = Number(data.total_karma || 0);
    const commentKarma = Number(data.comment_karma || 0);
    const linkKarma = Number(data.link_karma || 0);
    const accountAge = data.created_utc ? new Date(data.created_utc * 1000).toISOString() : '';
    const isVerified = data.verified || data.is_employee || false;

    // Fetch recent posts
    let recentVideos: any[] = [];
    try {
      const postsCtrl = new AbortController();
      const postsT = setTimeout(() => postsCtrl.abort(), 10000);
      const postsRes = await fetch(`https://oauth.reddit.com/user/${encodeURIComponent(username)}/overview?limit=10`, {
        headers: authHeaders,
        signal: postsCtrl.signal,
      });
      clearTimeout(postsT);
      if (postsRes.ok) {
        const postsJson = await postsRes.json() as any;
        const children = postsJson?.data?.children || [];
        recentVideos = children.map((c: any, i: number) => {
          const p = c?.data || {};
          return {
            id: p.id || `rd_audit_${i}`,
            title: p.title || p.body?.slice(0, 100) || 'Reddit post',
            thumbnail: (p.thumbnail && p.thumbnail.startsWith('http')) ? p.thumbnail : '',
            url: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
            publishedAt: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : '',
            viewCount: Number(p.view_count || 0),
            likeCount: Number(p.score || 0),
            commentCount: Number(p.num_comments || 0),
          };
        }).slice(0, 10);
      }
    } catch {}

    const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
    const avgRecentLikes = recentVideos.length ? Math.round(totalRecentLikes / recentVideos.length) : 0;
    const avgEngagementRate = recentVideos.length > 0 ? (recentVideos.reduce((s: number, v: any) => s + (v.commentCount || 0), 0) / recentVideos.length) : 0;

    return {
      platform: 'reddit',
      channelId: data.id || '',
      channelName,
      channelHandle: 'u/' + username,
      description,
      avatar,
      banner: subreddit.banner_img || subreddit.banner_background_image || '',
      country: '',
      publishedAt: accountAge,
      statistics: { subscribers, totalViews: totalKarma, videoCount: recentVideos.length, hiddenSubscriberCount: false },
      recentVideos,
      metrics: { avgRecentViews: avgRecentLikes, totalRecentViews: totalKarma, avgEngagementRate, recentVideoCount: recentVideos.length },
      auditedAt: new Date().toISOString(),
      note: isVerified ? 'Verified Reddit account.' : '',
      _source: 'reddit_oauth',
    };
  } catch {
    return null;
  }
}

/** Reddit RSS feed fallback. Returns recent post titles + URLs + dates only
 *  (no scores, no comment counts — RSS doesn't expose those). Returns null
 *  if the feed is empty or unavailable. */
async function redditRssAudit(username: string, headers: Record<string, string>): Promise<any | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(`https://www.reddit.com/user/${encodeURIComponent(username)}/.rss?limit=25`, { headers, signal: ctrl.signal });
    if (!r.ok) return null;
    const xml = await r.text();
    if (!xml || !xml.includes('<entry>')) return null;

    // Extract <entry> blocks
    const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
    const entries: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = entryRegex.exec(xml)) !== null && entries.length < 10) {
      entries.push(m[0]);
    }
    if (entries.length === 0) return null;

    const recentVideos = entries.map((xmlEntry, i) => {
      const title = (xmlEntry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || `Reddit post ${i + 1}`).replace(/&[^;]+;/g, ' ').trim();
      const link = xmlEntry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
      const published = xmlEntry.match(/<published[^>]*>([^<]+)<\/published>/)?.[1] || '';
      const author = xmlEntry.match(/<name>([^<]+)<\/name>/)?.[1] || '';
      // Try to extract content snippet
      const contentMatch = xmlEntry.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1] || '';
      const contentText = contentMatch.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').trim().slice(0, 200);
      return {
        id: `rd_rss_${i}`,
        title: title.slice(0, 100),
        thumbnail: '',
        url: link,
        publishedAt: published,
        viewCount: 0,
        likeCount: 0,  // RSS doesn't expose scores
        commentCount: 0,
        author: author.replace('/u/', ''),
      };
    });

    // Try to extract profile metadata from the feed header
    const channelName = (xml.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] || username).replace(/&[^;]+;/g, ' ').trim();
    const description = (xml.match(/<subtitle[^>]*>([\s\S]*?)<\/subtitle>/)?.[1] || '').replace(/&[^;]+;/g, ' ').trim();

    return {
      platform: 'reddit',
      channelId: '',
      channelName,
      channelHandle: 'u/' + username,
      description,
      avatar: '',
      banner: '',
      country: '',
      publishedAt: '',
      statistics: {
        subscribers: 0,
        totalViews: 0,
        videoCount: recentVideos.length,
        hiddenSubscriberCount: true,
      },
      recentVideos,
      metrics: {
        avgRecentViews: 0,
        totalRecentViews: 0,
        avgEngagementRate: 0,
        recentVideoCount: recentVideos.length,
      },
      auditedAt: new Date().toISOString(),
      note: 'Reddit is rate-limiting our server IP (403/429) and the Pullpush archive mirror is also rate-limited (429). Recent post titles + URLs are shown via the public RSS feed. Scores and profile metadata (karma, avatar, account age) are not available via RSS — try again later for full data.',
      _source: 'reddit_rss',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Pullpush-based Reddit audit fallback. Returns null if Pullpush has no data
 *  for the user (i.e. they've never posted). Aggregates submissions + comments
 *  into a single recent-activity feed with engagement metrics. */
async function pullpushRedditAudit(username: string): Promise<any | null> {
  const ua = 'ClipAI/1.0 (channel audit; +https://clipai-bqo.pages.dev)';
  const author = encodeURIComponent(username);

  // Helper: fetch with manual AbortController (AbortSignal.timeout() is not
  // reliably supported in the Cloudflare Workers runtime).
  const pullpushFetch = async (path: string): Promise<any | null> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(`https://api.pullpush.io/reddit/${path}`, {
        headers: { 'User-Agent': ua },
        signal: ctrl.signal,
      });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  // Parallel: fetch submissions + comments
  const [subs, comments] = await Promise.all([
    pullpushFetch(`search/submission/?author=${author}&size=25&sort=desc`),
    pullpushFetch(`search/comment/?author=${author}&size=25&sort=desc`),
  ]);
  const subsList = Array.isArray(subs?.data) ? subs.data : [];
  const commentsList = Array.isArray(comments?.data) ? comments.data : [];

  if (subsList.length === 0 && commentsList.length === 0) return null;

  // Merge into a single feed sorted by created_utc desc
  const feed: any[] = [];
  for (const s of subsList) {
    feed.push({
      kind: 'submission',
      id: s.id || s.name || '',
      title: s.title || '(untitled submission)',
      thumbnail: (s.thumbnail && typeof s.thumbnail === 'string' && s.thumbnail.startsWith('http')) ? s.thumbnail : '',
      url: s.permalink ? `https://www.reddit.com${s.permalink}` : '',
      publishedAt: s.created_utc ? new Date(s.created_utc * 1000).toISOString() : '',
      viewCount: 0,  // Pullpush doesn't expose view_count for submissions
      likeCount: Number(s.score || 0),
      commentCount: Number(s.num_comments || 0),
      subreddit: s.subreddit || '',
    });
  }
  for (const c of commentsList) {
    feed.push({
      kind: 'comment',
      id: c.id || '',
      title: (c.body || '').slice(0, 100) || '(comment)',
      thumbnail: '',
      url: c.permalink ? `https://www.reddit.com${c.permalink}` : '',
      publishedAt: c.created_utc ? new Date(c.created_utc * 1000).toISOString() : '',
      viewCount: 0,
      likeCount: Number(c.score || 0),
      commentCount: 0,
      subreddit: c.subreddit || '',
    });
  }
  feed.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const recentVideos = feed.slice(0, 10);

  const totalRecentLikes = recentVideos.reduce((s: number, v: any) => s + (v.likeCount || 0), 0);
  const avgRecentLikes = recentVideos.length ? Math.round(totalRecentLikes / recentVideos.length) : 0;
  const avgEngagementRate = recentVideos.length > 0
    ? (recentVideos.reduce((s: number, v: any) => s + (v.commentCount || 0), 0) / recentVideos.length)
    : 0;

  // Subreddits the user has posted in (deduped, top 5)
  const subreddits = Array.from(new Set(feed.map((p: any) => p.subreddit).filter(Boolean))).slice(0, 5);

  return {
    platform: 'reddit',
    channelId: '',
    channelName: username,
    channelHandle: 'u/' + username,
    description: subreddits.length > 0 ? `Active in: ${subreddits.join(', ')}` : '',
    avatar: '',
    banner: '',
    country: '',
    publishedAt: '',
    statistics: {
      subscribers: 0,
      totalViews: 0,
      videoCount: feed.length,
      hiddenSubscriberCount: true,
    },
    recentVideos,
    metrics: {
      avgRecentViews: avgRecentLikes,
      totalRecentViews: totalRecentLikes,
      avgEngagementRate,
      recentVideoCount: recentVideos.length,
    },
    auditedAt: new Date().toISOString(),
    note: 'Reddit limits profile metadata (karma, avatar, account age) for anonymous server-side requests. Recent activity is shown via the Pullpush public archive mirror. Scores are point-in-time snapshots, not live.',
    _source: 'pullpush',
  };
}

async function auditChannel(env: Env, url: string, platformHint?: string): Promise<any> {
  // Normalise the input — accept full URLs OR bare usernames (with optional
  // platform prefix or platformHint). Returns the canonical URL + platform.
  const normalised = normaliseAuditInput(url, platformHint);
  if (!normalised) return { error: 'Unsupported input. Paste a full URL (youtube.com/@MrBeast) or a username with a platform prefix (yt:MrBeast, tt:khaby.lame, ig:keke, x:elonmusk, r:spez).' };
  const { url: canonicalUrl, platform } = normalised;
  switch (platform) {
    case 'youtube':   return auditYouTubeChannel(env, canonicalUrl);
    case 'tiktok':    return auditTikTokProfile(env, canonicalUrl);
    case 'instagram': return auditInstagramProfile(env, canonicalUrl);
    case 'twitter':   return auditXProfile(env, canonicalUrl);
    case 'reddit':    return auditRedditProfile(env, canonicalUrl);
  }
  return { error: 'Unsupported platform' };
}

app.get('/trends/_diag', async (c) => {
  // Diagnostic endpoint — pings each keyless platform directly and reports
  // raw HTTP status + first 200 chars of body. Helps isolate which layer
  // is failing from Cloudflare's egress IP. Requires WORKER_SECRET to access
  // (don't expose provider/key presence publicly).
  const env = c.env as Env;
  const secret = c.req.query('secret');
  if (!env.WORKER_SECRET || secret !== env.WORKER_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const game = (c.req.query('game') || 'valorant').trim();
  const out: any = {
    generatedAt: new Date().toISOString(),
    game,
    env_keys_present: {
      YOUTUBE_API_KEY: !!env.YOUTUBE_API_KEY,
      REDDIT_USER_AGENT: !!env.REDDIT_USER_AGENT,
      SERPER_API_KEY: !!env.SERPER_API_KEY,
      GROQ_API_KEY: !!env.GROQ_API_KEY,
      MISTRAL_API_KEY: !!env.MISTRAL_API_KEY,
      SILICONFLOW_API_KEY: !!env.SILICONFLOW_API_KEY,
      LLM_MODEL: env.LLM_MODEL || null,
    },
    llm_provider: env.SILICONFLOW_API_KEY ? 'siliconflow' : (env.MISTRAL_API_KEY ? 'mistral' : (env.GROQ_API_KEY ? 'groq' : 'none')),
    layers: {},
  };

  // Reddit — call production redditTop() and report results.
  // (Skips a redundant direct fetch to avoid double-rate-limiting against Reddit.)
  try {
    out.redditTop_output = await redditTop(env, 'valorant', 5);
    out.redditTop_count = out.redditTop_output.length;
  } catch (e: any) {
    out.redditTop_output = { error: e.message };
  }

  // Pullpush — diagnostic probe to verify the Reddit fallback works from CF egress.
  try {
    const r = await fetch('https://api.pullpush.io/reddit/search/submission/?author=spez&size=1', {
      headers: { 'User-Agent': 'ClipAI/1.0 (channel audit; +https://clipai-bqo.pages.dev)' },
    });
    const body = await r.text();
    out.layers.pullpush_submissions = {
      status: r.status,
      body_len: body.length,
      body_preview: body.slice(0, 300),
      items_found: (body.match(/"id":"/g) || []).length,
    };
  } catch (e: any) {
    out.layers.pullpush_submissions = { error: e.message };
  }

  // Reddit direct JSON — diagnostic probe to confirm 403/429 status from CF egress.
  try {
    const r = await fetch('https://www.reddit.com/user/spez/about.json', {
      headers: { 'User-Agent': env.REDDIT_USER_AGENT || 'ClipAI/1.0 (channel audit; +https://clipai-bqo.pages.dev)' },
    });
    const body = await r.text();
    out.layers.reddit_direct_json = {
      status: r.status,
      body_len: body.length,
      body_preview: body.slice(0, 200),
    };
  } catch (e: any) {
    out.layers.reddit_direct_json = { error: e.message };
  }

  // Reddit RSS feed — diagnostic probe to verify the Layer 3 fallback works from CF egress.
  try {
    const r = await fetch('https://www.reddit.com/user/spez/.rss?limit=5', {
      headers: { 'User-Agent': env.REDDIT_USER_AGENT || 'ClipAI/1.0 (channel audit; +https://clipai-bqo.pages.dev)' },
    });
    const body = await r.text();
    out.layers.reddit_rss_feed = {
      status: r.status,
      body_len: body.length,
      items_found: (body.match(/<entry>/g) || []).length,
      body_preview: body.slice(0, 300),
    };
  } catch (e: any) {
    out.layers.reddit_rss_feed = { error: e.message };
  }

  // SocialData — diagnostic probe to verify x-ratelimit-* headers are visible from CF egress.
  if (env.SOCIALDATA_API_KEY) {
    try {
      const r = await fetch('https://api.socialdata.tools/twitter/user/elonmusk', {
        headers: { 'Authorization': `Bearer ${env.SOCIALDATA_API_KEY}` },
      });
      const allHeaders: Record<string, string> = {};
      r.headers.forEach((v: string, k: string) => { allHeaders[k] = v; });
      out.layers.socialdata_headers = {
        status: r.status,
        x_ratelimit_limit: r.headers.get('x-ratelimit-limit'),
        x_ratelimit_remaining: r.headers.get('x-ratelimit-remaining'),
        all_headers: allHeaders,
      };
    } catch (e: any) {
      out.layers.socialdata_headers = { error: e.message };
    }
  }

  // Google Trends — explore
  try {
    const kw = `${game} gaming`;
    const exploreReq = JSON.stringify({
      comparisonItem: [{ keyword: kw, geo: '', time: 'now 7-d' }],
      category: 833,
      property: '',
    });
    const r = await fetch(`https://trends.google.com/trends/api/explore?hl=en-US&tz=60&req=${encodeURIComponent(exploreReq)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipAI-TrendRadar/2.0)' },
    });
    const body = await r.text();
    out.layers.google_trends_explore = {
      status: r.status,
      body_len: body.length,
      body_preview: body.slice(0, 200),
    };
  } catch (e: any) {
    out.layers.google_trends_explore = { error: e.message };
  }

  // Google News RSS (the production googleTrendsNews() path)
  try {
    const kw = `${game} gaming`;
    const r = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(kw)}&hl=en-US&gl=NG&ceid=NG:en`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipAI-TrendRadar/2.0)' },
      redirect: 'follow',
    });
    const body = await r.text();
    out.layers.google_news_rss_ng = {
      status: r.status,
      body_len: body.length,
      body_preview: body.slice(0, 300),
      items_found: (body.match(/<item>/g) || []).length,
    };
  } catch (e: any) {
    out.layers.google_news_rss_ng = { error: e.message };
  }

  // Bing News RSS (the fallback inside googleTrendsNews())
  try {
    const kw = `${game} gaming`;
    const r = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(kw)}&format=rss`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ClipAI-TrendRadar/2.0)' },
    });
    const body = await r.text();
    out.layers.bing_news_rss = {
      status: r.status,
      body_len: body.length,
      body_preview: body.slice(0, 300),
      items_found: (body.match(/<item>/g) || []).length,
    };
  } catch (e: any) {
    out.layers.bing_news_rss = { error: e.message };
  }

  // Serper.dev (if key set)
  if (env.SERPER_API_KEY) {
    try {
      const r = await fetch('https://google.serper.dev/news', {
        method: 'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `${game} gaming esports`, gl: 'ng', num: 6 }),
      });
      const data = await r.json().catch(() => ({}));
      out.layers.serper_news = {
        status: r.status,
        items_found: (data.news || []).length,
        sample: (data.news || []).slice(0, 2).map((n: any) => n.title),
      };
    } catch (e: any) {
      out.layers.serper_news = { error: e.message };
    }
  } else {
    out.layers.serper_news = { skipped: 'SERPER_API_KEY not set' };
  }

  // Serper.dev site-search (TikTok + Twitter/X)
  if (env.SERPER_API_KEY) {
    try {
      const r = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: `site:tiktok.com ${game}`, gl: 'ng', num: 5 }),
      });
      const data = await r.json().catch(() => ({}));
      out.layers.serper_tiktok = {
        status: r.status,
        items_found: (data.organic || []).length,
        sample: (data.organic || []).slice(0, 2).map((n: any) => n.title),
      };
    } catch (e: any) {
      out.layers.serper_tiktok = { error: e.message };
    }
  } else {
    out.layers.serper_tiktok = { skipped: 'SERPER_API_KEY not set' };
  }

  return json(out);
});

app.get('/trends', async (c) => {
  const env = c.env as Env;
  const game = (c.req.query('game') || '').trim();
  const gameLabel = game || 'All';
  const debug = c.req.query('debug') === '1';

  // Cache key — 30min TTL, shared across all users (trends are global)
  const cacheKey = `trends:${gameLabel.toLowerCase()}`;

  const data = await withCache(env, cacheKey, 30 * 60, async () => {
    const [ytResults, redditResults, trendsResults, tiktokResults, twitterResults] = await Promise.all([
      ytTrending(env, game || 'gaming', 10),
      redditTop(env, game, 8),
      googleTrends(env, game, 6),
      serpTiktok(env, game, 6),
      serpTwitter(env, game, 6),
    ]);

    // Debug mode: return raw per-platform payloads without calling Groq.
    if (debug) {
      return {
        debug: true,
        game: gameLabel,
        generatedAt: new Date().toISOString(),
        sources: {
          youtube: ytResults.length,
          reddit: redditResults.length,
          google_trends: trendsResults.length,
          tiktok: tiktokResults.length,
          twitter: twitterResults.length,
        },
        raw: {
          youtube: ytResults,
          reddit: redditResults,
          google_trends: trendsResults,
          tiktok: tiktokResults,
          twitter: twitterResults,
        },
      };
    }

    const ytTitles = ytResults.slice(0, 8).map((it: any) =>
      `- ${it?.snippet?.title || ''} (channel: ${it?.snippet?.channelTitle || ''})`
    ).join('\n') || 'No YouTube data available.';

    const redditBlock = redditResults.slice(0, 6).map((r: any) =>
      `- ${r.title} (r/${r.subreddit}, score: ${r.score})`
    ).join('\n') || 'No Reddit data available.';

    const gtrendsBlock = trendsResults.slice(0, 5).map((t: any) => {
      if (t.layer === 'google_news_rss' && t.source) {
        return `- ${t.title} (via ${t.source}, recency ${t.value})`;
      }
      if (t.layer === 'serper_news' && t.source) {
        return `- ${t.title} (via ${t.source}, ${t.publishedAt || 'recent'})`;
      }
      return `- ${t.title} (+${t.value}% growth)`;
    }).join('\n') || 'No Google Trends data available.';

    const tiktokBlock = tiktokResults.slice(0, 5).map((t: any) =>
      `- ${t.title} (${t.url || 'no url'})`
    ).join('\n') || 'No TikTok data available (Serper key missing or quota exhausted).';

    const twitterBlock = twitterResults.slice(0, 5).map((t: any) =>
      `- ${t.title} (${t.url || 'no url'})`
    ).join('\n') || 'No Twitter data available (Serper key missing or quota exhausted).';

    const system = 'You are a viral gaming content trend analyst. Return ONLY valid JSON.';
    const prompt = `Synthesize these live cross-platform signals into the TOP 12 trending items
for gaming content creators right now. Each trend MUST tag the platform where it
originated so the frontend can render a badge.

=== YOUTUBE (trending short videos) ===
${ytTitles}

=== REDDIT (top posts of the day from gaming subs) ===
${redditBlock}

=== GOOGLE TRENDS (rising search queries, last 7 days) ===
${gtrendsBlock}

=== TIKTOK (viral clips via Serper.dev site:tiktok.com) ===
${tiktokBlock}

=== TWITTER/X (trending posts via Serper.dev site:x.com) ===
${twitterBlock}

Game focus: ${gameLabel}

Return a JSON object:
{
  "game": "${gameLabel}",
  "updatedAt": "<ISO timestamp>",
  "sources": {
    "youtube": <int count of items we received>,
    "reddit": <int>,
    "google_trends": <int>,
    "tiktok": <int>,
    "twitter": <int>
  },
  "trends": [
    {
      "id": "<unique id>",
      "name": "<trend name/phrase>",
      "category": "<one of: title|hashtag|sound|challenge>",
      "game": "<game name or All>",
      "platform": "<one of: youtube|reddit|google_trends|tiktok|twitter>",
      "score": <0-100 integer>,
      "change": <percentage change integer, can be negative>,
      "status": "<rising|peaked|falling>",
      "views": "<e.g. 1.2M>",
      "example": "<optional short example usage>"
    }
  ]
}

Rules:
- Distribute trends across platforms; do not let YouTube dominate.
- If a platform returned no data, do not invent trends for it.
- Make trends specific, actionable, and relevant to Nigerian/African gaming creators.
- Prefer rising trends over peaked ones (>=60% should be 'rising').`;

    const llmData: any = await llmJson(env, prompt, system, 8000);
    llmData.updatedAt = new Date().toISOString();
    llmData.sources = llmData.sources || {
      youtube: ytResults.length,
      reddit: redditResults.length,
      google_trends: trendsResults.length,
      tiktok: tiktokResults.length,
      twitter: twitterResults.length,
    };
    return llmData;
  });

  return json(data);
});

// ─── Trending Videos (Dashboard widget, multi-platform) ─────────────────────
// Returns ~11 trending gaming videos mixed across YouTube, TikTok, X/Twitter,
// and Instagram Reels + a per-video copy pack (optimized title + 1 caption +
// 8 hashtags) and a viewCount (YouTube only; other platforms don't expose
// public play counts). No auth, no credits — this is a free dashboard-level
// inspiration widget. Cached 6h globally.
//
// Platform mix:
//   - 4 YouTube  (real video data via ytTrending: id, snippet, thumbnail, viewCount)
//   - 3 TikTok   (via serpTiktok: title + url, no thumbnail, no views)
//   - 2 X        (via serpTwitter: title + url, no thumbnail, no views)
//   - 2 IG Reels (via serpInstagram: title + url, no thumbnail, no views)
app.get('/trending-videos', async (c) => {
  const env = c.env as Env;
  const game = (c.req.query('game') || '').trim();
  const gameLabel = game || 'gaming';

  const cacheKey = `trending_videos_v3:${gameLabel.toLowerCase()}`;
  const data = await withCache(env, cacheKey, 6 * 60 * 60, async () => {
    // Fetch from all 4 platforms in parallel
    const [ytItems, ttItems, xItems, igItems] = await Promise.all([
      ytTrending(env, game || 'gaming', 4),
      serpTiktok(env, game || 'gaming', 3),
      serpTwitter(env, game || 'gaming', 2),
      serpInstagram(env, game || 'gaming', 2),
    ]);

    // ── Map YouTube → video objects (with viewCount) ──
    const ytVideos = ytItems.map((it: any) => {
      const vid = it.id?.videoId || it.id || '';
      return {
        id: `yt_${vid}`,
        title: it.snippet?.title || 'Untitled',
        channel: it.snippet?.channelTitle || 'Unknown',
        thumbnail: vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : '',
        url: vid ? `https://www.youtube.com/watch?v=${vid}` : '',
        platform: 'youtube',
        publishedAt: it.snippet?.publishedAt || '',
        viewCount: typeof it.viewCount === 'number' ? it.viewCount : 0,
      };
    }).filter((v: any) => v.id && v.url);

    // ── Map TikTok → video objects ──
    // serpTiktok returns { title, url, platform } — extract author from URL.
    const ttVideos = ttItems.map((it: any, i: number) => {
      const url = it.url || '';
      // tiktok.com/@username/video/123... → extract @username
      const authorMatch = url.match(/@([^/?]+)/);
      const author = authorMatch ? `@${authorMatch[1]}` : 'TikTok creator';
      return {
        id: `tt_${i}_${url.slice(-12)}`,
        title: it.title || 'TikTok gaming clip',
        channel: author,
        thumbnail: '',  // TikTok doesn't expose public thumbnails reliably
        url,
        platform: 'tiktok',
        publishedAt: '',
        viewCount: 0,
      };
    }).filter((v: any) => v.url);

    // ── Map X/Twitter → video objects ──
    const xVideos = xItems.map((it: any, i: number) => {
      const url = it.url || '';
      // x.com/username/status/123 → extract @username
      const authorMatch = url.match(/\/([^/?]+)\/status/);
      const author = authorMatch ? `@${authorMatch[1]}` : 'X creator';
      return {
        id: `x_${i}_${url.slice(-12)}`,
        title: it.title || 'X gaming clip',
        channel: author,
        thumbnail: '',  // X doesn't expose public thumbnails reliably
        url,
        platform: 'twitter',
        publishedAt: '',
        viewCount: 0,
      };
    }).filter((v: any) => v.url);

    // ── Map Instagram Reels → video objects ──
    const igVideos = igItems.map((it: any, i: number) => {
      const url = it.url || '';
      return {
        id: `ig_${i}_${url.slice(-12)}`,
        title: it.title || 'Instagram Reel',
        channel: it.author || 'Instagram creator',
        thumbnail: '',  // Instagram doesn't expose public thumbnails reliably
        url,
        platform: 'instagram',
        publishedAt: '',
        viewCount: 0,
      };
    }).filter((v: any) => v.url);

    const videos = [...ytVideos, ...ttVideos, ...xVideos, ...igVideos];

    if (!videos.length) {
      return { videos: [], generatedAt: new Date().toISOString(), game: gameLabel };
    }

    // ONE LLM call → copy pack for each video (much cheaper than N separate calls)
    const videoList = videos.map((v: any, i: number) =>
      `${i + 1}. [${v.platform.toUpperCase()}] "${v.title}" by ${v.channel}`
    ).join('\n');

    const system = 'You are a viral gaming content strategist for African creators. Return ONLY valid JSON.';
    const prompt = `For each of these ${videos.length} trending gaming videos across multiple platforms (YouTube, TikTok, X/Twitter, Instagram Reels), generate a ready-to-post copy pack.

Videos:
${videoList}

Game focus: ${gameLabel}

Return JSON:
{
  "packs": [
    {
      "title": "<6-12 word optimized viral title with 1-2 emojis>",
      "caption": "<under 120 chars, includes comment bait, 1-2 emojis>",
      "hashtags": ["#tag1", "#tag2", "... 8 total"]
    }
  ]
}

Rules:
- packs array MUST have exactly ${videos.length} items, in the same order as the videos above.
- Tailor the caption length to the platform: TikTok captions short & punchy (<100 chars), X captions even shorter (<80 chars), YouTube captions can be longer (up to 120 chars), Instagram Reels captions up to 140 chars.
- Each hashtag array: 8 items, mix of mega (e.g. #gaming) + mid (#naijagamer) + niche. ALL lowercase.
- ALWAYS include #naijagamer and #gamingafrica in every pack.
- For TikTok packs, include #tiktokgaming.
- For X packs, include #gamingtwitter.
- For Instagram packs, include #instagramreels and #reelsgaming.
- Titles should feel authentic, not corporate. Optimise for clicks on the respective platform.
- Captions should reference the gaming moment / Nigerian-African creator culture where natural.
- Return ONLY the JSON, no markdown fences.`;

    let packs: any[] = [];
    try {
      const llmData: any = await llmJson(env, prompt, system, 4500);
      packs = Array.isArray(llmData.packs) ? llmData.packs : [];
    } catch {
      packs = [];
    }

    // Merge packs into videos
    videos.forEach((v: any, i: number) => {
      const p = packs[i] || {};
      v.copyPack = {
        title: typeof p.title === 'string' ? p.title : '',
        caption: typeof p.caption === 'string' ? p.caption : '',
        hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 12) : [],
      };
    });

    return { videos, generatedAt: new Date().toISOString(), game: gameLabel };
  });

  return json(data);
});

// ─── Gaming Feed (Dashboard enrichment: news + dev tweets + reddit) ──────────
// Aggregates three sources in parallel, cached 2h globally:
//   1. NEWS  — articles from trusted gaming journalism (IGN, Polygon, etc.)
//   2. TWEETS — recent posts from official game-dev Twitter accounts
//   3. REDDIT — top posts from the game's subreddit
//
// No auth required (free, public data). The dashboard calls this on mount to
// show a "What's happening in <your game>" feed alongside the trending videos.
// Falls back gracefully: if any source returns empty, the others still render.
app.get('/gaming-feed', async (c) => {
  const env = c.env as Env;
  const game = (c.req.query('game') || 'gaming').trim().toLowerCase();
  const gameLabel = game || 'gaming';

  const cacheKey = `gaming_feed_v1:${gameLabel}`;
  const data = await withCache(env, cacheKey, 2 * 60 * 60, async () => {
    const [news, devTweets, redditPosts] = await Promise.all([
      fetchGamingNews(env, gameLabel, 8),
      fetchDevTweets(env, gameLabel, 6),
      fetchRedditPosts(env, gameLabel, 5),
    ]);
    return {
      news,
      devTweets,
      redditPosts,
      game: gameLabel,
      generatedAt: new Date().toISOString(),
    };
  });

  return json(data);
});


// ─── Channel Audit (free, auth required) ─────────────────────────────────────
// POST /api/audit-channel — runs a fresh audit for a single URL, caches the
// result with adaptive TTL (1h default; 6h for accounts with >1M followers —
// big accounts don't change stats hourly, and this conserves scraper credits),
// and persists a lightweight entry to the `channel_audits` table (Phase 5 source
// of truth) + mirrors it to settings.prefs.audits (legacy jsonb fallback).
//
// Two independent limits:
//   - 8-channel SAVED limit — enforced by the DB trigger on channel_audits
//     (user can only have ≤8 distinct URLs saved at any time)
//   - 50-audit/day limit — enforced here via audits_used_today on profiles
//     (caps scraper-credit spend per user per 24h rolling window)
app.post('/audit-channel', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const rawUrl = (body.url || '').toString().trim();
  const platformHint = (body.platform || '').toString().trim();
  if (!rawUrl) return json({ error: 'url is required' }, 400);

  // Normalise the input up-front so the cache key + saved audit entry use the
  // canonical URL (not whatever the user typed). This means auditing "MrBeast"
  // with platformHint="youtube" and "youtube.com/@MrBeast" both hit the same cache.
  const normalised = normaliseAuditInput(rawUrl, platformHint);
  if (!normalised) return json({ error: 'Unsupported input. Paste a full URL or a username with a platform prefix (yt:name, tt:name, ig:name, x:name, r:name).' }, 400);
  const url = normalised.url;

  // ─── Daily quota check (BEFORE we spend scraper credits) ────────────────────
  // This blocks users who have hit the 50-audit/day cap. It increments the
  // counter even if the audit later fails — so a user spamming bogus URLs gets
  // rate-limited quickly. (We don't refund on audit failure because the
  // scraper credit was already spent upstream.)
  const quota = await checkAndIncrementDailyQuota(env, userId);
  if (!quota.allowed) {
    return json({
      error: `Daily audit limit reached (${quota.used}/${quota.quota}). Resets 24h after ${quota.resetAt}. Try again later.`,
      quota,
    }, 429);
  }

  // Adaptive cache TTL: peek the existing cached value first. If we already
  // know the subscriber count from a previous audit, use the appropriate TTL.
  // Default for first-time audits is 2h (was 1h — too aggressive, caused
  // frequent re-scrapes that cost credits); if the fresh audit comes back
  // with >1M subs, we re-write with 12h TTL (was 6h).
  //
  // Cache key bumped v1 → v2 to invalidate any previously-cached entries that
  // were keyed on non-canonical URLs (before the URL normalisation fix). This
  // ensures every user gets a fresh cache built on the canonical URL going
  // forward, so the same channel always hits the same cache entry.
  const auditCacheKey = await hashKey('channel_audit_v2', url);
  const BIG_ACCOUNT_TTL = 12 * 60 * 60;  // 12h for accounts with >1M followers
  const DEFAULT_TTL = 2 * 60 * 60;       // 2h for everyone else
  const BIG_ACCOUNT_THRESHOLD = 1_000_000;

  // Peek cached value to decide TTL before we even fetch.
  const peeked = await cacheRead<any>(env, auditCacheKey);
  const cacheHit = !!(peeked?.fresh && peeked?.data);
  let inferredTtl = DEFAULT_TTL;
  if (peeked?.data?.statistics?.subscribers !== undefined) {
    inferredTtl = peeked.data.statistics.subscribers >= BIG_ACCOUNT_THRESHOLD
      ? BIG_ACCOUNT_TTL
      : DEFAULT_TTL;
  }

  let audit: any;
  let refreshTtl = inferredTtl;

  if (cacheHit) {
    // Fresh cache hit — return the cached audit immediately. No scraper
    // credits spent, no credit charge for the user.
    audit = peeked.data;
  } else {
    // Cache miss (or stale). Run a fresh audit. We DON'T use withCache
    // here because withCache would cache the result unconditionally —
    // including error payloads like { error: "rate_limited" }. Caching
    // an error would make every subsequent audit for the same URL fail
    // for the full TTL window. Instead we run manually and only cache
    // successful (no `.error`) results.
    try {
      const fresh = await auditChannel(env, url, platformHint);
      if (fresh && !fresh.error) {
        const subs = Number(fresh?.statistics?.subscribers || 0);
        refreshTtl = subs >= BIG_ACCOUNT_THRESHOLD ? BIG_ACCOUNT_TTL : DEFAULT_TTL;
        // Write to L1 + KV cache so the next call hits.
        try {
          await cacheWrite(env, auditCacheKey, fresh, refreshTtl);
        } catch (e: any) {
          console.warn('[audit-channel] cacheWrite failed:', e?.message);
        }
      } else if (fresh?.error) {
        // Scraper returned an error payload (rate limit, not found, etc).
        // Don't cache it. Try to serve stale data if we have any so the
        // user still sees *something*.
        const stale = await cacheReadStale<any>(env, auditCacheKey);
        if (stale && !stale.error) {
          audit = stale;
        } else {
          audit = fresh;  // bubble the error up to the user
        }
      } else {
        audit = fresh;
      }
      if (!audit) audit = fresh;
    } catch (e: any) {
      // auditChannel threw — try stale fallback before giving up.
      const stale = await cacheReadStale<any>(env, auditCacheKey);
      if (stale && !stale.error) {
        console.warn(`[audit-channel] upstream failed, serving stale: ${e?.message}`);
        audit = stale;
      } else {
        return json({ error: `Audit failed: ${e?.message || 'unknown error'}` }, 500);
      }
    }
  }
  if (audit?.error) return json({ error: audit.error, quota }, 400);

  // ─── Phase 5b — charge 1 credit per audit (first one free, cache hits free) ──
  // Cache hits don't spend scraper credits, so they're always free. The first
  // cache MISS is free (the user's one lifetime free audit). Subsequent misses
  // cost 1 credit each. If the user has 0 credits, return 402 without saving.
  const charge = await chargeAuditCredit(env, userId, cacheHit);
  if (charge.error === 'insufficient_credits') {
    return json({
      error: `Out of credits. Channel audits cost ${AUDIT_CREDIT_COST} credit each after your first free audit. Earn more credits by referring friends or upgrade to a paid plan.`,
      charge,
      quota,
    }, 402);
  }

  // Persist to channel_audits table (new) + mirror to settings.prefs.audits
  // (legacy jsonb fallback). The 8-channel-per-user limit is enforced by a
  // DB trigger on the table; if the user already has 8 SAVED channels and this
  // is a new URL, the upsert will fail and we'll return a 409 with a clear
  // message. (Re-auditing an existing URL is always allowed — it just refreshes.)
  const { saved, count } = await upsertChannelAudit(env, userId, {
    url,
    platform: audit.platform,
    channelName: audit.channelName,
    channelHandle: audit.channelHandle,
    avatar: audit.avatar,
    source: audit.source,
    auditedAt: audit.auditedAt,
  });

  return json({ audit, saved, count, quota, charge });
});

// GET /api/channel-audits — returns the user's saved audits WITH the full audit
// data (re-read from the 1h cache so it stays fresh without bloating the DB).
//
// Reads the audit METADATA (url, platform, channel name, etc.) from the
// channel_audits table (Phase 5 source of truth), then for each row, hydrates
// the full audit payload (recent videos, statistics, metrics) from the 1h KV
// cache. If the cache is cold (e.g. the user just signed in after >1h gap),
// we return the metadata + zeroed-out statistics so the card still renders.
//
// Falls back to settings.prefs.audits (legacy jsonb blob) if the table is
// unreachable — so existing deployments don't break.
app.get('/channel-audits', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const audits = await listChannelAudits(env, userId);
  const fullAudits = await Promise.all(
    audits.map(async (entry: any) => {
      try {
        const key = await hashKey('channel_audit_v2', entry.url);
        const cached = await cacheRead<any>(env, key);
        if (cached?.data) {
          return { ...cached.data, url: entry.url };
        }
        // Cache is completely cold (no fresh OR stale entry). Fire a
        // background refresh so the next dashboard refresh will have the
        // full audit data. We don't await this — return metadata immediately
        // so the listing stays fast.
        try {
          const refreshUrl = entry.url;
          const refreshPlatform = entry.platform;
          // Use ctx.waitUntil pattern: kick off the promise but don't block.
          (async () => {
            try {
              const fresh = await auditChannel(env, refreshUrl, refreshPlatform);
              if (fresh && !fresh.error) {
                const subs = Number(fresh?.statistics?.subscribers || 0);
                const ttl = subs >= 1_000_000 ? 12 * 60 * 60 : 2 * 60 * 60;
                await cacheWrite(env, key, fresh, ttl);
              }
            } catch (e: any) {
              console.warn('[channel-audits] background refresh failed:', e?.message);
            }
          })();
        } catch {}
      } catch {}
      // Fallback to entry metadata only
      return {
        ...entry,
        recentVideos: [],
        metrics: { avgRecentViews: 0, totalRecentViews: 0, avgEngagementRate: 0, recentVideoCount: 0 },
        statistics: { subscribers: 0, totalViews: 0, videoCount: 0, hiddenSubscriberCount: true },
      };
    }),
  );
  // Also surface the daily-quota info so the dashboard can show
  // "3 of 50 daily audits used" + "4 of 8 channels saved".
  const profile = await fetchProfile(env, userId);
  const dailyQuota = {
    used: (typeof profile?.audits_used_today === 'number') ? profile.audits_used_today : 0,
    quota: DAILY_AUDIT_QUOTA,
    resetAt: profile?.audit_quota_reset_at || null,
  };
  return json({ audits: fullAudits, count: fullAudits.length, dailyQuota });
});

// DELETE /api/channel-audits?url=... — remove an audit from user's saved list.
// Deletes from BOTH the channel_audits table (new) and settings.prefs.audits
// (legacy jsonb blob). Best-effort — returns success if either side removed
// the row.
app.delete('/channel-audits', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const url = (c.req.query('url') || '').trim();
  if (!url) return json({ error: 'url query param is required' }, 400);
  const deleted = await deleteChannelAudit(env, userId, url);
  return json({ success: true, deleted });
});

// ════════════════════════════════════════════════════════════════════════════
// POST /api/audit-insights — Extensive AI review of an audited channel
// ════════════════════════════════════════════════════════════════════════════
// Body: { url: string, platform?: string, force?: boolean }
//
// Reads the cached audit (1h-6h KV cache) — does NOT re-spend scraper credits.
// Generates an extensive AI review including:
//   - Executive summary (channel health score + narrative)
//   - Best performing videos analysis (top 3 with reasons)
//   - Worst performing videos analysis (bottom 3 with reasons)
//   - SWOT (strengths / weaknesses / opportunities / threats)
//   - Content themes detected
//   - Posting cadence analysis
//   - Engagement trend direction
//   - Recommendations to get back on track (prioritized, actionable)
//   - Growth opportunities
//   - Content gaps to fill
//
// Insights are cached separately for 30min (insights are expensive to regenerate).
// Free for the user (no credit charge — insights reuse cached audit data).
app.post('/audit-insights', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const rawUrl = (body.url || '').toString().trim();
  const platformHint = (body.platform || '').toString().trim();
  const force = !!body.force;
  if (!rawUrl) return json({ error: 'url is required' }, 400);

  // Normalise the URL to match the cache key used by /audit-channel
  const normalised = normaliseAuditInput(rawUrl, platformHint);
  if (!normalised) return json({ error: 'Unsupported input. Paste a full URL or a username with a platform prefix.' }, 400);
  const canonicalUrl = normalised.url;

  // Pull the cached audit (1h-6h TTL) — this is the same KV cache the audit
  // endpoint wrote to. If the cache is cold, we run a fresh audit (this DOES
  // spend scraper credits upstream, but no user-side credit charge).
  const auditCacheKey = await hashKey('channel_audit_v2', canonicalUrl);
  let audit: any;
  const peeked = await cacheRead<any>(env, auditCacheKey);
  if (peeked?.data && (peeked.fresh || !force)) {
    audit = peeked.data;
  } else {
    try {
      audit = await auditChannel(env, canonicalUrl, platformHint);
      // Re-cache for 2h (don't bump to 12h even if it's a big account — we
      // don't want to surprise the user with a long TTL on a forced refresh)
      await cacheWrite(env, auditCacheKey, audit, 2 * 60 * 60);
    } catch (e: any) {
      return json({ error: `Audit failed: ${e?.message || 'unknown error'}` }, 500);
    }
  }
  if (audit?.error) return json({ error: audit.error }, 400);
  if (!audit?.recentVideos?.length) {
    return json({
      error: 'No recent videos available for this channel — cannot generate insights.',
      audit,
    }, 400);
  }

  // Insights cache (2h fresh, 24h stale-while-error) — keyed on the audit
  // cache key + a version tag so we can bust the cache if we change the prompt.
  //
  // Why 2h: insights are expensive to regenerate (LLM call + audit data
  // processing). A 30min TTL meant the user saw the loading skeleton every
  // time they reopened the audit view, which felt like "the audit is not
  // caching". 2h matches the audit-data TTL, so insights stay alive as long
  // as the underlying audit data does.
  //
  // Stale-while-error: if the LLM fails AND we have stale insights (up to 24h
  // old), we serve the stale insights rather than erroring out. KV's
  // STALE_WINDOW (24h past TTL) keeps them around for this purpose.
  const INSIGHTS_VERSION = 'v3-2026-07-19';
  const INSIGHTS_TTL = 2 * 60 * 60;        // 2h fresh
  const insightsKey = await hashKey('channel_insights', INSIGHTS_VERSION, canonicalUrl);
  if (!force) {
    const cached = await cacheRead<any>(env, insightsKey);
    if (cached?.data?.insights) {
      // Serve fresh if fresh, otherwise serve stale (cached.fresh === false means
      // the TTL expired but KV still has it within the 24h stale window).
      return json({
        insights: cached.data.insights,
        audit: { platform: audit.platform, channelName: audit.channelName, channelHandle: audit.channelHandle, url: canonicalUrl },
        cached: true,
        generatedAt: cached.data.generatedAt,
      });
    }
  }

  // Generate insights via LLM
  try {
    const insights = await generateAuditInsights(env, audit);
    const generatedAt = new Date().toISOString();
    // Cache for 2h (KV keeps the entry 24h past TTL for stale-while-error)
    await cacheWrite(env, insightsKey, { insights, generatedAt }, INSIGHTS_TTL);
    return json({
      insights,
      audit: { platform: audit.platform, channelName: audit.channelName, channelHandle: audit.channelHandle, url: canonicalUrl },
      cached: false,
      generatedAt,
    });
  } catch (e: any) {
    console.error('[audit-insights] LLM failed:', e);
    // Stale-while-error: serve old insights if we have any (up to 24h past TTL)
    const stale = await cacheReadStale<any>(env, insightsKey);
    if (stale?.insights) {
      console.warn('[audit-insights] serving stale insights after LLM failure');
      return json({
        insights: stale.insights,
        audit: { platform: audit.platform, channelName: audit.channelName, channelHandle: audit.channelHandle, url: canonicalUrl },
        cached: true,
        stale: true,
        generatedAt: stale.generatedAt,
      });
    }
    return json({
      error: `Failed to generate insights: ${e?.message || 'unknown error'}`,
      audit: { platform: audit.platform, channelName: audit.channelName, channelHandle: audit.channelHandle, url: canonicalUrl },
    }, 500);
  }
});

// ─── generateAuditInsights ───────────────────────────────────────────────────
// Builds the LLM prompt from the audit data and parses the response into the
// AuditInsights shape. Falls back to deterministic heuristics if the LLM fails
// to return valid JSON.
async function generateAuditInsights(env: Env, audit: any): Promise<any> {
  const videos = (audit.recentVideos || []).slice(0, 10);
  const stats = audit.statistics || {};
  const metrics = audit.metrics || {};

  // Sort videos by views (descending) — best performers first
  const byViewsDesc = [...videos].sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0));
  const byViewsAsc = [...byViewsDesc].reverse();

  // Compute posting cadence from publishedAt timestamps
  const timestamps = videos
    .map((v: any) => v.publishedAt ? new Date(v.publishedAt).getTime() : 0)
    .filter((t: number) => t > 0)
    .sort((a: number, b: number) => b - a); // newest first
  let avgGapDays = 0;
  let postingCadenceLabel = 'Unknown';
  if (timestamps.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < timestamps.length - 1; i++) {
      gaps.push((timestamps[i] - timestamps[i + 1]) / 86400000);
    }
    avgGapDays = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGapDays < 1) postingCadenceLabel = 'Multiple times per day';
    else if (avgGapDays < 3) postingCadenceLabel = 'Every 1-3 days';
    else if (avgGapDays < 7) postingCadenceLabel = 'Every 4-7 days';
    else if (avgGapDays < 14) postingCadenceLabel = 'Every 1-2 weeks';
    else if (avgGapDays < 30) postingCadenceLabel = 'Every 2-4 weeks';
    else postingCadenceLabel = 'Less than once a month';
  }

  // Engagement trend: compare first half vs second half of recent videos
  let engagementTrend: 'up' | 'down' | 'flat' = 'flat';
  if (videos.length >= 4) {
    const half = Math.floor(videos.length / 2);
    const recent = videos.slice(0, half);
    const older = videos.slice(half);
    const avgRecent = recent.reduce((s: number, v: any) => s + (v.viewCount || 0), 0) / recent.length;
    const avgOlder = older.reduce((s: number, v: any) => s + (v.viewCount || 0), 0) / older.length;
    if (avgOlder > 0) {
      const ratio = avgRecent / avgOlder;
      if (ratio > 1.15) engagementTrend = 'up';
      else if (ratio < 0.85) engagementTrend = 'down';
    }
  }

  // Health score (0-100) — deterministic baseline, may be overridden by LLM
  const subs = stats.subscribers || 0;
  const avgViews = metrics.avgRecentViews || 0;
  const avgEng = metrics.avgEngagementRate || 0;
  let healthScore = 50;
  if (subs > 0 && avgViews > 0) {
    const viewsRatio = avgViews / subs; // 0-1+, higher = healthier
    if (viewsRatio > 0.5) healthScore += 25;
    else if (viewsRatio > 0.2) healthScore += 15;
    else if (viewsRatio > 0.05) healthScore += 5;
    else healthScore -= 10;
  }
  if (avgEng > 5) healthScore += 15;
  else if (avgEng > 2) healthScore += 8;
  else if (avgEng < 0.5) healthScore -= 8;
  if (engagementTrend === 'up') healthScore += 10;
  else if (engagementTrend === 'down') healthScore -= 10;
  if (postingCadenceLabel.includes('day') || postingCadenceLabel.includes('3 days')) healthScore += 5;
  else if (postingCadenceLabel.includes('month')) healthScore -= 5;
  healthScore = Math.max(5, Math.min(98, healthScore));

  // Build video summaries for the LLM (compact — titles + key stats only)
  const videoSummaries = videos.map((v: any, i: number) => {
    const daysAgo = v.publishedAt ? Math.floor((Date.now() - new Date(v.publishedAt).getTime()) / 86400000) : '?';
    return `${i + 1}. "${v.title}" — ${v.viewCount || 0} views, ${v.likeCount || 0} likes, ${v.commentCount || 0} comments, ${daysAgo}d ago, ${v.duration || 'unknown duration'}`;
  }).join('\n');

  const platformLabel = audit.platform === 'youtube' ? 'YouTube'
    : audit.platform === 'tiktok' ? 'TikTok'
    : audit.platform === 'instagram' ? 'Instagram'
    : audit.platform === 'twitter' ? 'X'
    : audit.platform === 'reddit' ? 'Reddit' : audit.platform;

  const system = `You are an expert content strategist who has audited thousands of ${platformLabel} channels. You analyze channel performance data and produce actionable, specific, data-driven insights for creators. You return ONLY valid JSON — no markdown, no prose outside the JSON.`;

  const prompt = `Audit this ${platformLabel} channel and produce an extensive AI review.

CHANNEL: ${audit.channelName} (${audit.channelHandle || audit.url || 'no handle'})
PLATFORM: ${platformLabel}
SUBSCRIBERS: ${stats.subscribers || 'N/A'}
TOTAL VIEWS: ${stats.totalViews || 'N/A'}
VIDEO COUNT: ${stats.videoCount || 'N/A'}
AVG RECENT VIEWS: ${avgViews}
AVG ENGAGEMENT RATE: ${avgEng}%
POSTING CADENCE: ${postingCadenceLabel} (avg ${avgGapDays.toFixed(1)} days between posts)
ENGAGEMENT TREND: ${engagementTrend.toUpperCase()}
CHANNEL DESCRIPTION: ${(audit.description || 'No description available').slice(0, 500)}

RECENT VIDEOS (newest first, with stats):
${videoSummaries}

Produce a JSON object with this exact shape:
{
  "healthScore": <number 0-100>,
  "healthLabel": "<string: 'Excellent' | 'Strong' | 'Moderate' | 'Needs Work' | 'Critical'>",
  "executiveSummary": "<2-3 sentence narrative summary of channel health, citing specific numbers>",
  "bestPerformingVideos": [
    {
      "title": "<video title>",
      "views": <number>,
      "likes": <number>,
      "comments": <number>,
      "whyItWorked": "<1-2 sentence specific explanation of why this video outperformed — title hook, topic, format, timing, etc.>",
      "replicationTip": "<specific actionable tip on how the creator can replicate this success>"
    }
  ],
  "worstPerformingVideos": [
    {
      "title": "<video title>",
      "views": <number>,
      "likes": <number>,
      "comments": <number>,
      "whyItUnderperformed": "<1-2 sentence specific explanation — weak hook, poor timing, oversaturated topic, etc.>",
      "fixTip": "<specific actionable tip on how to fix this type of underperformance>"
    }
  ],
  "swot": {
    "strengths": ["<3-4 specific strengths>"],
    "weaknesses": ["<3-4 specific weaknesses>"],
    "opportunities": ["<3-4 specific opportunities>"],
    "threats": ["<2-3 specific threats>"]
  },
  "contentThemes": [
    {"theme": "<theme name>", "frequency": "<string: how often it appears>", "performance": "<string: how well it performs>"}
  ],
  "postingCadence": {
    "currentPattern": "<string describing current cadence>",
    "recommendation": "<string with specific recommendation>",
    "optimalFrequency": "<string: suggested posting frequency>"
  },
  "engagementTrend": {
    "direction": "<'up' | 'down' | 'flat'>",
    "analysis": "<1-2 sentence explanation of the trend>",
    "benchmark": "<string: how this compares to typical channels of this size>"
  },
  "recommendations": [
    {
      "priority": "<'high' | 'medium' | 'low'>",
      "category": "<string: e.g. 'Content Strategy', 'Posting Schedule', 'Engagement', 'Title Optimization', 'Format'>",
      "title": "<short title>",
      "description": "<2-3 sentence specific actionable description>",
      "expectedImpact": "<string: expected impact if implemented>"
    }
  ],
  "growthOpportunities": [
    {"opportunity": "<string>", "rationale": "<string>", "effort": "<'low' | 'medium' | 'high'>", "impact": "<'low' | 'medium' | 'high'>"}
  ],
  "contentGaps": [
    {"gap": "<string describing the missing content type>", "suggestion": "<string: what to create>"}
  ],
  "nextSteps": ["<3-5 prioritized action items the creator should do this week>"]
}

Rules:
- Be SPECIFIC. Cite actual video titles, view counts, and stats. No generic advice like "post more consistently" — say "post every Tuesday and Thursday at 7pm based on your top performer published on Tuesday 7pm".
- Use REAL data from the videos above, not made-up examples.
- Limit bestPerformingVideos to top 3, worstPerformingVideos to bottom 3.
- Limit recommendations to 5-7 items, prioritized.
- Limit growthOpportunities to 3-4 items.
- Limit contentGaps to 2-3 items.
- Limit nextSteps to 3-5 items.
- Keep all strings concise but information-dense. No fluff.
- Return ONLY the JSON object, no markdown fences.`;

  let insights: any;
  try {
    insights = await llmJson<any>(env, prompt, system, 6000);
  } catch (e: any) {
    console.warn('[audit-insights] LLM failed, falling back to heuristics:', e?.message);
    insights = buildHeuristicInsights(audit, {
      healthScore,
      postingCadenceLabel,
      avgGapDays,
      engagementTrend,
      byViewsDesc,
      byViewsAsc,
    });
  }

  // Validate / fill missing fields with heuristic fallbacks so the frontend
  // never renders an empty section.
  if (!insights.bestPerformingVideos?.length) {
    insights.bestPerformingVideos = byViewsDesc.slice(0, 3).map((v: any) => ({
      title: v.title,
      views: v.viewCount || 0,
      likes: v.likeCount || 0,
      comments: v.commentCount || 0,
      whyItWorked: 'Top performer by view count — analyze the title hook and topic for replication.',
      replicationTip: 'Re-create this format with a fresh angle or related topic.',
    }));
  }
  if (!insights.worstPerformingVideos?.length) {
    insights.worstPerformingVideos = byViewsAsc.slice(0, 3).map((v: any) => ({
      title: v.title,
      views: v.viewCount || 0,
      likes: v.likeCount || 0,
      comments: v.commentCount || 0,
      whyItUnderperformed: 'Lowest performer by view count — likely weak hook or oversaturated topic.',
      fixTip: 'Test a more specific, curiosity-driven title and a stronger cold open in the first 3 seconds.',
    }));
  }
  if (typeof insights.healthScore !== 'number') insights.healthScore = healthScore;
  if (!insights.healthLabel) {
    insights.healthLabel = healthScore >= 80 ? 'Excellent'
      : healthScore >= 65 ? 'Strong'
      : healthScore >= 45 ? 'Moderate'
      : healthScore >= 25 ? 'Needs Work' : 'Critical';
  }
  if (!insights.executiveSummary) {
    insights.executiveSummary = `${audit.channelName} has ${stats.subscribers || 'an unknown number of'} subscribers and averages ${avgViews} views per recent video with a ${avgEng}% engagement rate. The channel's engagement trend is ${engagementTrend}, with a ${postingCadenceLabel.toLowerCase()} posting cadence.`;
  }
  if (!insights.swot) {
    insights.swot = {
      strengths: [`${stats.subscribers || 'N/A'} subscribers on ${platformLabel}`],
      weaknesses: [`Posting cadence: ${postingCadenceLabel}`],
      opportunities: ['Leverage top-performing video formats for new content'],
      threats: ['Engagement trend is ' + engagementTrend],
    };
  }
  if (!insights.postingCadence) {
    insights.postingCadence = {
      currentPattern: postingCadenceLabel,
      recommendation: engagementTrend === 'down' ? 'Increase posting frequency to reverse the decline' : 'Maintain current cadence',
      optimalFrequency: postingCadenceLabel,
    };
  }
  if (!insights.engagementTrend) {
    insights.engagementTrend = {
      direction: engagementTrend,
      analysis: `Recent videos are ${engagementTrend === 'up' ? 'outperforming' : engagementTrend === 'down' ? 'underperforming' : 'in line with'} older content.`,
      benchmark: 'Compared to the channel\'s own recent average.',
    };
  }
  if (!insights.recommendations?.length) {
    insights.recommendations = [{
      priority: 'high',
      category: 'Content Strategy',
      title: 'Analyze your top performer',
      description: `Your top video "${byViewsDesc[0]?.title || ''}" received ${byViewsDesc[0]?.viewCount || 0} views. Deconstruct what worked — title hook, topic, format, posting time — and apply those patterns to your next 3 uploads.`,
      expectedImpact: 'Potential 30-50% view lift on next videos',
    }];
  }
  if (!insights.contentThemes?.length) insights.contentThemes = [];
  if (!insights.growthOpportunities?.length) insights.growthOpportunities = [];
  if (!insights.contentGaps?.length) insights.contentGaps = [];
  if (!insights.nextSteps?.length) {
    insights.nextSteps = [
      `Replicate the format of "${byViewsDesc[0]?.title || 'your top video'}"`,
      `Refresh the angle of "${byViewsAsc[0]?.title || 'your lowest video'}"`,
      'Maintain your current posting cadence' + (engagementTrend === 'down' ? ' but test new hooks' : ''),
    ];
  }

  return insights;
}

// Heuristic fallback (no LLM) — used when llmJson fails or returns garbage.
function buildHeuristicInsights(audit: any, ctx: any): any {
  const { healthScore, postingCadenceLabel, avgGapDays, engagementTrend, byViewsDesc, byViewsAsc } = ctx;
  return {
    healthScore,
    healthLabel: healthScore >= 80 ? 'Excellent' : healthScore >= 65 ? 'Strong' : healthScore >= 45 ? 'Moderate' : healthScore >= 25 ? 'Needs Work' : 'Critical',
    executiveSummary: `${audit.channelName} shows a ${engagementTrend} engagement trend with a ${postingCadenceLabel.toLowerCase()} posting cadence. Health score: ${healthScore}/100.`,
    bestPerformingVideos: [],
    worstPerformingVideos: [],
    swot: { strengths: [], weaknesses: [], opportunities: [], threats: [] },
    contentThemes: [],
    postingCadence: {
      currentPattern: postingCadenceLabel,
      recommendation: engagementTrend === 'down' ? 'Increase posting frequency' : 'Maintain current cadence',
      optimalFrequency: postingCadenceLabel,
    },
    engagementTrend: {
      direction: engagementTrend,
      analysis: `Recent videos are ${engagementTrend === 'up' ? 'outperforming' : engagementTrend === 'down' ? 'underperforming' : 'in line with'} older content.`,
      benchmark: 'Compared to channel\'s recent average.',
    },
    recommendations: [],
    growthOpportunities: [],
    contentGaps: [],
    nextSteps: [],
  };
}

// GET /api/audit-credits?secret=... — returns live credit balances for all
// configured audit scrapers. Operator-only (requires WORKER_SECRET, same as
// /trends/_diag). Useful as a health indicator in the admin UI.
//
// Returns:
//   {
//     "sociavault": {
//       "configured": true,
//       "total_credits": 141,
//       "keys": [
//         {"label": "primary", "credits": 29, "subscription": "free", "last_updated": "...", "last_source": "audit:tiktok:khaby.lame"},
//         {"label": "backup_2", "credits": 50, ...},
//         {"label": "backup_3", "credits": 50, ...}
//       ]
//     },
//     "scrapecreators": {
//       "configured": true,
//       "credits_remaining": 95,
//       "last_updated": "...",
//       "last_source": "audit:tiktok:khaby.lame",
//       "note": "Updated passively after each ScrapeCreators API call"
//     },
//     "socialdata": {
//       "configured": true,
//       "rate_limit_per_min": 120,
//       "rate_limit_remaining": 119,
//       "last_updated": "...",
//       "note": "Dollar balance not exposed by API; per-minute rate limit shown"
//     },
//     "total_audit_capacity_estimate": "about 120 audits"
//   }
//
// Query params:
//   ?refresh=1 — forces a fresh probe of Sociavault (ScrapeCreators/SocialData are
//                passive-only). Costs 0 credits (Sociavault's /v1/credits is free).
app.get('/audit-credits', async (c) => {
  const env = c.env as Env;
  const secret = c.req.query('secret');
  if (!env.WORKER_SECRET || secret !== env.WORKER_SECRET) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  const refresh = c.req.query('refresh') === '1';

  // ── Sociavault (probe live for fresh values) ────────────────────────────────
  const sociavaultKeys: Array<{ label: 'primary' | 'backup_2' | 'backup_3'; key?: string }> = [
    { label: 'primary',  key: env.SOCIAVAULT_API_KEY },
    { label: 'backup_2', key: env.SOCIAVAULT_API_KEY_2 },
    { label: 'backup_3', key: env.SOCIAVAULT_API_KEY_3 },
  ];
  const sociavaultKeys_out = await Promise.all(
    sociavaultKeys.map(async (k) => {
      if (!k.key) {
        return { label: k.label, configured: false };
      }
      // If refresh=1, force a live probe. Otherwise use the cached snapshot.
      if (refresh) {
        const live = await probeSociavaultCredits(k.key);
        if (live) {
          await recordCreditSnapshot(env, 'sociavault', k.label, {
            credits: live.credits,
            subscription: live.subscription,
            last_source: 'audit-credits:refresh',
          });
          return { label: k.label, configured: true, credits: live.credits, subscription: live.subscription, last_updated: new Date().toISOString(), last_source: 'audit-credits:refresh' };
        }
      }
      const snap = await readCreditSnapshot(env, 'sociavault', k.label);
      return {
        label: k.label,
        configured: true,
        credits: snap?.credits ?? null,
        subscription: snap?.subscription ?? null,
        last_updated: snap?.last_updated ?? null,
        last_source: snap?.last_source ?? null,
      };
    }),
  );
  const sociavaultTotal = sociavaultKeys_out
    .map((k: any) => (typeof k.credits === 'number' ? k.credits : 0))
    .reduce((s: number, n: number) => s + n, 0);

  // ── ScrapeCreators (passive — read last-seen value) ─────────────────────────
  let scrapecreators_out: any = { configured: !!env.SCRAPECREATORS_API_KEY };
  if (env.SCRAPECREATORS_API_KEY) {
    const snap = await readCreditSnapshot(env, 'scrapecreators', 'primary');
    scrapecreators_out = {
      configured: true,
      credits_remaining: snap?.credits ?? null,
      last_updated: snap?.last_updated ?? null,
      last_source: snap?.last_source ?? null,
      note: 'Updated passively after each ScrapeCreators API call. Pass ?refresh=1 to make a probe call (costs 1 credit).',
    };
    // Optional probe — only if ?refresh=1 AND we have no recent snapshot
    if (refresh && (!snap || !snap.last_updated || Date.now() - new Date(snap.last_updated).getTime() > 5 * 60 * 1000)) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        const r = await fetch('https://api.scrapecreators.com/v1/tiktok/profile?handle=khaby.lame', {
          headers: { 'x-api-key': env.SCRAPECREATORS_API_KEY },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (r.ok) {
          const j = await r.json() as any;
          if (typeof j?.credits_remaining === 'number') {
            await recordCreditSnapshot(env, 'scrapecreators', 'primary', {
              credits: j.credits_remaining,
              last_source: 'audit-credits:refresh',
            });
            scrapecreators_out.credits_remaining = j.credits_remaining;
            scrapecreators_out.last_updated = new Date().toISOString();
            scrapecreators_out.last_source = 'audit-credits:refresh';
          }
        }
      } catch {}
    }
  }

  // ── SocialData (passive — per-minute rate, NOT dollar balance) ──────────────
  // Iterate over all 4 configured keys (primary + 3 backups) so the operator
  // can see which keys are alive and which are 401/429.
  const socialdataKeys: Array<{ label: string; key?: string }> = [
    { label: 'primary',  key: env.SOCIALDATA_API_KEY },
    { label: 'backup_2', key: env.SOCIALDATA_API_KEY_2 },
    { label: 'backup_3', key: env.SOCIALDATA_API_KEY_3 },
    { label: 'backup_4', key: env.SOCIALDATA_API_KEY_4 },
  ];
  const socialdataKeys_out = await Promise.all(
    socialdataKeys.map(async (k) => {
      if (!k.key) return { label: k.label, configured: false };
      const snap = await readCreditSnapshot(env, 'socialdata', k.label as any);
      return {
        label: k.label,
        configured: true,
        rate_limit_per_min: snap?.rate_limit_limit ?? null,
        rate_limit_remaining: snap?.rate_limit_remaining ?? null,
        last_updated: snap?.last_updated ?? null,
        last_source: snap?.last_source ?? null,
      };
    }),
  );
  const socialdataConfiguredCount = socialdataKeys_out.filter((k: any) => k.configured).length;
  const socialdata_out: any = {
    configured: socialdataConfiguredCount > 0,
    keys_configured: socialdataConfiguredCount,
    keys: socialdataKeys_out,
    note: 'Dollar balance is not exposed by the SocialData API. Per-minute rate limit (x-ratelimit-* headers) is shown per-key, updated passively after each X audit. Keys are rotated on 401/403/429.',
  };

  // ── Capacity estimate ───────────────────────────────────────────────────────
  // Each full audit costs ~2 credits (1 profile + 1 videos/posts fetch).
  // Sociavault credits + ScrapeCreators credits ÷ 2 = approx audit count.
  const scrapecreatorsCredits = typeof scrapecreators_out.credits_remaining === 'number' ? scrapecreators_out.credits_remaining : 0;
  const totalAudits = Math.floor((sociavaultTotal + scrapecreatorsCredits) / 2);
  const capacity_estimate = `about ${totalAudits} full audits remaining (Sociavault ${sociavaultTotal} + ScrapeCreators ${scrapecreatorsCredits} credits, ~2 per audit)`;

  return json({
    generatedAt: new Date().toISOString(),
    sociavault: {
      configured: !!env.SOCIAVAULT_API_KEY,
      total_credits: sociavaultTotal,
      keys: sociavaultKeys_out,
    },
    scrapecreators: scrapecreators_out,
    socialdata: socialdata_out,
    total_audit_capacity_estimate: capacity_estimate,
  });
});

// POST /api/settings/onboarding — persist onboarding selections to settings.prefs.
// Called by the OnboardingPage on Finish. Falls back to localStorage on error.
app.post('/settings/onboarding', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const onboarding = {
    primaryGame: typeof body.primaryGame === 'string' ? body.primaryGame.slice(0, 60) : '',
    platforms: Array.isArray(body.platforms) ? body.platforms.slice(0, 6) : [],
    goal: typeof body.goal === 'string' ? body.goal.slice(0, 30) : '',
    experience: typeof body.experience === 'string' ? body.experience.slice(0, 30) : '',
    completedAt: new Date().toISOString(),
  };
  await mergeSettingsPrefs(env, userId, { onboarding });
  return json({ success: true, onboarding });
});

// ─── Trend Assets (per-trend copyable content) ──────────────────────────────
// Given a trend name + game + platform, generates 4 sections of copyable assets:
//   - keywords: 4 search phrases (3-5 words each)
//   - titles: 3 video title options (6-14 words, with emojis)
//   - captions: 3 captions (under 120 chars, with emojis + comment bait)
//   - hashtags: 12-15 hashtags (mix of mega/mid/niche, always includes #naijagamer + #gamingafrica)
//
// Auth required, 1 credit per asset pack. One LLM call returns all 4 sections.
app.post('/trends/assets', requireAuth, requireCredits(1), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const trend = (body.trend || '').trim();
  const game = (body.game || 'Gaming').trim();
  const platform = (body.platform || 'tiktok').trim().toLowerCase();
  const category = (body.category || 'title').trim().toLowerCase();

  if (!trend) return json({ error: 'trend is required' }, 400);

  // Cache key — 24h TTL. Same trend+game+platform → identical LLM output.
  // Note: we cache the LLM output, NOT the credits_remaining (that's appended below).
  const cacheKey = await hashKey('trends_assets', trend, game, platform, category);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 24 * 60 * 60, async () => {
      const system = 'You are a viral gaming content strategist for African creators. Return ONLY valid JSON.';
      const prompt = `For this trending topic, generate ready-to-use content assets a creator can copy-paste.

Trend: "${trend}"
Game: ${game}
Platform: ${platform}
Trend category: ${category}

Return JSON:
{
  "keywords": [
    "<3-5 word search phrase a creator would type into YouTube/TikTok search>",
    "<3-5 word search phrase>",
    "<3-5 word search phrase>",
    "<3-5 word search phrase>"
  ],
  "titles": [
    {"text": "<6-14 word video title with 1-2 emojis>", "score": <70-99>},
    {"text": "<6-14 word video title with 1-2 emojis>", "score": <70-99>},
    {"text": "<6-14 word video title with 1-2 emojis>", "score": <70-99>}
  ],
  "captions": [
    {"text": "<under 120 chars, with 1-2 emojis, includes comment bait>", "vibe": "hype"},
    {"text": "<under 120 chars, with 1-2 emojis, includes comment bait>", "vibe": "funny"},
    {"text": "<under 120 chars, with 1-2 emojis, includes comment bait>", "vibe": "savage"}
  ],
  "hashtags": [
    "#<tag1>",
    "#<tag2>",
    "... 12-15 total"
  ]
}

Rules:
- Keywords: phrases people actually search for, not sentences. Lowercase, no hashtags.
- Titles: optimise for ${platform} algorithm, authentic not corporate, rank by score desc.
- Captions: reference Nigerian/African gaming culture where natural, mix vibes.
- Hashtags: 12-15 total. Mix of mega (100M+ posts), mid (1M-100M), niche (<1M).
- ALWAYS include #naijagamer and #gamingafrica in the hashtag list.
- All hashtags lowercase, no spaces, start with #.
- Do not wrap the JSON in markdown fences. Return ONLY the JSON object.`;

      const llmData: any = await llmJson(env, prompt, system, 2000);
      // Defensive defaults in case the LLM omits a field
      llmData.keywords = Array.isArray(llmData.keywords) ? llmData.keywords.slice(0, 4) : [];
      llmData.titles = Array.isArray(llmData.titles) ? llmData.titles.slice(0, 3) : [];
      llmData.captions = Array.isArray(llmData.captions) ? llmData.captions.slice(0, 3) : [];
      llmData.hashtags = Array.isArray(llmData.hashtags) ? llmData.hashtags.slice(0, 18) : [];
      llmData.trend = trend;
      llmData.game = game;
      llmData.platform = platform;
      llmData.generatedAt = new Date().toISOString();
      return llmData;
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }

  // Spend credits AFTER cache lookup — every call charges, even cache hits,
  // because the user gets the same value (instant response).
  data.credits_remaining = await spendCredits(env, userId, 1, 'trends_assets');
  return json(data);
});

// ─── Growth Intel ────────────────────────────────────────────────────────────
app.post('/intel/spy', requireAuth, requirePlan('pro', 'creator'), requireCredits(5), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const channelUrl = body.channelUrl || '';
  const game = body.game || '';
  const channelName = channelUrl.includes('@')
    ? channelUrl.split('@').pop()!.split('/')[0]
    : 'unknown';

  // 12h cache — channel strategy doesn't shift fast, and Serper quota is expensive
  const cacheKey = await hashKey('intel_spy', channelUrl, game);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 12 * 60 * 60, async () => {
  const serp = await serpSearch(env, `site:youtube.com ${channelName} gaming ${game} most popular videos`, 8, 'google');
  const context = serp.slice(0, 6).map((r: any) => `- ${r.title || ''}: ${r.snippet || ''}`).join('\n');
  const system = 'You are a YouTube channel analyst. Return ONLY valid JSON.';
  const prompt = `Analyse this gaming creator's channel strategy:
Channel: ${channelUrl}
Game: ${game || 'unknown'}

Search data found:
${context || 'Limited data available — provide general analysis based on top gaming creators.'}

Return JSON:
{
  "channelName": "<clean name>",
  "avgViews": "<range like 45K-280K>",
  "postingFrequency": "<e.g. 5-7 videos/week>",
  "bestPerformingGame": "<game name>",
  "titlePattern": "<their typical title formula>",
  "thumbnailStyle": "<brief description>",
  "topFormulas": ["<formula1>", "<formula2>", "<formula3>", "<formula4>", "<formula5>"],
  "recommendation": "<2-3 sentences on how to compete with or beat them>"
}`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 5, 'intel_spy');
  return json(data);
});

app.post('/intel/timing', requireAuth, requireCredits(1), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const platform = body.platform || 'TikTok';
  const game = body.game || 'gaming';

  // 24h cache — posting-time windows change slowly
  const cacheKey = await hashKey('intel_timing', platform, game);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 24 * 60 * 60, async () => {
      const system = 'You are a social media timing expert. Return ONLY valid JSON.';
      const prompt = `What are the best times to post ${game} gaming content on ${platform} for Nigerian creators?
Use WAT (West Africa Time = UTC+1) timezone.

Return JSON:
{
  "platform": "${platform}",
  "slots": [
    {"day": "<day>", "time": "<time range WAT>", "score": <0-100>, "label": "<PEAK|GREAT|GOOD>"},
    ... (7 slots, one per day, sorted by score desc)
  ],
  "insight": "<2-3 sentence actionable insight specific to Nigerian ${game} creators>"
}`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 1, 'intel_timing');
  return json(data);
});

app.post('/intel/abtitle', requireAuth, requireCredits(1), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const body = await c.req.json().catch(() => ({}));
  const titleA = body.titleA || '';
  const titleB = body.titleB || '';
  const game = body.game || 'gaming';

  // 7d cache — same titles + game = same analysis (deterministic)
  const cacheKey = await hashKey('intel_abtitle', titleA, titleB, game);

  let data: any;
  try {
    data = await withCache(env, cacheKey, 7 * 24 * 60 * 60, async () => {
      const system = 'You are a YouTube CTR and title optimisation expert. Return ONLY valid JSON.';
      const prompt = `Predict which title will perform better for a ${game} gaming video:

Title A: "${titleA}"
Title B: "${titleB}"

Analyse based on: hook strength, emotional trigger, specificity, emoji usage,
click-through-rate potential, search intent alignment, and mobile scroll-stop power.

Return JSON:
{
  "titleA": "${titleA}",
  "titleB": "${titleB}",
  "winner": "<A or B>",
  "scoreA": <50-99>,
  "scoreB": <50-99>,
  "reasoning": "<2-3 sentences explaining why the winner is better>",
  "improvements": ["<specific improvement 1>", "<improvement 2>", "<improvement 3>"]
}

The winner must have a higher score. Scores must differ by at least 5.`;
      return await llmJson(env, prompt, system);
    });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
  data.credits_remaining = await spendCredits(env, userId, 1, 'intel_abtitle');
  return json(data);
});

// ─── Error logging (frontend → Supabase) ────────────────────────────────────
// Simple Sentry alternative. Frontend posts errors here; we store them in
// the `error_log` table for later triage. Rate-limited to 10/min per IP.
app.post('/log', async (c) => {
  const env = c.env as Env;
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const ok = await rateLimit(env, `log:${ip}`, 10, 60);
  if (!ok) return json({ ok: false, reason: 'rate_limited' }, 429);

  const body = await c.req.json().catch(() => ({}));
  const { level = 'error', message, stack, url, userAgent, userId, extras } = body;
  if (!message || typeof message !== 'string' || message.length > 2000) {
    return json({ ok: false, reason: 'invalid message' }, 400);
  }
  try {
    await sbFetch(env, 'error_log', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        level: String(level).slice(0, 16),
        message: message.slice(0, 2000),
        stack: stack ? String(stack).slice(0, 8000) : null,
        url: url ? String(url).slice(0, 500) : null,
        user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
        user_id: userId || null,
        extras: extras || null,
        ip: ip.slice(0, 64),
      }),
    });
  } catch (e) {
    // If error_log table doesn't exist, just swallow — don't fail the request
    console.warn('[log] failed to persist error:', (e as Error).message);
  }
  return json({ ok: true });
});

// ─── Cron: daily free-tier credit refill ─────────────────────────────────────
// Called by an external cron (cron-job.org / UptimeRobot) once per day at
// midnight WAT. Hits /api/cron/refill?secret=WORKER_SECRET to authenticate.
// Resets all free-tier users back to 50 credits if their balance is below 50.
app.get('/cron/refill', async (c) => {
  const env = c.env as Env;
  const secret = c.req.query('secret');
  if (!secret || secret !== env.WORKER_SECRET) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // Find all free-tier users with credits < 50
  const users = await sbFetch<any[]>(
    env,
    'profiles?plan=eq.free&credits=lt.50&select=id,credits',
  );
  if (!users || users.length === 0) {
    return json({ refilled: 0, message: 'no users need refill' });
  }

  let refilled = 0;
  for (const u of users) {
    const newBalance = 50;
    await sbFetch(env, `profiles?id=eq.${u.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ credits: newBalance }),
    });
    await sbFetch(env, 'credit_transactions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: u.id,
        delta: newBalance - (u.credits || 0),
        reason: 'daily_refill',
      }),
    });
    refilled++;
  }
  return json({ refilled, total_checked: users.length });
});

// ════════════════════════════════════════════════════════════════════════════
// VIRAL ANALYSIS PIPELINE (Phase 1 — URL-in, JSON-out)
// ════════════════════════════════════════════════════════════════════════════
// POST /api/analyse/youtube   — paste URL, get 14 outputs as one JSON (5 credits)
// GET  /api/analyses          — list user's recent analyses (paginated)
// GET  /api/analyses/:id      — fetch a single saved analysis (re-open instantly)
// GET  /api/topic-steal       — anonymized trending-topics dashboard (free)
//
// Architecture: YouTube-Only + Ephemeral Streaming
//   1. Frontend pastes YouTube URL
//   2. Worker fetches video metadata via oEmbed (no API key, no quota)
//   3. Worker fetches transcript via youtube_transcript_api-style scrape
//      (no file storage, no R2 cost, ~50KB JSON in memory)
//   4. Worker calls LLM with one big prompt that returns all 14 outputs as JSON
//   5. Worker stores in `analyses` table + indexes topics into `topic_signals`
//   6. Frontend renders as collapsible cards (existing Viral Forge layout)
//
// Cost per analysis: ~$0.02 (just LLM tokens). No storage cost. No video files.

// ─── YouTube helpers ─────────────────────────────────────────────────────────

/** Extract the 11-char video ID from any YouTube URL form. */
function parseYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/** Fetch video title/author/thumbnail/description.
 * Primary: YouTube Data API v3 (reliable, official, returns description too)
 * Fallback: oEmbed (no description, but always works without a key)
 */
async function fetchYouTubeMeta(videoId: string, env?: Env): Promise<{
  title: string; author: string; thumbnail_url: string;
  description?: string;
} | null> {
  // Primary: YouTube Data API v3 (reliable, official, returns description too)
  const apiKey = env?.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`,
        { cf: { cacheTtl: 3600, cacheEverything: true } },
      );
      if (r.ok) {
        const data = await r.json() as any;
        const item = data?.items?.[0];
        if (item) {
          return {
            title: item.snippet?.title || 'Untitled',
            author: item.snippet?.channelTitle || 'Unknown',
            thumbnail_url: item.snippet?.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            description: item.snippet?.description || '',
          };
        }
      }
    } catch { /* fall through to oEmbed */ }
  }
  // Fallback: oEmbed (no description, but no API key needed)
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { cf: { cacheTtl: 3600, cacheEverything: true } },
    );
    if (!r.ok) return null;
    const data = await r.json() as any;
    return {
      title: data.title || 'Untitled',
      author: data.author_name || 'Unknown',
      thumbnail_url: data.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch { return null; }
}

/**
 * Fetch the YouTube transcript by scraping the watch page.
 *
 * The legacy `timedtext?lang=en&v=` endpoint was deprecated by YouTube — captions
 * now require a signed `baseUrl` that is only available inside the watch page's
 * `ytInitialPlayerResponse` JSON. This function:
 *
 *   1. Fetches https://www.youtube.com/watch?v=VIDEO_ID with a browser UA
 *   2. Extracts the `ytInitialPlayerResponse` JSON blob from the inline <script>
 *   3. Walks `captions.playerCaptionsTracklistRenderer.captionTracks`
 *   4. Picks the best track (English manual > English ASR > first track)
 *   5. Fetches the track's `baseUrl` (with `&fmt=json3` for JSON format)
 *   6. Parses the JSON3 events into `{t, text}` segments
 *
 * Returns null if the video has no captions at all (manual or auto-generated).
 */
async function fetchYouTubeTranscript(videoId: string): Promise<{
  segments: { t: number; text: string }[];
  wordCount: number;
  source: 'manual' | 'asr' | null;
} | null> {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  // ─── Step 1: fetch the watch page ─────────────────────────────────────────
  let watchHtml: string;
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!r.ok) return null;
    watchHtml = await r.text();
  } catch { return null; }

  // ─── Step 2: extract ytInitialPlayerResponse ──────────────────────────────
  // YouTube inlines this as: var ytInitialPlayerResponse = {...};
  // The JSON is huge (often 200KB+), so we use a brace-balanced extractor
  // rather than a non-greedy regex (which would stop at the first inner '}').
  const marker = 'ytInitialPlayerResponse = ';
  const markerIdx = watchHtml.indexOf(marker);
  if (markerIdx === -1) return null;
  const jsonStart = markerIdx + marker.length;
  if (watchHtml[jsonStart] !== '{') return null;
  let depth = 0;
  let inStr = false;
  let escape = false;
  let jsonEnd = -1;
  for (let i = jsonStart; i < watchHtml.length; i++) {
    const ch = watchHtml[i];
    if (inStr) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { jsonEnd = i + 1; break; }
    }
  }
  if (jsonEnd === -1) return null;
  let playerResponse: any;
  try { playerResponse = JSON.parse(watchHtml.slice(jsonStart, jsonEnd)); } catch { return null; }

  // ─── Step 3: find caption tracks ──────────────────────────────────────────
  const tracks: any[] = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks || tracks.length === 0) return null;

  // Step 4: pick best track — English manual first, then English ASR, then any
  const score = (t: any): number => {
    const lang = (t.languageCode || '').toLowerCase();
    const isAsr = t.kind === 'asr';
    if (lang === 'en' && !isAsr) return 100;
    if (lang.startsWith('en') && !isAsr) return 90;
    if (lang === 'en' && isAsr) return 70;
    if (lang.startsWith('en') && isAsr) return 60;
    if (!isAsr) return 30;
    return 10;
  };
  const best = [...tracks].sort((a, b) => score(b) - score(a))[0];
  const isAsr = best.kind === 'asr';

  // ─── Step 5: fetch the caption track as JSON3 ─────────────────────────────
  const baseUrl = (best.baseUrl || '').replace(/\\u0026/g, '&') + '&fmt=json3';
  if (!baseUrl) return null;

  let captionJson: any;
  try {
    const cr = await fetch(baseUrl, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
    if (!cr.ok) return null;
    captionJson = await cr.json() as any;
  } catch { return null; }

  // ─── Step 6: parse JSON3 events into {t, text} segments ───────────────────
  // JSON3 format: { events: [{ tStartMs: 1234, segs: [{ utf8: "Hello" }] }, ...] }
  const events: any[] = captionJson?.events ?? [];
  const segments: { t: number; text: string }[] = [];
  for (const ev of events) {
    if (typeof ev.tStartMs !== 'number') continue;
    const segs: any[] = ev.segs ?? [];
    const text = segs.map((s: any) => s.utf8 || '').join('').trim();
    if (!text) continue;
    // Clean up repeated whitespace and HTML entities
    const cleaned = text
      .replace(/\s+/g, ' ')
      .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/\n/g, ' ')
      .trim();
    if (cleaned) segments.push({ t: ev.tStartMs / 1000, text: cleaned });
  }
  if (segments.length === 0) return null;
  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
  return { segments, wordCount, source: isAsr ? 'asr' : 'manual' };
}

/**
 * Fallback: fetch the video description from the watch page meta tags.
 * Used when no transcript is available — we feed title + description to the
 * LLM as a "synthetic transcript" so the user still gets a (limited) analysis
 * rather than a hard error.
 */
async function fetchYouTubeDescription(videoId: string): Promise<string | null> {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!r.ok) return null;
    const html = await r.text();
    // Try og:description meta tag first
    const ogMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/);
    if (ogMatch && ogMatch[1]) return decodeHtmlEntities(ogMatch[1]);
    // Fallback to description meta tag
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/);
    if (descMatch && descMatch[1]) return decodeHtmlEntities(descMatch[1]);
    return null;
  } catch { return null; }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Build a synthetic transcript from title + description when no real captions
 * exist. Returns a single segment starting at t=0 so downstream code keeps
 * working. The LLM is told the source is the description, not a transcript.
 */
function buildSyntheticTranscript(title: string, description: string | null): {
  segments: { t: number; text: string }[];
  wordCount: number;
  source: 'description';
} {
  const text = description
    ? `${title}. ${description}`
    : title;
  return {
    segments: [{ t: 0, text }],
    wordCount: text.split(/\s+/).length,
    source: 'description',
  };
}

/**
 * Get a usable transcript for a video — fetching real captions if available,
 * falling back to title+description if not. Returns the segments, source type,
 * and metadata so callers can pass the source hint to the LLM.
 *
 * Used by compare / playlist / audio-trend / comments / shadow endpoints so
 * they don't hard-fail on videos without captions.
 */
async function getTranscriptOrFallback(
  videoId: string,
  meta: { title: string; author: string; description?: string },
  env?: Env,
): Promise<{
  segments: { t: number; text: string }[];
  wordCount: number;
  source: 'manual' | 'asr' | 'description';
}> {
  const real = await fetchYouTubeTranscript(videoId);
  if (real && real.segments.length > 0) {
    return {
      segments: real.segments,
      wordCount: real.wordCount,
      source: real.source === 'asr' ? 'asr' : 'manual',
    };
  }
  // Fallback: prefer meta.description (already fetched via Data API) over
  // a separate watch-page scrape (which is more fragile + bot-detected).
  let description = meta.description || null;
  if (!description && env) {
    description = await fetchYouTubeDescription(videoId);
  }
  const synth = buildSyntheticTranscript(meta.title, description);
  return synth;
}

// ─── The unified analysis prompt ─────────────────────────────────────────────
// One prompt → one JSON with all 14 Viral Forge outputs.
// Designed for Gemini 2.0 Flash (or whatever LLM is configured). Returns ~6KB JSON.

const ANALYSIS_SYSTEM_PROMPT = `You are ClipAI's viral analysis engine — the most advanced AI strategist for gaming and short-form video creators.

You analyze YouTube video transcripts and return a complete viral strategy deck as a single JSON object. Your output is consumed by a frontend that renders it as 14 collapsible cards, so each field must be present and well-formed.

You understand:
- YouTube/TikTok/Reels algorithms and what makes the first 5 seconds critical
- Gaming content (Valorant, Apex, Fortnite, Free Fire, PUBG, COD, Mobile Legends)
- Nigerian/African gaming creator culture
- Retention psychology, hook engineering, and emotional pacing
- How to clone a creator's voice/style from their transcript

ALWAYS return a single valid JSON object. No prose, no code fences, no commentary.`;

function buildAnalysisPrompt(
  meta: { title: string; author: string },
  transcript: { t: number; text: string }[],
  gameHint?: string,
  source?: 'manual' | 'asr' | 'description',
): string {
  // Compact transcript: join segments with timestamps, cap at ~12K chars to leave room
  const transcriptText = transcript
    .map(s => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`)
    .join('\n')
    .slice(0, 12000);

  const gameLine = gameHint ? `Likely game: ${gameHint}` : 'Game: infer from transcript content';

  const sourceNote = source === 'description'
    ? `\nNOTE: This video has no captions available. The "transcript" below is the video title + description only. Generate the analysis based on this limited information — leave timestamp-specific fields (sentiment_arc, goldilocks_map, sponsorship_spots) as empty arrays/objects since you cannot infer timestamps. Still produce hook_rewrites, title_variants, distribution_pack, etc. based on the title and description.`
    : source === 'asr'
      ? `\nNOTE: This transcript was auto-generated by YouTube's ASR engine — expect minor transcription errors. Treat the content as accurate but the wording as approximate.`
      : '';

  return `Analyze this YouTube video and return a complete viral strategy deck as JSON.

VIDEO TITLE: ${meta.title}
CHANNEL: ${meta.author}
${gameLine}
${sourceNote}

TRANSCRIPT (with timestamps):
${transcriptText}

Return JSON with EXACTLY this structure (every field required; use empty arrays/strings if N/A):

{
  "hook_score": <number 0.0-10.0>,
  "hook_rewrites": [
    "<alt opener 1 — provocative question>",
    "<alt opener 2 — shocking stat>",
    "<alt opener 3 — pattern interrupt>"
  ],
  "sentiment_arc": [
    {"t": <seconds>, "emotion": "<excitement|confusion|relief|tension|joy|anger|fear|surprise>", "intensity": <0.0-1.0>}
  ],
  "goldilocks_map": {
    "trim": [{"start": <s>, "end": <s>, "reason": "<filler|pause|off-topic|repetition>"}],
    "peak": [{"t": <s>, "label": "<short description of the punchy moment>"}]
  },
  "hidden_gems": [
    {"angle": "<short angle name>", "title": "<YouTube title for this angle>", "why_viral": "<one sentence>", "clip_start": <s>, "clip_end": <s>}
  ],
  "unpopular_opinions": [
    {"quote": "<exact quote from transcript>", "contradiction": "<what it contradicts>", "controversy_hook": "<how to frame it as a hook>"}
  ],
  "title_variants": ["<10 viral title options, 6-14 words, with 1-2 emojis each>"],
  "caption_variants": [
    {"clip_start": <s>, "clip_end": <s>, "captions": ["<3 caption options for this segment, under 120 chars, with emojis>"]}
  ],
  "style_profile": {
    "slang": ["<3-5 slang words/phrases this creator uses>"],
    "emoji_freq": "<none|low|medium|high>",
    "caps_pref": "<lowercase|mixed|shouty>",
    "punctuation": "<minimal|heavy|expressive>"
  },
  "distribution_pack": {
    "x_thread": ["<10 tweets adapting this video's content into a thread, each under 280 chars>"],
    "linkedin": "<500-word LinkedIn thought-leadership article adapting the video's themes>",
    "newsletter": "<3-paragraph newsletter draft with a clickbait subject line>"
  },
  "thumbnail_concepts": [
    {"text": "<short overlay text>", "position": "<top-left|center|bottom-right>", "color": "<yellow|white|red|cyan>", "font_weight": "<bold|black>"}
  ],
  "community_polls": [
    {"question": "<poll question>", "options": ["<4 short options>"]}
  ],
  "sponsorship_spots": [
    {"start": <s>, "end": <s>, "transition_script": "<native transition woven into their wording>"}
  ],
  "pinned_comment_tree": {
    "pinned": "<pinned comment designed to bait replies>",
    "replies": ["<5 drafted replies to anticipated comments, matching the creator's voice>"]
  },
  "shadow_editor_script": {
    "act1": "<hook — 2-3 sentences>",
    "act2": "<tension/build — 4-6 sentences>",
    "act3": "<payoff — 2-3 sentences, formatted for ElevenLabs TTS>"
  },
  "viral_angles": {
    "game": "<inferred game or 'general'>",
    "topics": [
      {"topic": "<lowercase keyword>", "heat": <0.0-1.0>, "category": "<weapon|boss|strategy|meta|drama|general>"}
    ],
    "strategic_notes": "<2-3 sentence summary of why this video will or won't go viral>"
  },
  "pacing_analysis": {
    "wpm": <words per minute>,
    "silence_count": <integer>,
    "cut_recommendations": ["<specific edit recommendations>"]
  }
}

Rules:
- Timestamps are in SECONDS (float). Use the transcript's actual timestamps.
- All arrays must have at least 1 item (use 3-10 where natural).
- title_variants must have EXACTLY 10 items.
- x_thread must have EXACTLY 10 items.
- thumbnail_concepts must have 5 items.
- community_polls must have 5 items.
- Match the creator's natural voice in hook_rewrites, caption_variants, pinned_comment_tree, and distribution_pack.
- Be specific and actionable — no generic advice like "improve your hook." Give exact rewrites.`;
}

// ─── POST /api/analyse/youtube ───────────────────────────────────────────────
app.post('/analyse/youtube', requireAuth, requireCredits(5), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const startedAt = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const url: string = (body.youtubeUrl || body.url || '').trim();
  const gameHint: string | undefined = body.game;

  if (!url) return json({ error: 'youtubeUrl is required' }, 400);
  const videoId = parseYouTubeId(url);
  if (!videoId) return json({ error: 'Could not parse a YouTube video ID from that URL' }, 400);

  // Dedupe: if this user already analyzed this exact URL in the last 24h, return cached
  const existing = await sbFetch<any[]>(
    env,
    `analyses?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&status=eq.completed&select=id,created_at,analysis_raw`,
  );
  if (existing && existing.length > 0) {
    const row = existing[0];
    const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
    if (ageHours < 24) {
      // Return the cached analysis (no credit charge — they already paid)
      return json({
        analysis_id: row.id,
        cached: true,
        analysis: row.analysis_raw,
        credits_remaining: (c.get('profile') as Profile).credits,
      });
    }
  }

  // 1. Fetch video metadata (uses YOUTUBE_API_KEY if set, falls back to oEmbed)
  const meta = await fetchYouTubeMeta(videoId, env);
  if (!meta) {
    return json({ error: 'Could not fetch video metadata. The video may be private or age-restricted.' }, 422);
  }

  // 2. Fetch transcript (with description-based fallback so users still get
  //    a limited analysis instead of a hard error for videos with no captions)
  let transcript = await fetchYouTubeTranscript(videoId);
  let transcriptSource: 'manual' | 'asr' | 'description' = 'description';
  if (transcript && transcript.segments.length > 0) {
    transcriptSource = transcript.source === 'asr' ? 'asr' : 'manual';
  } else {
    // Fallback: use title + description as a synthetic 1-segment transcript.
    // Prefer meta.description (already fetched via Data API) over a separate
    // watch-page scrape.
    let description = meta.description || null;
    if (!description) description = await fetchYouTubeDescription(videoId);
    const synth = buildSyntheticTranscript(meta.title, description);
    transcript = { segments: synth.segments, wordCount: synth.wordCount, source: 'description' };
  }

  // 3. Call LLM with the unified prompt
  let analysisJson: any;
  try {
    analysisJson = await llmJson(
      env,
      buildAnalysisPrompt(meta, transcript.segments, gameHint, transcriptSource),
      ANALYSIS_SYSTEM_PROMPT,
      8000,
    );
  } catch (e: any) {
    return json({ error: 'AI analysis failed: ' + e.message }, 502);
  }

  // 4. Persist to analyses table
  const newRow = {
    user_id: userId,
    source_url: url,
    source_platform: 'youtube',
    source_video_id: videoId,
    video_title: meta.title,
    video_author: meta.author,
    thumbnail_url: meta.thumbnail_url,
    transcript: JSON.stringify(transcript.segments),
    transcript_word_count: transcript.wordCount,
    hook_score: analysisJson.hook_score ?? null,
    hook_rewrites: JSON.stringify(analysisJson.hook_rewrites ?? []),
    sentiment_arc: JSON.stringify(analysisJson.sentiment_arc ?? []),
    goldilocks_map: JSON.stringify(analysisJson.goldilocks_map ?? {}),
    hidden_gems: JSON.stringify(analysisJson.hidden_gems ?? []),
    unpopular_opinions: JSON.stringify(analysisJson.unpopular_opinions ?? []),
    title_variants: JSON.stringify(analysisJson.title_variants ?? []),
    caption_variants: JSON.stringify(analysisJson.caption_variants ?? []),
    style_profile: JSON.stringify(analysisJson.style_profile ?? {}),
    distribution_pack: JSON.stringify(analysisJson.distribution_pack ?? {}),
    thumbnail_concepts: JSON.stringify(analysisJson.thumbnail_concepts ?? []),
    community_polls: JSON.stringify(analysisJson.community_polls ?? []),
    sponsorship_spots: JSON.stringify(analysisJson.sponsorship_spots ?? []),
    pinned_comment_tree: JSON.stringify(analysisJson.pinned_comment_tree ?? {}),
    shadow_editor_script: JSON.stringify(analysisJson.shadow_editor_script ?? {}),
    viral_angles: JSON.stringify(analysisJson.viral_angles ?? {}),
    pacing_analysis: JSON.stringify(analysisJson.pacing_analysis ?? {}),
    analysis_raw: JSON.stringify(analysisJson),
    llm_model: env.LLM_MODEL || 'auto',
    processing_ms: Date.now() - startedAt,
    status: 'completed',
  };

  const inserted = await sbFetch<any[]>(env, 'analyses', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(newRow),
  });

  const analysisId = inserted && inserted[0] ? inserted[0].id : null;

  // 5. Index topics for the Topic Steal dashboard (best-effort, non-blocking)
  // We call the Postgres function via RPC. If it fails, we don't care — the
  // analysis still succeeded.
  if (analysisId && analysisJson.viral_angles?.topics?.length) {
    try {
      await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/index_analysis_topics`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_analysis_id: analysisId }),
      });
    } catch { /* non-fatal */ }
  }

  // 6. Award XP + spend credits
  await awardXp(env, userId, 'analyse', XP_REWARDS.analyse, analysisId || undefined);
  const newBalance = await spendCredits(env, userId, 5, 'analyse_youtube');

  return json({
    analysis_id: analysisId,
    cached: false,
    analysis: analysisJson,
    video: { title: meta.title, author: meta.author, thumbnail_url: meta.thumbnail_url, video_id: videoId },
    transcript_segments: transcript.segments.length,
    processing_ms: Date.now() - startedAt,
    credits_remaining: newBalance,
  });
});

// ─── GET /api/analyses — list user's recent analyses ─────────────────────────
app.get('/analyses', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const rows = await sbFetch<any[]>(
    env,
    `analyses?user_id=eq.${userId}&status=eq.completed&order=created_at.desc&limit=${limit}&offset=${offset}` +
    `&select=id,source_url,source_video_id,video_title,video_author,thumbnail_url,hook_score,created_at,processing_ms`,
  );

  return json({ analyses: rows || [], count: rows?.length || 0 });
});

// ─── GET /api/analyses/:id — fetch a single saved analysis ───────────────────
app.get('/analyses/:id', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const id = c.req.param('id');

  const rows = await sbFetch<any[]>(
    env,
    `analyses?id=eq.${id}&user_id=eq.${userId}&select=*`,
  );

  if (!rows || rows.length === 0) {
    return json({ error: 'Analysis not found' }, 404);
  }

  return json({ analysis: rows[0] });
});

// ─── GET /api/topic-steal — anonymized trending topics dashboard ─────────────
// Public (requireAuth only to keep it user-gated; data itself is anonymous).
//
// Query params:
//   game  — filter by game (default: all)
//   limit — max rows (default 20, max 100)
//   days  — aggregation window: 7, 14, 30, or 90 (default 14)
//           14 uses the pre-aggregated view; others call get_topic_steal(days) RPC.
app.get('/topic-steal', requireAuth, async (c) => {
  const env = c.env as Env;
  const game = c.req.query('game') || '';
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const allowedDays = new Set([7, 14, 30, 90]);
  const daysNum = parseInt(c.req.query('days') || '14', 10);
  const days = allowedDays.has(daysNum) ? daysNum : 14;

  // Cache 5min globally — same data for every user
  const cacheKey = await hashKey('topic_steal', game, limit, days);
  const data = await withCache(env, cacheKey, 300, async () => {
    let rows: any[] | null;
    if (days === 14) {
      // Fast path: use the pre-aggregated view
      const filter = game ? `&game=eq.${encodeURIComponent(game)}` : '';
      rows = await sbFetch<any[]>(
        env,
        `topic_steal_dashboard?order=mention_count.desc,avg_heat.desc&limit=${limit}${filter}`,
      );
    } else {
      // RPC path: call get_topic_steal(p_days) — returns aggregated rows
      // filtered by the time window. We then optionally filter by game in JS.
      const rpcRes = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/get_topic_steal`, {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ p_days: days }),
      });
      rows = rpcRes.ok ? await rpcRes.json() as any[] : [];
      if (game) {
        rows = (rows || []).filter((r) => r.game === game);
      }
      // Apply limit (RPC already orders by mention_count desc, avg_heat desc)
      rows = (rows || []).slice(0, limit);
    }
    return { topics: rows || [], days, generated_at: new Date().toISOString() };
  });

  return json(data);
});

// ─── POST /api/analyse/compare — Competitor Lab (Phase 2) ────────────────────
// Takes 2 YouTube URLs, returns head-to-head comparison:
//   - viral_gap       (what A did that B didn't, and vice versa)
//   - voice_gap       (style differences)
//   - predictive_comments (predicted comment threads for both)
//   - comparison_metrics (retention, hook, pacing, distribution)
//
// Charges 10 credits. Reuses cached analyses if either URL was analyzed
// within the last 24h to avoid re-running the expensive transcript+LLM pass.
const COMPARE_SYSTEM_PROMPT = `You are ClipAI's Competitor Lab — a head-to-head video comparison engine for gaming creators. You take two YouTube video analyses and produce a single comparison JSON that surfaces every viral angle the first creator missed and the second one nailed.

ALWAYS return a single valid JSON object. No prose, no code fences, no commentary.`;

function buildComparePrompt(
  a: { title: string; author: string; transcriptText: string; analysis: any },
  b: { title: string; author: string; transcriptText: string; analysis: any },
): string {
  return `Compare these two YouTube videos and produce a viral-gap analysis as JSON.

VIDEO A
Title: ${a.title}
Channel: ${a.author}
Hook score: ${a.analysis?.hook_score ?? 'n/a'}
Top titles: ${JSON.stringify(a.analysis?.title_variants?.slice(0, 3) ?? [])}
Style profile: ${JSON.stringify(a.analysis?.style_profile ?? {})}
Strategic notes: ${a.analysis?.viral_angles?.strategic_notes ?? ''}

Transcript A (excerpt):
${a.transcriptText.slice(0, 4000)}

VIDEO B
Title: ${b.title}
Channel: ${b.author}
Hook score: ${b.analysis?.hook_score ?? 'n/a'}
Top titles: ${JSON.stringify(b.analysis?.title_variants?.slice(0, 3) ?? [])}
Style profile: ${JSON.stringify(b.analysis?.style_profile ?? {})}
Strategic notes: ${b.analysis?.viral_angles?.strategic_notes ?? ''}

Transcript B (excerpt):
${b.transcriptText.slice(0, 4000)}

Return JSON with EXACTLY this structure:

{
  "winner": "<A|B|tie>",
  "winner_reason": "<one sentence on why>",
  "viral_gap": {
    "a_missed": ["<3-5 viral angles A could have used but didn't>"],
    "b_missed": ["<3-5 viral angles B could have used but didn't>"],
    "a_exclusive_wins": ["<2-4 things A did that B should copy>"],
    "b_exclusive_wins": ["<2-4 things B did that A should copy>"]
  },
  "voice_gap": {
    "a_voice": "<one-sentence description of A's voice/style>",
    "b_voice": "<one-sentence description of B's voice/style>",
    "differences": ["<3-5 concrete style differences>"],
    "recommendation": "<which voice to clone for what audience>"
  },
  "predictive_comments": {
    "a": [
      {"type": "<praise|criticism|question|debate|spam>", "comment": "<predicted comment text>", "likely_engagement": "<low|medium|high|viral>"}
    ],
    "b": [
      {"type": "<praise|criticism|question|debate|spam>", "comment": "<predicted comment text>", "likely_engagement": "<low|medium|high|viral>"}
    ]
  },
  "comparison_metrics": {
    "hook": {"a": <0-10>, "b": <0-10>, "advantage": "<A|B|tie>"},
    "pacing": {"a": "<slow|medium|fast>", "b": "<slow|medium|fast>", "advantage": "<A|B|tie>"},
    "distribution": {"a": "<weak|medium|strong>", "b": "<weak|medium|strong>", "advantage": "<A|B|tie>"},
    "retention": {"a": "<low|medium|high>", "b": "<low|medium|high>", "advantage": "<A|B|tie>"}
  },
  "steal_playbook": [
    "<5-7 concrete actions the loser should steal from the winner>"
  ]
}

Rules:
- predictive_comments.a and .b must each have at least 4 items.
- steal_playbook must have exactly 5-7 items, each under 120 chars.
- Be specific — quote timestamps or wording from transcripts when possible.`;
}

app.post('/analyse/compare', requireAuth, requirePlan('pro', 'creator'), requireCredits(10), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const startedAt = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const urlA: string = (body.urlA || '').trim();
  const urlB: string = (body.urlB || '').trim();

  if (!urlA || !urlB) return json({ error: 'urlA and urlB are both required' }, 400);
  if (urlA === urlB) return json({ error: 'Cannot compare a video to itself' }, 400);

  const idA = parseYouTubeId(urlA);
  const idB = parseYouTubeId(urlB);
  if (!idA || !idB) return json({ error: 'Could not parse YouTube IDs from both URLs' }, 400);

  // Helper: get analysis + transcript for one URL (reuses cached row if recent)
  const getAnalysis = async (url: string, id: string) => {
    // Look up cached row
    const cached = await sbFetch<any[]>(
      env,
      `analyses?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&status=eq.completed&select=id,analysis_raw,transcript,video_title,video_author&order=created_at.desc&limit=1`,
    );
    if (cached && cached.length > 0) {
      const row = cached[0];
      const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 3_600_000;
      if (ageHours < 24 && row.analysis_raw) {
        let transcript: { t: number; text: string }[] = [];
        try { transcript = typeof row.transcript === 'string' ? JSON.parse(row.transcript) : (row.transcript || []); } catch { /* ignore */ }
        return {
          cached: true,
          analysis: typeof row.analysis_raw === 'string' ? JSON.parse(row.analysis_raw) : row.analysis_raw,
          title: row.video_title || 'Untitled',
          author: row.video_author || 'Unknown',
          transcriptText: transcript.map((s: any) => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n'),
        };
      }
    }
    // Fetch fresh
    const meta = await fetchYouTubeMeta(id, env);
    if (!meta) throw new Error(`Could not fetch metadata for video ${id}`);
    const tr = await getTranscriptOrFallback(id, meta, env);
    const analysisJson = await llmJson(env, buildAnalysisPrompt(meta, tr.segments, undefined, tr.source), ANALYSIS_SYSTEM_PROMPT, 8000);
    return {
      cached: false,
      analysis: analysisJson,
      title: meta.title,
      author: meta.author,
      transcriptText: tr.segments.map(s => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n'),
    };
  };

  let a: Awaited<ReturnType<typeof getAnalysis>>;
  let b: Awaited<ReturnType<typeof getAnalysis>>;
  try {
    [a, b] = await Promise.all([getAnalysis(urlA, idA), getAnalysis(urlB, idB)]);
  } catch (e: any) {
    return json({ error: e.message || 'Failed to fetch one of the videos' }, 422);
  }

  // Run comparison LLM call
  let comparison: any;
  try {
    comparison = await llmJson(env, buildComparePrompt(a, b), COMPARE_SYSTEM_PROMPT, 4000);
  } catch (e: any) {
    return json({ error: 'Comparison AI failed: ' + e.message }, 502);
  }

  // Spend credits (already reserved by requireCredits but commit the ledger entry)
  const newBalance = await spendCredits(env, userId, 10, 'analyse_compare');

  return json({
    comparison,
    videos: {
      a: { title: a.title, author: a.author, video_id: idA, url: urlA, hook_score: a.analysis?.hook_score ?? null },
      b: { title: b.title, author: b.author, video_id: idB, url: urlB, hook_score: b.analysis?.hook_score ?? null },
    },
    cached: { a: a.cached, b: b.cached },
    processing_ms: Date.now() - startedAt,
    credits_remaining: newBalance,
  });
});

// ─── POST /api/playlist/sequence — Playlist Architect (Phase 3) ──────────────
// Takes 2-10 YouTube URLs, returns an optimal sequence + distribution plan:
//   - ordered sequence (with rationale)
//   - distribution_schedule (per platform)
//   - cross_promotion_hooks (how to link videos together)
//   - retention_forecast (rough projected retention curve)
//
// Charges 5 credits. Reuses cached analyses where possible.
const PLAYLIST_SYSTEM_PROMPT = `You are ClipAI's Playlist Architect — a multi-video sequencing strategist. You take 2-10 YouTube video analyses and produce an optimal publishing order + cross-platform distribution plan that maximizes total watch time.

ALWAYS return a single valid JSON object. No prose, no code fences, no commentary.`;

function buildPlaylistPrompt(items: Array<{ title: string; author: string; analysis: any }>): string {
  const itemsBlock = items.map((it, i) =>
    `${i + 1}. "${it.title}" by ${it.author} — hook: ${it.analysis?.hook_score ?? '?'}/10, game: ${it.analysis?.viral_angles?.game ?? 'general'}, topics: ${JSON.stringify((it.analysis?.viral_angles?.topics ?? []).slice(0, 3).map((t: any) => t.topic))}`,
  ).join('\n');

  return `You are given ${items.length} YouTube videos from a creator's library. Produce an optimal sequence + distribution plan as JSON.

VIDEOS:
${itemsBlock}

Return JSON with EXACTLY this structure:

{
  "recommended_order": [
    {"position": 1, "title": "<exact title from list>", "rationale": "<one sentence why this goes first>"}
  ],
  "distribution_schedule": {
    "youtube": [{"day": 1, "video": "<title>", "time": "<HH:MM 24h>", "reason": "<why this slot>"}],
    "tiktok":  [{"day": 1, "video": "<title>", "clip_segment": "<start-end seconds>", "reason": "<why>"}],
    "x":       [{"day": 1, "video": "<title>", "format": "<thread|single|clip>", "reason": "<why>"}],
    "shorts":  [{"day": 1, "video": "<title>", "clip_segment": "<start-end seconds>", "reason": "<why>"}]
  },
  "cross_promotion_hooks": [
    {"from_video": "<title>", "to_video": "<title>", "hook_script": "<2-3 sentence spoken call-out to weave into the end of the from_video>"}
  ],
  "retention_forecast": {
    "expected_peak_video": "<title>",
    "expected_weak_video": "<title>",
    "total_projected_watch_hours": <number>,
    "notes": "<2-3 sentence rationale>"
  },
  "thematic_arc": "<2-3 sentence description of the narrative arc across the sequence>"
}

Rules:
- recommended_order must include every input video, exactly once.
- distribution_schedule.youtube must have at least ${Math.min(items.length, 3)} entries.
- cross_promotion_hooks should have ${Math.max(2, Math.min(items.length - 1, 5))} entries.`;
}

app.post('/playlist/sequence', requireAuth, requirePlan('pro', 'creator'), requireCredits(5), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const startedAt = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const urls: string[] = Array.isArray(body.urls) ? body.urls.map((u: string) => u.trim()).filter(Boolean) : [];

  if (urls.length < 2) return json({ error: 'Provide at least 2 URLs to sequence' }, 400);
  if (urls.length > 10) return json({ error: 'Maximum 10 URLs per playlist' }, 400);

  // Dedupe
  const uniqueUrls = Array.from(new Set(urls));
  if (uniqueUrls.length !== urls.length) {
    return json({ error: 'Duplicate URLs detected. Remove duplicates and retry.' }, 400);
  }

  // Parse IDs
  const parsed = uniqueUrls.map(u => ({ url: u, id: parseYouTubeId(u) }));
  const bad = parsed.find(p => !p.id);
  if (bad) return json({ error: `Could not parse YouTube ID from: ${bad.url}` }, 400);

  // Fetch analyses (cached where possible)
  const getOne = async (url: string, id: string) => {
    const cached = await sbFetch<any[]>(
      env,
      `analyses?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&status=eq.completed&select=id,analysis_raw,video_title,video_author&order=created_at.desc&limit=1`,
    );
    if (cached && cached.length > 0 && cached[0].analysis_raw) {
      const row = cached[0];
      return {
        title: row.video_title || 'Untitled',
        author: row.video_author || 'Unknown',
        analysis: typeof row.analysis_raw === 'string' ? JSON.parse(row.analysis_raw) : row.analysis_raw,
      };
    }
    // Fresh
    const meta = await fetchYouTubeMeta(id, env);
    if (!meta) throw new Error(`Could not fetch metadata for ${id}`);
    const tr = await getTranscriptOrFallback(id, meta, env);
    const analysisJson = await llmJson(env, buildAnalysisPrompt(meta, tr.segments, undefined, tr.source), ANALYSIS_SYSTEM_PROMPT, 8000);
    return { title: meta.title, author: meta.author, analysis: analysisJson };
  };

  let items: Array<{ title: string; author: string; analysis: any }>;
  try {
    items = await Promise.all(parsed.map(p => getOne(p.url, p.id!)));
  } catch (e: any) {
    return json({ error: e.message || 'Failed to fetch one or more videos' }, 422);
  }

  // Run playlist LLM
  let playlist: any;
  try {
    playlist = await llmJson(env, buildPlaylistPrompt(items), PLAYLIST_SYSTEM_PROMPT, 4000);
  } catch (e: any) {
    return json({ error: 'Playlist AI failed: ' + e.message }, 502);
  }

  const newBalance = await spendCredits(env, userId, 5, 'playlist_sequence');

  return json({
    playlist,
    videos: items.map((it, i) => ({
      url: parsed[i].url,
      video_id: parsed[i].id,
      title: it.title,
      author: it.author,
      hook_score: it.analysis?.hook_score ?? null,
    })),
    processing_ms: Date.now() - startedAt,
    credits_remaining: newBalance,
  });
});

// ─── POST /api/analyse/audio-trend — Phase 4: Audio Trend Sync ───────────────
// Takes a YouTube URL. Reuses the cached analysis if available, otherwise
// runs a fresh Deep Analysis (no extra charge for the analysis itself — only
// the audio-trend call is charged). Returns:
//   - trending_sounds: 5-8 fictional-but-plausible trending audio suggestions
//     mapped to the video's vibe + game, each with usage notes
//   - sync_points: 3-5 timestamps where the audio beat drop should hit
//   - alt_genres: 3 alternative audio genres that fit the content
//   - miss_warning: what happens if uploaded without trending audio
//
// Charges 3 credits. Available to all logged-in users.
const AUDIO_TREND_SYSTEM_PROMPT = `You are ClipAI's Audio Trend Sync engine — an expert in short-form audio trends across TikTok, Reels, and YouTube Shorts. You understand which sound types pair with which content vibes, where to place beat drops for maximum retention, and how platform algorithms favor trending audio.

ALWAYS return a single valid JSON object. No prose, no code fences, no commentary.`;

function buildAudioTrendPrompt(item: { title: string; author: string; analysis: any; transcriptText: string }): string {
  const topics = (item.analysis?.viral_angles?.topics ?? []).slice(0, 5).map((t: any) => t.topic);
  const style = item.analysis?.style_profile ?? {};
  return `Given this YouTube video, suggest an audio strategy for repurposing it as a short-form clip (TikTok / Reels / Shorts).

VIDEO
Title: ${item.title}
Channel: ${item.author}
Hook score: ${item.analysis?.hook_score ?? 'n/a'}/10
Game/Category: ${item.analysis?.viral_angles?.game ?? 'general'}
Topics: ${JSON.stringify(topics)}
Style: ${JSON.stringify(style)}

Transcript excerpt:
${item.transcriptText.slice(0, 2500)}

Return JSON with EXACTLY this structure:

{
  "trending_sounds": [
    {
      "name": "<plausible trending sound name, can be fictional>",
      "vibe": "<hype|emotional|comedic|cinematic|chill>",
      "why_it_fits": "<one sentence>",
      "usage_tip": "<one sentence on how to apply: e.g. 'use as background, lower volume 30%'>",
      "platform_fit": ["tiktok", "reels", "shorts"]
    }
  ],
  "sync_points": [
    {
      "t": <seconds: number>,
      "label": "<what happens at this moment>",
      "beat_action": "<cut on beat|speed ramp|zoom punch|freeze frame>",
      "why": "<one sentence>"
    }
  ],
  "alt_genres": [
    {"genre": "<genre>", "best_for": "<one phrase>", "risk": "<one phrase>"}
  ],
  "miss_warning": "<2-3 sentence warning about uploading without trending audio — algorithmic penalty, lower reach, etc.>"
}

Rules:
- trending_sounds: 5-8 entries
- sync_points: 3-5 entries, t must be a number in seconds
- alt_genres: 3 entries
- Quote real moments from the transcript in sync_points labels where possible.`;
}

app.post('/analyse/audio-trend', requireAuth, requireCredits(3), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const startedAt = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const url: string = (body.youtubeUrl || body.url || '').trim();

  if (!url) return json({ error: 'youtubeUrl is required' }, 400);
  const videoId = parseYouTubeId(url);
  if (!videoId) return json({ error: 'Could not parse a YouTube video ID from that URL' }, 400);

  // Reuse cached analysis if available (within 24h)
  const cached = await sbFetch<any[]>(
    env,
    `analyses?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&status=eq.completed&select=id,analysis_raw,transcript,video_title,video_author&order=created_at.desc&limit=1`,
  );
  let analysis: any;
  let title: string;
  let author: string;
  let transcriptText: string;

  if (cached && cached.length > 0 && cached[0].analysis_raw) {
    const row = cached[0];
    analysis = typeof row.analysis_raw === 'string' ? JSON.parse(row.analysis_raw) : row.analysis_raw;
    title = row.video_title || 'Untitled';
    author = row.video_author || 'Unknown';
    let transcript: { t: number; text: string }[] = [];
    try { transcript = typeof row.transcript === 'string' ? JSON.parse(row.transcript) : (row.transcript || []); } catch { /* ignore */ }
    transcriptText = transcript.map((s: any) => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
  } else {
    // Fetch fresh
    const meta = await fetchYouTubeMeta(videoId, env);
    if (!meta) return json({ error: 'Could not fetch video metadata' }, 422);
    const tr = await getTranscriptOrFallback(videoId, meta, env);
    analysis = await llmJson(env, buildAnalysisPrompt(meta, tr.segments, undefined, tr.source), ANALYSIS_SYSTEM_PROMPT, 8000);
    title = meta.title;
    author = meta.author;
    transcriptText = tr.segments.map(s => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
  }

  let audioTrend: any;
  try {
    audioTrend = await llmJson(env, buildAudioTrendPrompt({ title, author, analysis, transcriptText }), AUDIO_TREND_SYSTEM_PROMPT, 3000);
  } catch (e: any) {
    return json({ error: 'Audio trend AI failed: ' + e.message }, 502);
  }

  const newBalance = await spendCredits(env, userId, 3, 'analyse_audio_trend');

  return json({
    audio_trend: audioTrend,
    video: { title, author, video_id: videoId, url },
    cached_analysis: !!(cached && cached.length > 0 && cached[0].analysis_raw),
    processing_ms: Date.now() - startedAt,
    credits_remaining: newBalance,
  });
});

// ─── POST /api/analyse/comments — Phase 4: Predictive Comments Lite ──────────
// Takes a YouTube URL. Returns predicted viewer comments for that single video:
//   - praise: 3-5 likely positive comments
//   - criticism: 3-5 likely negative comments
//   - questions: 3-5 likely questions
//   - debate: 2-4 controversial takes likely to spark thread
//   - spam: 2-3 likely spam comments (for moderation training)
//   - pinned_suggestion: the comment the creator should pin to seed engagement
//
// Charges 2 credits. Reuses cached analysis + transcript where possible.
const COMMENTS_SYSTEM_PROMPT = `You are ClipAI's Predictive Comments engine — you predict the exact kinds of comments a YouTube video will receive based on its transcript. You understand viewer psychology, gaming community in-jokes, and which phrasings spark thread replies.

ALWAYS return a single valid JSON object. No prose, no code fences, no commentary.`;

function buildCommentsPrompt(item: { title: string; author: string; analysis: any; transcriptText: string }): string {
  const unpopular = (item.analysis?.unpopular_opinions ?? []).slice(0, 2).map((u: any) => u.quote);
  return `Given this YouTube video, predict the kinds of comments it will receive.

VIDEO
Title: ${item.title}
Channel: ${item.author}
Hook score: ${item.analysis?.hook_score ?? 'n/a'}/10
Game/Category: ${item.analysis?.viral_angles?.game ?? 'general'}
Controversial takes surfaced: ${JSON.stringify(unpopular)}

Transcript excerpt:
${item.transcriptText.slice(0, 2500)}

Return JSON with EXACTLY this structure:

{
  "praise": [
    {"comment": "<likely viewer praise comment>", "intensity": "<mild|strong|fanboy>", "why_likely": "<one phrase>"}
  ],
  "criticism": [
    {"comment": "<likely criticism>", "tone": "<constructive|harsh|trollish>", "why_likely": "<one phrase>"}
  ],
  "questions": [
    {"comment": "<likely question>", "intent": "<curious|challenging|clarifying>", "why_likely": "<one phrase>"}
  ],
  "debate": [
    {"comment": "<comment designed to spark a reply thread>", "side": "<pro|con>", "why_likely": "<one phrase>"}
  ],
  "spam": [
    {"comment": "<likely spam or self-promo comment>", "pattern": "<emoji-heavy|link-dropping|generic-praise>", "why_likely": "<one phrase>"}
  ],
  "pinned_suggestion": {
    "comment": "<the single comment the creator should pin to seed engagement>",
    "why": "<2-3 sentence rationale: drives replies, signals community, etc.>"
  }
}

Rules:
- praise: 3-5 entries
- criticism: 3-5 entries
- questions: 3-5 entries
- debate: 2-4 entries
- spam: 2-3 entries
- Comments must sound like real viewer phrasing — slang, lowercased, abbreviations OK
- Reference specific moments or claims from the transcript where possible.`;
}

app.post('/analyse/comments', requireAuth, requireCredits(2), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const startedAt = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const url: string = (body.youtubeUrl || body.url || '').trim();

  if (!url) return json({ error: 'youtubeUrl is required' }, 400);
  const videoId = parseYouTubeId(url);
  if (!videoId) return json({ error: 'Could not parse a YouTube video ID from that URL' }, 400);

  // Reuse cached analysis if available (within 24h)
  const cached = await sbFetch<any[]>(
    env,
    `analyses?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&status=eq.completed&select=id,analysis_raw,transcript,video_title,video_author&order=created_at.desc&limit=1`,
  );
  let analysis: any;
  let title: string;
  let author: string;
  let transcriptText: string;

  if (cached && cached.length > 0 && cached[0].analysis_raw) {
    const row = cached[0];
    analysis = typeof row.analysis_raw === 'string' ? JSON.parse(row.analysis_raw) : row.analysis_raw;
    title = row.video_title || 'Untitled';
    author = row.video_author || 'Unknown';
    let transcript: { t: number; text: string }[] = [];
    try { transcript = typeof row.transcript === 'string' ? JSON.parse(row.transcript) : (row.transcript || []); } catch { /* ignore */ }
    transcriptText = transcript.map((s: any) => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
  } else {
    const meta = await fetchYouTubeMeta(videoId, env);
    if (!meta) return json({ error: 'Could not fetch video metadata' }, 422);
    const tr = await getTranscriptOrFallback(videoId, meta, env);
    analysis = await llmJson(env, buildAnalysisPrompt(meta, tr.segments, undefined, tr.source), ANALYSIS_SYSTEM_PROMPT, 8000);
    title = meta.title;
    author = meta.author;
    transcriptText = tr.segments.map(s => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
  }

  let comments: any;
  try {
    comments = await llmJson(env, buildCommentsPrompt({ title, author, analysis, transcriptText }), COMMENTS_SYSTEM_PROMPT, 3000);
  } catch (e: any) {
    return json({ error: 'Comments AI failed: ' + e.message }, 502);
  }

  const newBalance = await spendCredits(env, userId, 2, 'analyse_comments');

  return json({
    comments,
    video: { title, author, video_id: videoId, url },
    cached_analysis: !!(cached && cached.length > 0 && cached[0].analysis_raw),
    processing_ms: Date.now() - startedAt,
    credits_remaining: newBalance,
  });
});

// ─── POST /api/analyse/shadow — Phase 4: Shadow Editor ───────────────────────
// Takes a YouTube URL. Returns a faceless-creator script derived from the
// source video — letting the user re-record the same content without showing
// their face. Uses the cached analysis's shadow_editor_script as a starting
// point, then expands it into a full 3-act voiceover script with:
//   - full_script: ~600-900 word voiceover
//   - b_roll_cues: 6-10 visual descriptions to overlay
//   - tts_settings: voice / pace / pitch recommendations
//   - legal_disclaimer: short note about fair use / transformative content
//
// Charges 4 credits. Available to all logged-in users.
const SHADOW_SYSTEM_PROMPT = `You are ClipAI's Shadow Editor — you transform a YouTube video's transcript into a faceless-creator voiceover script. The creator will re-record the audio themselves (or use TTS) and overlay stock/b-roll footage. You preserve the viral angle while making the script original enough to count as transformative content.

ALWAYS return a single valid JSON object. No prose, no code fences, no commentary.`;

function buildShadowPrompt(item: { title: string; author: string; analysis: any; transcriptText: string }): string {
  const seedScript = item.analysis?.shadow_editor_script ?? {};
  const hidden = (item.analysis?.hidden_gems ?? []).slice(0, 2).map((g: any) => g.angle);
  return `Transform this YouTube video into a faceless-creator voiceover script.

VIDEO
Title: ${item.title}
Channel: ${item.author}
Hook score: ${item.analysis?.hook_score ?? 'n/a'}/10
Game/Category: ${item.analysis?.viral_angles?.game ?? 'general'}
Seed act 1: ${seedScript.act1 ?? ''}
Seed act 2: ${seedScript.act2 ?? ''}
Seed act 3: ${seedScript.act3 ?? ''}
Hidden gem angles: ${JSON.stringify(hidden)}

Transcript excerpt:
${item.transcriptText.slice(0, 3500)}

Return JSON with EXACTLY this structure:

{
  "full_script": {
    "act1_hook": "<2-3 sentence cold open that hooks in the first 3 seconds>",
    "act2_setup": "<3-5 sentence setup that introduces the stakes>",
    "act3_payoff": "<3-5 sentence payoff with a twist or satisfying conclusion>",
    "cta": "<1-2 sentence call to action — subscribe / comment / watch next>"
  },
  "b_roll_cues": [
    {
      "t": "<relative to script: 'act1-open' | 'act2-mid' | 'act3-climax'>",
      "visual": "<specific b-roll description: 'gameplay clip of clutch moment' | 'stock footage of crowd cheering'>",
      "duration_seconds": <number>,
      "text_overlay": "<short on-screen text or null>"
    }
  ],
  "tts_settings": {
    "voice_recommendation": "<narrator|energetic-hype|calm-explainer|comedic>",
    "pace_wpm": <number, typically 140-180>,
    "pitch": "<low|medium|high>",
    "pause_strategy": "<one phrase: e.g. 'pause before act3 twist'>"
  },
  "legal_disclaimer": "<2-3 sentence note on fair use, transformative content, and avoiding direct copy>"
}

Rules:
- full_script total: ~600-900 words (act1 ~150, act2 ~300, act3 ~300, cta ~50)
- b_roll_cues: 6-10 entries
- The script MUST be transformative — same angle, original wording. Never copy transcript verbatim.
- Make the hook genuinely attention-grabbing for shorts/tiktok.`;
}

app.post('/analyse/shadow', requireAuth, requireCredits(4), async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;
  const startedAt = Date.now();
  const body = await c.req.json().catch(() => ({}));
  const url: string = (body.youtubeUrl || body.url || '').trim();

  if (!url) return json({ error: 'youtubeUrl is required' }, 400);
  const videoId = parseYouTubeId(url);
  if (!videoId) return json({ error: 'Could not parse a YouTube video ID from that URL' }, 400);

  // Reuse cached analysis if available (within 24h)
  const cached = await sbFetch<any[]>(
    env,
    `analyses?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&status=eq.completed&select=id,analysis_raw,transcript,video_title,video_author&order=created_at.desc&limit=1`,
  );
  let analysis: any;
  let title: string;
  let author: string;
  let transcriptText: string;

  if (cached && cached.length > 0 && cached[0].analysis_raw) {
    const row = cached[0];
    analysis = typeof row.analysis_raw === 'string' ? JSON.parse(row.analysis_raw) : row.analysis_raw;
    title = row.video_title || 'Untitled';
    author = row.video_author || 'Unknown';
    let transcript: { t: number; text: string }[] = [];
    try { transcript = typeof row.transcript === 'string' ? JSON.parse(row.transcript) : (row.transcript || []); } catch { /* ignore */ }
    transcriptText = transcript.map((s: any) => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
  } else {
    const meta = await fetchYouTubeMeta(videoId, env);
    if (!meta) return json({ error: 'Could not fetch video metadata' }, 422);
    const tr = await getTranscriptOrFallback(videoId, meta, env);
    analysis = await llmJson(env, buildAnalysisPrompt(meta, tr.segments, undefined, tr.source), ANALYSIS_SYSTEM_PROMPT, 8000);
    title = meta.title;
    author = meta.author;
    transcriptText = tr.segments.map(s => `[${Math.floor(s.t / 60)}:${String(Math.floor(s.t % 60)).padStart(2, '0')}] ${s.text}`).join('\n');
  }

  let shadow: any;
  try {
    shadow = await llmJson(env, buildShadowPrompt({ title, author, analysis, transcriptText }), SHADOW_SYSTEM_PROMPT, 4000);
  } catch (e: any) {
    return json({ error: 'Shadow Editor AI failed: ' + e.message }, 502);
  }

  const newBalance = await spendCredits(env, userId, 4, 'analyse_shadow');

  return json({
    shadow,
    video: { title, author, video_id: videoId, url },
    cached_analysis: !!(cached && cached.length > 0 && cached[0].analysis_raw),
    processing_ms: Date.now() - startedAt,
    credits_remaining: newBalance,
  });
});

// ════════════════════════════════════════════════════════════════════════════
// GET /api/daily-insight — synthesises a "daily brief" from the user's recent
// activity across all tools (channel audits, viral forge analyses, trend radar,
// growth intel). Returns 3-5 actionable insights for the day.
//
// Storage (the "easiest way" — no new DB table needed):
//   - KV cache for the insight payload, keyed on `daily_insight:${userId}:${YYYY-MM-DD}`
//     20h TTL (so it survives the day but rolls over by tomorrow)
//   - Frontend localStorage tracks "dismissed today" state (no API call needed)
//
// Aggregation strategy:
//   1. Pull the user's most recent saved channel audits (up to 3)
//   2. Pull the user's most recent viral forge analyses (up to 3)
//   3. Pull trending topics from topic-steal dashboard (top 5)
//   4. Read profile info (plan, credits, streak, xp)
//   5. Build a compact JSON "signals" payload + send to LLM with a system
//      prompt asking for a JSON response with: headline, insights[], focusArea
//   6. Cache + return
//
// Free for the user (no credit charge — this reuses cached audit/analysis data).
// Falls back to a deterministic "starter brief" if LLM is unavailable.
// ════════════════════════════════════════════════════════════════════════════
app.get('/daily-insight', requireAuth, async (c) => {
  const env = c.env as Env;
  const userId = c.get('userId') as string;

  // Date key in user's timezone (WAT = UTC+1, the primary user base).
  // We use the server's UTC date — close enough for "today" purposes.
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const cacheKey = `daily_insight:${userId}:${dateStr}`;

  // 1. Check KV cache first (20h TTL — covers the day, rolls over by tomorrow)
  const cached = await cacheRead<any>(env, cacheKey);
  if (cached?.data?.insights) {
    return json({
      date: dateStr,
      ...cached.data,
      cached: true,
    });
  }

  // 2. Gather signals in parallel — all best-effort, none should block.
  const [profile, recentAudits, recentAnalyses, trendingTopics] = await Promise.all([
    fetchProfile(env, userId).catch(() => null),
    listChannelAudits(env, userId).catch(() => []),
    (async () => {
      try {
        const rows = await sbFetch<any[]>(
          env,
          `analyses?user_id=eq.${userId}&status=eq.completed&order=created_at.desc&limit=3` +
          `&select=id,source_url,video_title,video_author,hook_score,created_at`,
        );
        return rows || [];
      } catch { return []; }
    })(),
    (async () => {
      try {
        const rows = await sbFetch<any[]>(
          env,
          `topic_steal_dashboard?order=mention_count.desc,avg_heat.desc&limit=5`,
        );
        return rows || [];
      } catch { return []; }
    })(),
  ]);

  // 3. For each saved audit, hydrate the cached insights (cheap — reuses 2h cache)
  const auditInsights = await Promise.all(
    (recentAudits || []).slice(0, 3).map(async (entry: any) => {
      try {
        const auditKey = await hashKey('channel_audit_v2', entry.url);
        const auditCached = await cacheRead<any>(env, auditKey);
        const audit = auditCached?.data;
        const insightsKey = await hashKey('channel_insights', 'v3-2026-07-19', entry.url);
        const insightsCached = await cacheRead<any>(env, insightsKey);
        return {
          channelName: entry.channel_name || entry.channelName,
          platform: entry.platform,
          url: entry.url,
          healthScore: insightsCached?.data?.insights?.healthScore,
          healthLabel: insightsCached?.data?.insights?.healthLabel,
          executiveSummary: insightsCached?.data?.insights?.executiveSummary,
          topRecommendation: insightsCached?.data?.insights?.recommendations?.[0]?.title,
          subscribers: audit?.statistics?.subscribers,
          avgEngagement: audit?.metrics?.avgEngagementRate,
        };
      } catch { return null; }
    }),
  );
  const validAuditInsights = auditInsights.filter(Boolean);

  // 4. Build the signals payload for the LLM
  const signals = {
    date: dateStr,
    user: {
      name: profile?.full_name || 'Creator',
      plan: profile?.plan || 'free',
      credits: profile?.credits ?? 0,
      streakDays: profile?.streak_days ?? 0,
      xp: profile?.xp ?? 0,
    },
    recentAudits: validAuditInsights,
    recentAnalyses: (recentAnalyses || []).map((a: any) => ({
      title: a.video_title,
      author: a.video_author,
      hookScore: a.hook_score,
      analyzedAt: a.created_at,
    })),
    trendingTopics: (trendingTopics || []).map((t: any) => ({
      topic: t.topic || t.title,
      game: t.game,
      mentions: t.mention_count,
      heat: t.avg_heat,
    })),
  };

  // 5. Generate the daily brief via LLM
  const systemPrompt = `You are ClipAI's daily insight engine. Given a user's recent activity signals, produce a concise, actionable "daily brief" that helps them grow as a content creator.

Return ONLY valid JSON (no markdown, no prose) in this exact shape:
{
  "headline": "string — 4-8 word punchy hook for today, e.g. 'Double down on your winning hook'",
  "focusArea": "string — one of: 'Content Strategy', 'Posting Cadence', 'Audience Growth', 'Engagement', 'Monetization', 'Trend Capitalization'",
  "insights": [
    {
      "title": "string — 3-6 word actionable title",
      "body": "string — 1-2 sentence specific recommendation referencing the user's actual data",
      "priority": "high" | "medium" | "low",
      "action": "string — a concrete next step, e.g. 'Audit 2 more channels in your niche' or 'Post a Short at 7pm WAT today'"
    }
  ]
}

Rules:
- Generate 3-5 insights, ordered by priority (high first).
- Be SPECIFIC — reference the user's actual channels, recent analyses, trending topics, or stats. Generic advice like "post consistently" is forbidden.
- If the user has no recent audits/analyses, focus on onboarding actions: audit their first channel, run their first analysis, check today's trends.
- If the user has credits < 5, suggest referring friends or upgrading.
- Match the user's plan: free users get trend + audit suggestions; paid users get growth intel + competitor spy suggestions.
- Keep the tone encouraging but direct — like a coach who knows their numbers.
- If trending topics include a game the user has analyzed before, call it out explicitly.`;

  const userPrompt = `Here are today's signals for this user:

${JSON.stringify(signals, null, 2)}

Generate today's daily brief.`;

  try {
    const brief = await llmJson<any>(env, userPrompt, systemPrompt, 1500);

    // Validate / normalise the response shape
    if (!brief || !brief.insights || !Array.isArray(brief.insights)) {
      throw new Error('LLM returned invalid brief shape');
    }
    // Clamp to 5 insights, ensure each has the required fields
    const cleanInsights = brief.insights.slice(0, 5).map((i: any) => ({
      title: String(i.title || 'Untitled insight').slice(0, 120),
      body: String(i.body || '').slice(0, 600),
      priority: ['high', 'medium', 'low'].includes(i.priority) ? i.priority : 'medium',
      action: String(i.action || '').slice(0, 300),
    }));

    const payload = {
      headline: String(brief.headline || 'Today\'s brief').slice(0, 120),
      focusArea: String(brief.focusArea || 'Content Strategy').slice(0, 60),
      insights: cleanInsights,
      generatedAt: new Date().toISOString(),
    };

    // Cache for 20h (rolls over by tomorrow even if user is up late)
    await cacheWrite(env, cacheKey, payload, 20 * 60 * 60);

    return json({
      date: dateStr,
      ...payload,
      cached: false,
    });
  } catch (e: any) {
    console.error('[daily-insight] LLM failed:', e?.message);

    // Fallback: deterministic "starter brief" based on available signals
    const fallback = buildFallbackBrief(signals);
    // Cache the fallback for 1h so we don't keep retrying the LLM on every refresh
    await cacheWrite(env, cacheKey, fallback, 60 * 60);

    return json({
      date: dateStr,
      ...fallback,
      cached: false,
      fallback: true,
    });
  }
});

// ─── Fallback brief generator (used if LLM is unavailable) ───────────────────
function buildFallbackBrief(signals: any): any {
  const insights: any[] = [];
  const hasAudits = signals.recentAudits?.length > 0;
  const hasAnalyses = signals.recentAnalyses?.length > 0;
  const hasTrends = signals.trendingTopics?.length > 0;
  const creditsLow = (signals.user?.credits ?? 0) < 5;

  if (!hasAudits) {
    insights.push({
      title: 'Audit your first channel',
      body: 'Run a free channel audit to see your subscriber count, engagement rate, and AI-generated growth recommendations.',
      priority: 'high',
      action: 'Go to Channel Audit and paste your YouTube or TikTok URL',
    });
  } else {
    const topAudit = signals.recentAudits[0];
    insights.push({
      title: `Check on ${topAudit.channelName}`,
      body: topAudit.executiveSummary
        ? `Last audit: ${topAudit.executiveSummary.slice(0, 180)}...`
        : `Review your audit for ${topAudit.channelName} — health score: ${topAudit.healthScore ?? 'N/A'}.`,
      priority: 'high',
      action: 'Open the audit report and review today\'s recommendations',
    });
  }

  if (!hasAnalyses) {
    insights.push({
      title: 'Analyse a viral video',
      body: 'Paste a YouTube URL into Viral Forge to get 14 AI-powered outputs: hooks, titles, captions, hashtags, and more.',
      priority: 'medium',
      action: 'Find a recent viral video in your niche and analyse it',
    });
  } else {
    const topAnalysis = signals.recentAnalyses[0];
    insights.push({
      title: 'Reuse your best hook',
      body: `Your last analysis of "${topAnalysis.title}" had a hook score of ${topAnalysis.hookScore ?? '?'}/100. Adapt that hook structure for your next clip.`,
      priority: 'medium',
      action: 'Open Viral Forge → recent analyses → reuse the top hook',
    });
  }

  if (hasTrends) {
    const topTrend = signals.trendingTopics[0];
    insights.push({
      title: `Jump on "${topTrend.topic}"`,
      body: `${topTrend.topic} is trending in ${topTrend.game || 'gaming'} with ${topTrend.mentions} mentions. Capitalise before it peaks.`,
      priority: 'medium',
      action: `Create a clip around "${topTrend.topic}" today`,
    });
  }

  if (creditsLow) {
    insights.push({
      title: 'Top up your credits',
      body: `You have ${signals.user?.credits ?? 0} credits left. Refer a friend to earn 5 bonus credits, or upgrade for monthly credits that roll over.`,
      priority: 'low',
      action: 'Open Settings → Referrals to share your code',
    });
  }

  if (insights.length < 3) {
    insights.push({
      title: 'Build a posting streak',
      body: `You're on a ${signals.user?.streakDays ?? 0}-day streak. Keep it going by posting or analysing content today.`,
      priority: 'low',
      action: 'Post at least one clip or run one analysis today',
    });
  }

  return {
    headline: hasAudits ? 'Review your channel health' : 'Kick off your first audit',
    focusArea: hasAudits ? 'Content Strategy' : 'Audience Growth',
    insights: insights.slice(0, 5),
    generatedAt: new Date().toISOString(),
  };
}

// ─── 404 fallback ────────────────────────────────────────────────────────────
app.all('*', (c) => json({ error: 'Not found', path: c.req.path }, 404));

// ─── Global error handler ────────────────────────────────────────────────────
// Catches any unhandled exception thrown by route handlers. Logs to console
// (visible in Cloudflare dashboard) + returns a clean 500 to the client.
app.onError((err, c) => {
  console.error('[unhandled]', err?.message, err?.stack);
  return json({
    error: 'Internal server error',
    message: err?.message || 'Unknown error',
    request_id: c.req.header('cf-ray') || null,
  }, 500);
});

// ─── Export for Cloudflare Pages _middleware ─────────────────────────────────
// Cloudflare Pages passes a single context object; Hono expects (request, env, ctx).
// Adapt the signature so Hono handles routing correctly.
type PagesContext = { request: Request; env: any; ctx: any; next: () => Promise<Response> };

const handleRequest = (ctx: PagesContext) => app.fetch(ctx.request, ctx.env, ctx.ctx);

export const onRequest = handleRequest;
export const onRequestGet = handleRequest;
export const onRequestPost = handleRequest;
export const onRequestPatch = handleRequest;
export const onRequestDelete = handleRequest;
export const onRequestOptions = handleRequest;
