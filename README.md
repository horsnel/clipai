# ClipAI ⚡ — AI Gaming Highlight Platform

> Turn your gameplay into viral clips. Built in Lagos by OLHMES · [@Olhmescraxes1](https://x.com/Olhmescraxes1)

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind · shadcn/ui |
| Hosting | Cloudflare Pages |
| Worker | Python · Flask · Gunicorn → Railway |
| Primary renderer | **JSON2Video API** |
| Fallback renderer | **FFmpeg** (auto-fallback if JSON2Video fails) |
| AI — Video scan | **Gemini 2.5 Flash** |
| AI — Captions | **Groq Llama 3.3 70B** |
| Storage | Cloudflare R2 (primary) · Backblaze B2 (fallback) |
| Auth / DB | Supabase |
| Payments | Paystack (NGN) |

---

## Repo structure

```
clipai/
├── app/                        ← Vite React frontend
│   ├── src/
│   │   ├── pages/              ← All 10 page components
│   │   ├── components/         ← Navbar, Footer, shadcn/ui
│   │   ├── services/api.ts     ← All Railway worker calls
│   │   └── types/index.ts      ← Shared TypeScript types
│   ├── public/                 ← Static assets + _redirects
│   ├── package.json
│   └── vite.config.ts
├── main.py                     ← Railway worker (Flask)
├── requirements.txt
├── Procfile
├── .env.template
└── .gitignore
```

---

## Setup

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/clipai.git
cd clipai
```

### 2. Frontend

```bash
cd app
npm install
cp .env.example .env.local
# Edit .env.local: set VITE_API_URL=http://localhost:8000
npm run dev
```

### 3. Worker

```bash
cp .env.template .env
# Fill in all API keys
pip install -r requirements.txt
python main.py
```

---

## Deploy

### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "feat: initial ClipAI build"
git remote add origin https://github.com/YOUR_USERNAME/clipai.git
git push -u origin main
```

### Step 2 — Railway (worker)

1. railway.app → New Project → Deploy from GitHub
2. Select this repo
3. Add all env vars from `.env.template`
4. Railway auto-detects `Procfile` — FFmpeg is pre-installed ✅
5. Copy the Railway URL (e.g. `https://clipai-worker.up.railway.app`)

### Step 3 — Cloudflare Pages (frontend)

1. Cloudflare Dashboard → Pages → Create Project → Connect to Git
2. Select this repo
3. Build settings:
   - **Build command:** `cd app && npm install && npm run build`
   - **Build output directory:** `app/dist`
4. Environment variables:
   - `VITE_API_URL` = your Railway URL from Step 2

---

## Processing pipeline

```
User uploads video / pastes YouTube URL
            ↓
    [Gemini 2.5 Flash]
    Scans video → hype moments + scores
            ↓
    [Groq Llama 3.3 70B]
    Generates viral captions per clip
            ↓
    User selects clip · format · quality
            ↓
    [JSON2Video API]  ← primary renderer
         ↓ fails?
    [FFmpeg on Railway]  ← auto fallback
            ↓
    [Cloudflare R2 / Backblaze B2]
    Stores final rendered clip
            ↓
    Download URL → user
```

---

## Credit costs

| Action | Credits |
|---|---|
| Gemini video scan | 10 |
| Groq captions | 5 |
| 480p render | 10 |
| 720p render | 20 |
| 1080p render | 50 |
| 4K render | 100 |

## Plans (NGN)

| Plan | Price/mo | Credits | Max Quality |
|---|---|---|---|
| Free | ₦0 | 50 on signup | 480p |
| Starter | ₦2,500 | 250 | 720p |
| Pro | ₦6,000 | 750 | 1080p |
| Creator | ₦12,000 | 2,000 | 4K |

---

## API routes (Railway worker)

| Method | Route | Description |
|---|---|---|
| GET | `/health` | Health check |
| POST | `/upload` | Upload video → R2/B2 |
| POST | `/analyse` | Gemini scan uploaded video |
| POST | `/analyse/youtube` | yt-dlp + Gemini for YouTube URLs |
| POST | `/captions` | Groq caption generation |
| POST | `/render` | Start JSON2Video/FFmpeg render job |
| GET | `/render/status/:jobId` | Poll render job status |
| POST | `/payment/webhook` | Paystack webhook (signature verified) |
| GET | `/payment/verify` | Verify Paystack transaction |

---

**© 2026 ClipAI by OLHMES · Lagos, Nigeria**
