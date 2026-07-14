# ClipAI v2 — Production Readiness Checklist

Everything you need to do in the Cloudflare / Supabase / Paystack dashboards
to take ClipAI from "deployed" to "production". The code is ready — these are
the operational steps only.

---

## 1. Cloudflare KV namespaces (REQUIRED for caching + rate limiting)

The new cache + rate-limit layers need two KV namespaces. Without them the app
still works (fails open) but you lose the reliability gains.

1. Go to **Cloudflare dashboard → Workers & Pages → KV**
2. Create namespace **`CACHE`** (used for trend/forge/intel cache, 30min–7d TTLs)
3. Create namespace **`RATELIMIT`** (used for per-IP + per-user rate limits)
4. Go to **Workers & Pages → clipai-v2 → Settings → Functions → KV namespace bindings**
5. Add binding:
   - Variable name: `CACHE_KV` → KV namespace: `CACHE`
   - Variable name: `RATELIMIT_KV` → KV namespace: `RATELIMIT`
6. Save + redeploy

Verify after deploy:
```bash
curl https://clipai-bqo.pages.dev/api/health | jq .checks.kv
curl https://clipai-bqo.pages.dev/api/health | jq .checks.ratelimit_kv
# Both should be {"status":"ok"}
```

---

## 2. Supabase — run the new schema migration

The `error_log` table needs to be created. Run this in Supabase SQL editor:

```sql
-- Already at the bottom of supabase-schema.sql — re-run just this block:
create table if not exists public.error_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  level       text not null default 'error' check (level in ('error','warn','info')),
  message     text not null,
  stack       text,
  url         text,
  user_agent  text,
  user_id     uuid references auth.users(id) on delete set null,
  ip          text,
  extras      jsonb
);
create index if not exists error_log_created_at_idx on public.error_log (created_at desc);
create index if not exists error_log_user_idx       on public.error_log (user_id, created_at desc);
create index if not exists error_log_level_idx      on public.error_log (level, created_at desc);
alter table public.error_log enable row level security;
drop policy if exists "error_log_deny_all" on public.error_log;
create policy error_log_deny_all on public.error_log
  for all using (false) with check (false);
```

Also update Supabase Auth config:
- **Authentication → URL Configuration → Site URL**: `https://clipai-bqo.pages.dev` (or your custom domain once set)
- **Authentication → URL Configuration → Redirect URLs**: add `https://clipai-bqo.pages.dev/**` and your custom domain

---

## 3. Set up daily credit refill cron

Free-tier users get 50 credits on signup, and we want to refill daily so they
keep coming back. Use any external cron service (cron-job.org is free).

1. Sign up at **https://cron-job.org** (or use UptimeRobot's cron monitor)
2. Create a new cron job:
   - **URL**: `https://clipai-bqo.pages.dev/api/cron/refill?secret=YOUR_WORKER_SECRET`
     (replace `YOUR_WORKER_SECRET` with the `WORKER_SECRET` value from Cloudflare env vars)
   - **Method**: GET
   - **Schedule**: Every day at 00:05 WAT (which is 23:05 UTC the previous day)
   - **Timeout**: 60s
3. Save

Verify manually:
```bash
curl "https://clipai-bqo.pages.dev/api/cron/refill?secret=YOUR_WORKER_SECRET"
# → {"refilled":N,"total_checked":N} or {"refilled":0,"message":"no users need refill"}
```

---

## 4. Paystack webhook URL

1. Go to **Paystack Dashboard → Settings → API Keys & Webhooks**
2. Update webhook URL to: `https://clipai-bqo.pages.dev/api/payment/webhook`
   (or your custom domain once set)
3. Verify the webhook secret matches `PAYSTACK_SECRET_KEY` in Cloudflare env

---

## 5. Rotate shared secrets (CRITICAL — all keys were shared in plaintext)

These keys were posted in chat during development. Rotate ALL of them:

1. **Supabase service role key**:
   - Go to Supabase Dashboard → Project Settings → API
   - Click "Reset service_role key"
   - Update `SUPABASE_SERVICE_KEY` in Cloudflare env vars
2. **Supabase JWT secret**:
   - Go to Supabase Dashboard → Project Settings → API → JWT Settings
   - Click "Generate new JWT secret"
   - Update `SUPABASE_JWT_SECRET` in Cloudflare env vars
   - ⚠️ This will sign out all current users (their tokens become invalid)
3. **Paystack secret key**:
   - Go to Paystack Dashboard → Settings → API Keys & Webhooks
   - Click "Roll back" / "Generate new key"
   - Update `PAYSTACK_SECRET_KEY` in Cloudflare env vars
4. **Serper API key**: regenerate at https://serper.dev/api-key
5. **SiliconFlow API key**: regenerate at https://cloud.siliconflow.cn/account/ak
6. **Groq API key**: regenerate at https://console.groq.com/keys
7. **Mistral API key**: regenerate at https://console.mistral.ai/api-keys
8. **Google OAuth client secret**:
   - Go to Google Cloud Console → APIs & Services → Credentials
   - Click your OAuth client → "Reset secret"
   - Update Supabase Auth Google provider config with the new secret
9. **Worker secret**:
   - Generate a new random 32-byte hex string: `openssl rand -hex 32`
   - Update `WORKER_SECRET` in Cloudflare env vars
   - Update the cron job URL with the new secret

---

## 6. Google OAuth branding

1. Go to **Google Cloud Console → APIs & Services → OAuth consent screen**
2. Upload the new logo (`/public/apple-touch-icon.png` from the project)
3. Set:
   - App name: `ClipAI`
   - User support email: your support email
   - App domain: `https://clipai-bqo.pages.dev` (or custom domain)
   - Authorized domains: add your domain
   - Developer contact: your email
4. If you want to remove the "unverified app" warning for >100 users, submit for verification

---

## 7. Uptime monitoring

1. Sign up at **https://uptimerobot.com** (free)
2. Add a monitor:
   - Type: HTTP(s)
   - URL: `https://clipai-bqo.pages.dev/api/health`
   - Interval: 5 minutes
   - Alert when: status code != 200 OR keyword "ok" not present
3. Add alert contacts (email, Slack, Discord, etc.)

The `/api/health` endpoint returns 503 if any upstream dependency is down,
so UptimeRobot will alert you before users notice.

---

## 8. Custom domain (recommended)

Once you have a domain (e.g. `clipai.app` or `clipai.com.ng`):

1. Go to **Cloudflare Dashboard → Workers & Pages → clipai-v2 → Custom domains**
2. Add your domain (must be on Cloudflare DNS)
3. Wait for SSL cert to provision (~5 min)
4. Update Supabase Auth URLs (Site URL + Redirect URLs) to the new domain
5. Update Paystack webhook URL to the new domain
6. Update Google OAuth consent screen domain
7. Update the cron job URL to the new domain
8. Redeploy

After this, you can also tighten the CSP header in `functions/api/_middleware.ts`
(replace `*` in the `Access-Control-Allow-Origin` with the specific origin).

---

## 9. Verify everything works end-to-end

```bash
# Health check
curl https://clipai-bqo.pages.dev/api/health | jq

# Cache hit (call trends twice — 2nd should be near-instant)
time curl "https://clipai-bqo.pages.dev/api/trends?game=valorant" > /dev/null
time curl "https://clipai-bqo.pages.dev/api/trends?game=valorant" > /dev/null

# Rate limit (fire 65 rapid requests — should get 429 after 60)
for i in {1..65}; do curl -s -o /dev/null -w "%{http_code} " https://clipai-bqo.pages.dev/api/health; done

# Cron (with your real WORKER_SECRET)
curl "https://clipai-bqo.pages.dev/api/cron/refill?secret=YOUR_WORKER_SECRET"

# Error log (frontend will post here automatically on crashes)
curl -X POST https://clipai-bqo.pages.dev/api/log \
  -H "Content-Type: application/json" \
  -d '{"level":"info","message":"manual test"}'
```

---

## 10. Frontend sanity checks

- [ ] Hard-refresh (Ctrl+Shift+R) — new logo appears in navbar
- [ ] Favicon shows the new mark in the browser tab
- [ ] Open Trend Radar — see the particle loader animation
- [ ] Open Viral Forge — Generate titles — see the staged loading
- [ ] ClipBot — typing dots animate
- [ ] All pages still render without errors
- [ ] Credit chip still decrements after each tool call
- [ ] UpgradeModal still pops when credits hit 0

---

## What's NOT included (future work)

- **Sentry**: We built a custom /api/log endpoint which is enough for now. If you want full Sentry (source maps, release tracking, session replay), sign up at sentry.io and add the SDK.
- **PostHog/Plausible analytics**: Add later when you need funnel tracking
- **Email verification enforcement**: Currently email verification is optional. To enforce in prod, set in Supabase Auth → "Confirm email" = required
- **DB point-in-time recovery**: Upgrade Supabase to a paid plan for PITR backups
- **Custom CSP**: After custom domain, tighten the loose `Access-Control-Allow-Origin: *` to your specific origin

---

**Status after this checklist**: Production-ready. Ship it.
