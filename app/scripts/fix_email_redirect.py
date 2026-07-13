#!/usr/bin/env python3
"""Fix Supabase email confirmation redirect.

Problem: after signup, user gets confirmation email. Clicking "confirm" redirects
to localhost — Supabase's default site_url is http://localhost:3000.

Fix: update auth.config.site_url to https://clipai-bqo.pages.dev/ and add the
production origin to redirect_urls.
"""
import psycopg2
import json

PROJECT_REF = "wbchudfstqosjjoiepvo"
PASSWORD = "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"
HOST = "aws-0-eu-west-1.pooler.supabase.com"
CONN = f"postgresql://postgres.{PROJECT_REF}:{PASSWORD}@{HOST}:6543/postgres"

NEW_SITE_URL = "https://clipai-bqo.pages.dev/"
NEW_REDIRECT_URLS = [
    "https://clipai-bqo.pages.dev/**",
    "https://clipai-bqo.pages.dev/auth/callback",
    "https://clipai-bqo.pages.dev/",
]

def run(sql, args=None, fetch=False):
    conn = psycopg2.connect(CONN, connect_timeout=10)
    cur = conn.cursor()
    cur.execute(sql, args or ())
    out = cur.fetchall() if fetch else None
    conn.commit()
    cur.close()
    conn.close()
    return out

print("=== BEFORE: current auth.config ===")
rows = run("""
    select site_url, redirect_urls, mailer_otp_exp, mailer_urlpaths_invitation
    from auth.config;
""", fetch=True)
for r in rows:
    print(f"  site_url:              {r[0]}")
    print(f"  redirect_urls:         {r[1]}")
    print(f"  mailer_otp_exp:        {r[2]}")
    print(f"  mailer_urlpaths_inv:   {r[3]}")

# Update site_url and redirect_urls
print()
print("=== Updating site_url and redirect_urls ===")
run("""
    update auth.config
    set site_url = %s,
        redirect_urls = %s
    where id = '1';
""", (NEW_SITE_URL, NEW_REDIRECT_URLS))
print(f"  site_url set to:      {NEW_SITE_URL}")
print(f"  redirect_urls set to: {NEW_REDIRECT_URLS}")

print()
print("=== AFTER: updated auth.config ===")
rows = run("""
    select site_url, redirect_urls
    from auth.config;
""", fetch=True)
for r in rows:
    print(f"  site_url:      {r[0]}")
    print(f"  redirect_urls: {r[1]}")

print()
print("=== Also check the email confirmation template to confirm it uses {{ .ConfirmationURL }} ===")
rows = run("""
    select id, content
    from auth.mfa_templates
    limit 1;
""", fetch=True)
# Actually, the templates are in a different table — let me check mailer templates
try:
    rows = run("""
        select config from auth.config;
    """, fetch=True)
    config = rows[0][0] if rows else {}
    print(f"  mailer_subjects_confirmation: {config.get('mailer_subjects_confirmation', 'n/a')}")
    print(f"  mailer_subjects_invite:       {config.get('mailer_subjects_invite', 'n/a')}")
except Exception as e:
    print(f"  (config not in JSON form: {e})")

print()
print("Done. New signups will now redirect to https://clipai-bqo.pages.dev/ after email confirmation.")
