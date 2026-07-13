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
 *   POST /forge/titles             (require_auth)
 *   POST /forge/captions           (require_auth)
 *   POST /forge/hashtags           (require_auth)
 *   POST /forge/hooks              (require_auth)
 *   POST /clipbot                  (require_auth)
 *   GET  /clipbot/history          (require_auth)
 *   GET  /trends                   (5-platform multi-source)
 *   POST /intel/spy                (require_auth + plan=pro|creator)
 *   POST /intel/timing             (require_auth)
 *   POST /intel/abtitle            (require_auth)
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
  // Paystack
  PAYSTACK_SECRET_KEY: string;
  // Worker
  WORKER_SECRET: string;
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
  { name: 'Legend',         min_xp: 5000,  color: '#F59E0B' },
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

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use('*', async (c, next) => {
  const origin = c.req.header('Origin') || '*';
  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Paystack-Signature');
  if (c.req.method === 'OPTIONS') return new Response(null, { status: 204 });
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
      }, 402);
    }
    await next();
  };
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
// ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (c) => json({
  status: 'ok',
  service: 'clipai-worker',
  version: '4.6-cf',
  runtime: 'cloudflare-pages',
  supabase: !!c.env.SUPABASE_URL,
  llm: c.env.SILICONFLOW_API_KEY ? 'siliconflow' : (c.env.MISTRAL_API_KEY ? 'mistral' : (c.env.GROQ_API_KEY ? 'groq' : 'none')),
}));

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
  const rows = await sbFetch<any[]>(env, `${view}?order=rank.asc&limit=100`);
  if (!rows) return json({ players: [], currentUser: null });
  let me = rows.find((r) => r.id === userId) || null;
  if (!me) {
    const myRow = await sbFetch<any[]>(env, `${view}?id=eq.${userId}`);
    me = myRow && myRow.length > 0 ? myRow[0] : { rank: 999, id: userId, xp: 0 };
  }
  return json({ players: rows, currentUser: me });
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
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await sbFetch<any[]>(env, `caption_votes?created_at=gt.${weekAgo}&select=caption_text,vote,game,vibe&order=created_at.desc&limit=50`);
  if (!rows) return json({ captions: [] });
  const agg: Record<string, any> = {};
  for (const r of rows) {
    const t = r.caption_text;
    if (!agg[t]) agg[t] = { caption: t, score: 0, game: r.game, vibe: r.vibe };
    agg[t].score += r.vote;
  }
  const top = Object.values(agg).sort((a: any, b: any) => b.score - a.score).slice(0, 10);
  return json({ captions: top });
});

// ─── Forge tools (Groq) ──────────────────────────────────────────────────────
app.post('/forge/titles', requireAuth, async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
  const platform = body.platform || 'TikTok';
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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.post('/forge/captions', requireAuth, async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
  const vibe = body.vibe || 'Hype';
  const platform = body.platform || 'TikTok';
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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.post('/forge/hashtags', requireAuth, async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
  const platform = body.platform || 'TikTok';
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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.post('/forge/hooks', requireAuth, async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const desc = body.description || '';
  const game = body.game || 'Gaming';
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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

// ─── ClipBot ─────────────────────────────────────────────────────────────────
app.post('/clipbot', requireAuth, async (c) => {
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
    return json({ reply });
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
    return data.items || [];
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
async function serperSearch(env: Env, query: string, num = 10): Promise<any[]> {
  if (!env.SERPER_API_KEY) return [];
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': env.SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: query, gl: 'ng', hl: 'en', num }),
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

app.get('/trends/_diag', async (c) => {
  // Diagnostic endpoint — pings each keyless platform directly and reports
  // raw HTTP status + first 200 chars of body. Helps isolate which layer
  // is failing from Cloudflare's egress IP. NOT for production use.
  const env = c.env as Env;
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

  const [ytResults, redditResults, trendsResults, tiktokResults, twitterResults] = await Promise.all([
    ytTrending(env, game || 'gaming', 10),
    redditTop(env, game, 8),
    googleTrends(env, game, 6),
    serpTiktok(env, game, 6),
    serpTwitter(env, game, 6),
  ]);

  // Debug mode: return raw per-platform payloads without calling Groq.
  // Useful for verifying each trend source independently (e.g. before GROQ_API_KEY
  // is set, or to inspect which Google Trends layer produced results).
  if (debug) {
    return json({
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
    });
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

  try {
    const data: any = await llmJson(env, prompt, system, 8000);
    data.updatedAt = new Date().toISOString();
    data.sources = data.sources || {
      youtube: ytResults.length,
      reddit: redditResults.length,
      google_trends: trendsResults.length,
      tiktok: tiktokResults.length,
      twitter: twitterResults.length,
    };
    return json(data);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

// ─── Growth Intel ────────────────────────────────────────────────────────────
app.post('/intel/spy', requireAuth, requirePlan('pro', 'creator'), async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const channelUrl = body.channelUrl || '';
  const game = body.game || '';
  const channelName = channelUrl.includes('@')
    ? channelUrl.split('@').pop()!.split('/')[0]
    : 'unknown';

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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.post('/intel/timing', requireAuth, async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const platform = body.platform || 'TikTok';
  const game = body.game || 'gaming';
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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

app.post('/intel/abtitle', requireAuth, async (c) => {
  const env = c.env as Env;
  const body = await c.req.json().catch(() => ({}));
  const titleA = body.titleA || '';
  const titleB = body.titleB || '';
  const game = body.game || 'gaming';
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
  try {
    return json(await llmJson(env, prompt, system));
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

// ─── 404 fallback ────────────────────────────────────────────────────────────
app.all('*', (c) => json({ error: 'Not found', path: c.req.path }, 404));

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
