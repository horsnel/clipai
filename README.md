# ClipAI ⚡ — Insight-as-a-Service for Creators

> Paste a URL. Get 14 viral strategies. Built in Lagos by OLHMES · [@Olhmescraxes1](https://x.com/Olhmescraxes1)

Live at **[clipai-bqo.pages.dev](https://clipai-bqo.pages.dev)**

---

## What it is

ClipAI is an **Insight-as-a-Service** platform for short-form gaming creators. Paste any YouTube video URL and the platform returns 14 viral strategies — titles, hooks, captions, hashtags, thumbnail concepts, distribution packs, and more — in one AI pass. Beyond one-shot generation, the platform continuously monitors trends across YouTube, Reddit, Twitch and news, audits channels for shadow-bans and growth leaks, and runs an in-app ClipBot for daily coaching.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Tailwind 3 · shadcn/ui · Recharts |
| Edge API | Cloudflare Pages Functions · Hono router · KV cache |
| Auth / DB | Supabase (Postgres + Auth + Row Level Security) |
| AI | z-ai-web-dev-sdk (LLM / VLM / web search / web reader) |
| Payments | Paystack (NGN) |
| Hosting | Cloudflare Pages (frontend + functions on the same domain) |

---

## Core features (Phase 1 — live)

| Feature | Description |
|---|---|
| **Viral Forge** | One YouTube URL → 14 outputs (titles, hooks, captions, hashtags, thumbnail concepts, distribution pack, posting time, music suggestion, retention curve, edit cues, etc.) |
| **TrendRadar** | Real-time trending videos, topics, and hashtags across YouTube + Reddit + news sources |
| **Channel Audit** | Detects shadow-bans, growth leaks, posting-time mismatches, thumbnail CTR issues |
| **Growth Intel** | A/B title testing, competitor spy, best posting time per platform |
| **ClipBot** | In-app conversational AI coach — daily insight, clip ideas, script rewrites |
| **Creator Rank** | Leaderboard ranking creators by composite virality score |
| **Daily Insight** | Auto-generated creator brief delivered on dashboard |
| **Topic Steal** | Reverse-engineers a trending topic into a content pack for the user's niche |

---

## Repo structure

```
clipai/
├── app/                              ← Vite + React frontend
│   ├── src/
│   │   ├── pages/                    ← 18 page components (landing → dashboard → tools)
│   │   ├── components/               ← Navbar, Footer, shadcn/ui, ClipBot, modals, charts
│   │   ├── lib/                      ← api client, auditExport, utils, supabase client
│   │   ├── types/                    ← shared TypeScript types
│   │   ├── App.tsx                   ← root, page routing, auth guard
│   │   ├── index.css                 ← brand tokens, glow utilities, shadcn HSL vars
│   │   └── tailwind.config.js        ← clip-* color palette, boxShadow, keyframes
│   ├── functions/
│   │   └── api/
│   │       └── _middleware.ts        ← Hono router, all 45 API routes, KV caching, auth
│   ├── public/                       ← static assets, OG image, favicons, dashboard renders
│   ├── package.json
│   └── vite.config.ts
├── supabase-migration-*.sql          ← DB schema (RCLS policies, audit tables, phase migrations)
└── README.md                         ← this file
```

---

## Setup

### 1. Clone

```bash
git clone https://github.com/horsnel/clipai.git
cd clipai/app
```

### 2. Frontend

```bash
npm install
cp .env.example .env.local
# Edit .env.local:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...
#   VITE_ZAI_API_KEY=...        (z-ai-web-dev-sdk key for AI features)
npm run dev
```

### 3. Database (Supabase)

Run the SQL migrations in order against your Supabase project:

```bash
psql "$SUPABASE_DB_URL" -f supabase-schema.sql
psql "$SUPABASE_DB_URL" -f supabase-migration-phase1.sql
psql "$SUPABASE_DB_URL" -f supabase-migration-phase4-topic-steal.sql
psql "$SUPABASE_DB_URL" -f supabase-migration-phase5-channel-audits.sql
```

### 4. Edge functions (Cloudflare Pages)

The Hono app in `functions/api/_middleware.ts` runs on Cloudflare Pages. Local dev:

```bash
npx wrangler pages dev dist --kv CACHE --compatibility-date=2025-01-01
```

Required env vars (set in Cloudflare dashboard):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (for auth verification)
- `ZAI_API_KEY` (z-ai-web-dev-sdk)
- `PAYSTACK_SECRET_KEY`
- `CACHE` (KV namespace binding)

---

## Deploy (Cloudflare Pages)

```bash
cd app
npm run build
npx wrangler pages deploy dist --project-name=clipai
```

Cloudflare auto-detects the `functions/` directory and deploys the Hono router alongside the static frontend.

---

## API routes (45 total — Hono on Cloudflare Pages)

### Auth & users
| Method | Route | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/auth/me` | Current user profile |
| POST | `/settings/onboarding` | Save onboarding preferences |

### Viral Forge
| Method | Route | Description |
|---|---|---|
| POST | `/forge/titles` | AI title generation (2 credits) |
| POST | `/forge/hooks` | AI hook generation (2 credits) |
| POST | `/forge/captions` | AI caption generation (2 credits) |
| POST | `/forge/hashtags` | AI hashtag pack (2 credits) |
| GET | `/forge/top-captions` | Community top-voted captions |
| POST | `/forge/vote` | Vote on a caption |

### TrendRadar
| Method | Route | Description |
|---|---|---|
| GET | `/trends` | Trending videos + topics (KV cached) |
| GET | `/trends/assets` | Cached asset proxy |
| GET | `/trending-videos` | YouTube trending feed |
| GET | `/gaming-feed` | Gaming-specific feed |
| GET | `/trends/_diag` | Cache diagnostics |

### Channel Audit
| Method | Route | Description |
|---|---|---|
| POST | `/audit-channel` | Run full channel audit |
| GET | `/audit-credits` | Remaining audit credits |
| GET | `/audit-insights` | Audit-derived growth insights |
| GET | `/channel-audits` | Audit history |
| POST | `/analyse/youtube` | Deep YouTube analysis |
| POST | `/analyse/audio-trend` | Audio trend analysis |
| POST | `/analyse/comments` | Comment sentiment mining |
| POST | `/analyse/compare` | Cross-channel comparison |
| POST | `/analyse/shadow` | Shadow-ban detection |

### Growth Intel
| Method | Route | Description |
|---|---|---|
| POST | `/intel/abtitle` | A/B title testing |
| POST | `/intel/spy` | Competitor spy |
| POST | `/intel/timing` | Best posting time per platform |
| POST | `/playlist/sequence` | Optimal video sequence |
| POST | `/topic-steal` | Reverse-engineer a trending topic |

### ClipBot
| Method | Route | Description |
|---|---|---|
| POST | `/clipbot` | Send a ClipBot message (1 credit) |
| GET | `/clipbot/history` | Conversation history |

### Misc
| Method | Route | Description |
|---|---|---|
| GET | `/leaderboard` | Creator rank leaderboard |
| GET | `/rank/me` | Current user rank |
| GET | `/clips` | User's saved clips |
| GET | `/analyses` | Past analyses |
| GET | `/analyses/:id` | Single analysis |
| GET | `/daily-insight` | Today's auto-generated insight |
| GET | `/referrals/stats` | Referral stats |
| POST | `/referrals/apply` | Apply referral code |
| POST | `/waitlist/join` | Join the waitlist |
| POST | `/payment/init` | Initiate Paystack payment |
| POST | `/payment/webhook` | Paystack webhook (signature verified) |
| GET | `/payment/verify` | Verify Paystack transaction |
| POST | `/log` | Client-side log ingestion |
| GET | `/cron/refill` | Daily credit refill (cron-triggered) |

---

## Brand palette

Defined in `app/src/tailwind.config.js` and `app/src/index.css`:

| Token | Hex | Usage |
|---|---|---|
| `clip-cyan` | `#00FFFF` | Primary CTAs, focus rings, primary brand color |
| `clip-violet` | `#C266F5` | Gradient end-stop, secondary highlights |
| `clip-blue` | `#62B8F0` | Tertiary cool accent |
| `clip-teal` | `#5CEDE9` | Duo-tone gradients |
| `clip-purple` | `#8262D6` | Alt gradient stop |
| `clip-amber` | `#FF9500` | PRO badges, alerts |
| `clip-amber-rich` | `#FFB347` | Sunset accent |
| `clip-red` | `#FF6B6B` | Danger, logout |
| `clip-live` | `#39FF14` | LIVE indicators only |

Brand gradient: `clip-cyan → clip-blue → clip-violet`
Primary button glow: 3-layer outer halo (`0 0 15/50/100px`) + inset white-hot core.

---

## Credit economy

Every AI action costs credits. Credits refill daily via the `/cron/refill` route (triggered by Cloudflare Cron Triggers). Free tier: 50 credits on signup.

---

## Plans (NGN)

| Plan | Price/mo | Credits | Max Quality |
|---|---|---|---|
| Free | ₦0 | 50 on signup, daily refill | Standard |
| Starter | ₦2,500 | 250 | Standard |
| Pro | ₦6,000 | 750 | Priority |
| Creator | ₦12,000 | 2,000 | Priority + audit credits |

---

## License

Proprietary · © 2026 ClipAI by OLHMES · Lagos, Nigeria
