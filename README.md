# ClipAI - AI Gaming Highlight Platform

**Turn your gameplay into viral clips with AI.**

Built in Lagos, Nigeria by OLHMES.

---

## 📦 Package Contents

| File | Description |
|------|-------------|
| `clipai-schema.sql` | Complete Supabase PostgreSQL schema |
| `main.py` | Railway Python worker (FFmpeg processing) |
| `requirements.txt` | Python dependencies |
| `.env.template` | Environment variables template |
| `marketing-*.png` | Marketing images for social media |

---

## 🚀 Quick Start

### 1. Database Setup (Supabase)

```bash
# Run the SQL schema in Supabase SQL Editor
psql -h your-project.supabase.co -U postgres -d postgres -f clipai-schema.sql
```

### 2. Deploy Worker (Railway)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and create project
railway login
railway init

# Deploy
railway up
```

### 3. Environment Variables

Copy `.env.template` to `.env` and fill in your actual values:

- **Supabase**: Get from Project Settings → API
- **R2**: Get from Cloudflare Dashboard → R2 → Manage API Tokens
- **B2**: Get from Backblaze → App Keys
- **Paystack**: Get from Dashboard → Settings → Developer
- **Gemini**: Get from https://ai.google.dev/
- **Groq**: Get from https://console.groq.com/keys

---

## 💳 Credit System

| Action | Credits Cost |
|--------|--------------|
| Video Scan (Gemini) | 10 |
| AI Metadata (Groq) | 5 |
| 480p Render | 10 |
| 720p Render | 20 |
| 1080p Render | 50 |
| 4K Render | 100 |

### Free Trial
- New users get **50 credits** on signup
- Top-up when credits exhausted: ₦1,000 for 100 credits

### Subscription Plans
| Plan | Price | Monthly Credits | Storage |
|------|-------|-----------------|---------|
| Starter | ₦2,500 | 250 | 30 min |
| Pro | ₦6,000 | 750 | 24 hours |
| Creator | ₦12,000 | 2,000 | 7 days |

---

## 🔧 Tech Stack

### Frontend
- React + TypeScript + Vite
- Tailwind CSS
- Cloudflare Pages

### Backend Worker (Railway)
- Python + Flask
- FFmpeg for video processing
- boto3 for R2/B2 storage

### AI Services
- **Gemini 2.5 Flash** (Free Tier) - Video analysis
- **Groq Llama 3.3 70B** (Free Tier) - Caption generation

### Storage
- **Cloudflare R2** (Primary) - Zero egress fees
- **Backblaze B2** (Fallback) - Backup storage

### Database & Auth
- **Supabase** - PostgreSQL + Auth

### Payments
- **Paystack** - Nigerian Naira (₦) payments

---

## 📊 Database Schema

### Tables
- `profiles` - User accounts with credits & tier
- `clips` - Video processing records
- `credit_transactions` - Audit trail
- `subscriptions` - Paystack subscriptions
- `topup_purchases` - One-time credit purchases
- `referrals` - Referral tracking

### Key Features
- Row Level Security (RLS) enabled
- Automatic credit deduction functions
- Clip expiry based on tier (30min/24h/7d)
- Leaderboard views (all-time & weekly)

---

## 🎬 Processing Pipeline

1. **Upload** → Video to R2/B2
2. **Scan** → Gemini detects hype moments
3. **Caption** → Groq generates viral text
4. **Render** → FFmpeg cuts & scales clip
5. **Store** → Final clip to R2/B2
6. **Notify** → Webhook to Supabase
7. **Cleanup** → Delete temp files immediately

---

## 🧹 Cleanup Protocol

### Local (Railway)
- Every render uses unique UUID subfolder
- `shutil.rmtree()` deletes folder after upload
- Disk usage stays at ~0%

### Cloud (R2/B2)
- 24-hour lifecycle expiration policy
- Clips auto-delete after expiry
- User gets countdown timer in UI

---

## 📞 Support

Email: support@clipai.com
Twitter: @Olhmescraxes1

---

**© 2026 ClipAI by OLHMES. Built in Lagos, Nigeria.**
