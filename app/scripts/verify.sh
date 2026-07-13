#!/usr/bin/env bash
# ClipAI v2 — Live verification script
# Run after any deploy or env-var change to confirm the worker is healthy.
#
# Usage:
#   ./scripts/verify.sh                # default: valorant
#   ./scripts/verify.sh fortnite       # any game slug
#   GAME=fortnite ./scripts/verify.sh  # alt syntax
#
# Exits non-zero if any check fails.

set -euo pipefail

GAME="${1:-${GAME:-valorant}}"
BASE="https://clipai-bqo.pages.dev/api"

green()  { printf "\033[32m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }

echo "═══════════════════════════════════════════════════════════════════════════════"
bold "  CLIPAI v2 — LIVE VERIFICATION"
echo "  Game: $GAME  |  Base: $BASE"
echo "  Time: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo

FAIL=0

# ── 1. Health ─────────────────────────────────────────────────────────────────
bold "── 1. Health check ────────────────────────────────────────────────────────────"
health=$(curl -s "$BASE/health")
echo "$health" | python3 -m json.tool
llm=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('llm','?'))")
if [ "$llm" = "none" ]; then
  red "  ✗ No LLM provider configured — set SILICONFLOW_API_KEY, MISTRAL_API_KEY, or GROQ_API_KEY"
  FAIL=1
else
  green "  ✓ LLM provider: $llm"
fi
echo

# ── 2. Per-layer diagnostic ───────────────────────────────────────────────────
bold "── 2. Per-layer diagnostic ────────────────────────────────────────────────────"
diag=$(curl -s "$BASE/trends/_diag?game=$GAME" --max-time 60)
echo "$diag" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d: print('ERROR:', d['error']); sys.exit(0)
print('env_keys_present:')
for k, v in d.get('env_keys_present', {}).items():
    print(f'  {k:22}: {v}')
print(f'llm_provider: {d.get(\"llm_provider\")}')
print()
print('Layer results:')
print(f'  redditTop_output: {d.get(\"redditTop_count\", \"?\")} items')
layers = d.get('layers', {})
for k in ['google_trends_explore', 'google_news_rss', 'bing_news_rss']:
    v = layers.get(k, {})
    status = v.get('status', '?')
    items = v.get('items_found', v.get('count', '?'))
    print(f'  {k:22}: HTTP {status}, items={items}')
"
echo

# ── 3. Raw per-platform data ─────────────────────────────────────────────────
bold "── 3. Raw per-platform data (debug=1) ─────────────────────────────────────────"
debug=$(curl -s "$BASE/trends?game=$GAME&debug=1" --max-time 90)
echo "$debug" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d: print('ERROR:', d['error']); sys.exit(0)
print('Sources (raw counts):')
for k, v in d.get('sources', {}).items():
    marker = '✓' if v > 0 else '○'
    print(f'  {marker} {k:14}: {v}')
total_raw = sum(d.get('sources', {}).values())
if total_raw == 0:
    print()
    print('  ⚠ All sources returned 0 — likely missing env vars or all platforms rate-limited.')
"
echo

# ── 4. Full synthesized trends ────────────────────────────────────────────────
bold "── 4. Full synthesized trends ─────────────────────────────────────────────────"
synth=$(curl -s "$BASE/trends?game=$GAME" --max-time 120)
echo "$synth" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d: print('ERROR:', d['error']); sys.exit(0)
print('Sources:', d.get('sources'))
trends = d.get('trends', [])
print(f'Total trends: {len(trends)}')
print()
for i, t in enumerate(trends, 1):
    name = t.get('name','')[:55]
    plat = t.get('platform','')[:13]
    score = t.get('score','?')
    status = t.get('status','?')
    print(f'{i:2}. [{plat:13}] {name:55} score={score:>3} {status}')
if len(trends) == 0:
    print()
    print('  ⚠ No trends synthesized — LLM may have failed or no source data.')
"
echo

# ── 5. Auth-gated endpoints (should 401 without token) ───────────────────────
bold "── 5. Auth-gated endpoints (expect 401) ──────────────────────────────────────"
for path in /auth/me /leaderboard /rank/me; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  if [ "$code" = "401" ]; then
    green "  ✓ GET $path → 401 (auth middleware working)"
  else
    red "  ✗ GET $path → $code (expected 401)"
    FAIL=1
  fi
done
for path in "POST /clipbot" "POST /forge/captions"; do
  method=$(echo "$path" | awk '{print $1}')
  p=$(echo "$path" | awk '{print $2}')
  code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$BASE$p" -H "Content-Type: application/json" -d '{}')
  if [ "$code" = "401" ]; then
    green "  ✓ $method $p → 401 (auth middleware working)"
  else
    red "  ✗ $method $p → $code (expected 401)"
    FAIL=1
  fi
done
echo

# ── 6. Public endpoints ──────────────────────────────────────────────────────
bold "── 6. Public endpoints ────────────────────────────────────────────────────────"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/forge/top-captions?game=$GAME")
if [ "$code" = "200" ]; then
  green "  ✓ GET /forge/top-captions → 200 (returns captions, possibly empty)"
else
  red "  ✗ GET /forge/top-captions → $code (expected 200)"
  FAIL=1
fi
echo

# ── Summary ──────────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════════════════════"
if [ $FAIL -eq 0 ]; then
  green "  ✓ ALL CHECKS PASSED"
else
  red "  ✗ SOME CHECKS FAILED — see above"
fi
echo "═══════════════════════════════════════════════════════════════════════════════"

exit $FAIL
