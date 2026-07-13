#!/usr/bin/env python3
"""Debug Supabase auth signup failure.

Strategy:
1. Drop the on_auth_user_created trigger so signup doesn't fire the trigger
2. Try signup — if it works, the trigger is the culprit
3. If trigger was the issue, try calling handle_new_user() manually with a fake NEW record
"""
import os
import psycopg2
import json
import urllib.request

PROJECT_REF = "wbchudfstqosjjoiepvo"
PASSWORD = "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"
HOST = "aws-0-eu-west-1.pooler.supabase.com"
CONN = f"postgresql://postgres.{PROJECT_REF}:{PASSWORD}@{HOST}:6543/postgres"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndiY2h1ZGZzdHFvc2pqb2llcHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NjI0NjAsImV4cCI6MjA5OTUzODQ2MH0.5dG7zByvXk7Fofc6ib35Jez_mrP-gX-r4gBMZ_CnF_4"

def run_sql(sql, fetch=False):
    conn = psycopg2.connect(CONN, connect_timeout=10)
    cur = conn.cursor()
    cur.execute(sql)
    out = cur.fetchall() if fetch else None
    conn.commit()
    cur.close()
    conn.close()
    return out

def signup(email):
    body = json.dumps({"email": email, "password": "TestPass123!"}).encode()
    req = urllib.request.Request(
        f"https://{PROJECT_REF}.supabase.co/auth/v1/signup",
        data=body,
        headers={"apikey": ANON_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

print("=== Step 1: Drop the trigger and try signup ===")
try:
    run_sql("drop trigger if exists on_auth_user_created on auth.users;")
    print("Trigger dropped.")
except Exception as e:
    print(f"Drop trigger failed: {e}")

status, body = signup("auth-test-003@clipai.dev")
print(f"Signup without trigger: HTTP {status}")
print(f"  Body: {body[:400]}")

print()
print("=== Step 2: Check what extensions are installed ===")
exts = run_sql("select extname, extversion from pg_extension order by extname;", fetch=True)
for e in exts:
    print(f"  {e[0]} {e[1]}")

print()
print("=== Step 3: Check if uuid_generate_v4 is available ===")
try:
    result = run_sql("select uuid_generate_v4();", fetch=True)
    print(f"  uuid_generate_v4() works: {result[0][0]}")
except Exception as e:
    print(f"  uuid_generate_v4() FAILED: {e}")

print()
print("=== Step 4: Check if gen_random_uuid() works (built-in) ===")
try:
    result = run_sql("select gen_random_uuid();", fetch=True)
    print(f"  gen_random_uuid() works: {result[0][0]}")
except Exception as e:
    print(f"  gen_random_uuid() FAILED: {e}")

print()
print("=== Step 5: Look at recent auth.users ===")
users = run_sql("select id, email, created_at, email_confirmed_at from auth.users order by created_at desc limit 5;", fetch=True)
for u in users:
    print(f"  {u[0]} | {u[1]} | {u[2]} | confirmed={u[3]}")

print()
print("=== Step 6: Re-create trigger with gen_random_uuid (more reliable) ===")
# Replace uuid_generate_v4 with gen_random_uuid in the function
fixed_fn = """
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
begin
  -- Generate a unique 8-char referral code from a random UUID
  new_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.profiles (id, email, full_name, referral_code, credits)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new_code,
    50
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
"""
try:
    run_sql(fixed_fn)
    print("Function re-created with gen_random_uuid().")
except Exception as e:
    print(f"Function creation FAILED: {e}")

# Recreate trigger
try:
    run_sql("create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();")
    print("Trigger re-created.")
except Exception as e:
    print(f"Trigger creation FAILED: {e}")

print()
print("=== Step 7: Try signup again with fixed trigger ===")
status, body = signup("auth-test-004@clipai.dev")
print(f"Signup with fixed trigger: HTTP {status}")
print(f"  Body: {body[:500]}")

# Extract access_token
if status == 200:
    try:
        data = json.loads(body)
        token = data.get("access_token") or (data.get("session") or {}).get("access_token", "")
        if token:
            print(f"\nAccess token (first 60 chars): {token[:60]}...")
            # Save for next step
            with open("/tmp/test_jwt.txt", "w") as f:
                f.write(token)
            print("Token saved to /tmp/test_jwt.txt")
    except Exception as e:
        print(f"Token extraction failed: {e}")
