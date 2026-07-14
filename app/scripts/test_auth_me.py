#!/usr/bin/env python3
"""Create a confirmed test user, get a real JWT, then hit /api/auth/me."""
import json
import urllib.request
import urllib.error

PROJECT_REF = "wbchudfstqosjjoiepvo"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY2h1ZGZzdHFvc2pqb2llcHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjI0NjAsImV4cCI6MjA5OTUzODQ2MH0.5dG7zByvXk7Fofc6ib35Jez_mrP-gX-r4gBMZ_CnF_4"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY2h1ZGZzdHFvc2pqb2llcHZvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk2MjQ2MCwiZXhwIjoyMDk5NTM4NDYwfQ.QDFkhQ2s7_AoFOb2geTeFOihCXpfjNO9_mPawYX7vGo"

def http(method, url, headers, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

# Step 1: Create user with email_confirm=true via admin API
print("=== Step 1: Create confirmed user via admin API ===")
status, body = http("POST",
    f"https://{PROJECT_REF}.supabase.co/auth/v1/admin/users",
    {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"},
    {"email": "auth-confirmed@clipai.dev", "password": "TestPass123!", "email_confirm": True, "user_metadata": {"full_name": "Auth Confirmed"}}
)
print(f"HTTP {status}")
print(f"  Body: {body[:400]}")
user_id = ""
if status == 200:
    user_id = json.loads(body).get("id", "")
    print(f"  User ID: {user_id}")

# Step 2: Sign in to get access_token
print()
print("=== Step 2: Sign in with password to get JWT ===")
status, body = http("POST",
    f"https://{PROJECT_REF}.supabase.co/auth/v1/token?grant_type=password",
    {"apikey": ANON_KEY, "Content-Type": "application/json"},
    {"email": "auth-confirmed@clipai.dev", "password": "TestPass123!"}
)
print(f"HTTP {status}")
token = ""
if status == 200:
    data = json.loads(body)
    token = data.get("access_token", "")
    print(f"  Token length: {len(token)}")
    print(f"  Token preview: {token[:60]}...")
    print(f"  Expires at: {data.get('expires_at')}")

# Step 3: Hit /api/auth/me on the worker
print()
print("=== Step 3: GET /api/auth/me with the JWT ===")
status, body = http("GET",
    "https://clipai-bqo.pages.dev/api/auth/me",
    {"Authorization": f"Bearer {token}"}
)
print(f"HTTP {status}")
print(f"  Body: {body[:600]}")

# Step 4: Hit /api/leaderboard (also auth-gated)
print()
print("=== Step 4: GET /api/leaderboard (auth-gated) ===")
status, body = http("GET",
    "https://clipai-bqo.pages.dev/api/leaderboard?limit=10",
    {"Authorization": f"Bearer {token}"}
)
print(f"HTTP {status}")
print(f"  Body: {body[:600]}")

# Step 5: Save token for further testing
if token:
    with open("/tmp/test_jwt.txt", "w") as f:
        f.write(token)
    print(f"\nToken saved to /tmp/test_jwt.txt for further testing")
