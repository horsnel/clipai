#!/usr/bin/env python3
"""Apply the ClipAI schema to Supabase.

Uses the connection string format:
  postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres

The DB password is what the user set when creating the Supabase project.
We don't have it, so this script will guide the user through the alternatives.
"""

import sys
import os

# Supabase connection details
SUPABASE_URL = "https://wbchudfstqosjjoiepvo.supabase.co"
PROJECT_REF = "wbchudfstqosjjoiepvo"

# Try common password env vars
PASSWORDS_TO_TRY = [
    os.environ.get("SUPABASE_DB_PASSWORD", ""),
    os.environ.get("POSTGRES_PASSWORD", ""),
]

SCHEMA_FILE = "/home/z/my-project/clipai-v2/app/scripts/schema.sql"

def main():
    schema = open(SCHEMA_FILE).read()
    print(f"Schema file: {SCHEMA_FILE} ({len(schema)} chars)")
    print()

    # Check if we have a password
    password = next((p for p in PASSWORDS_TO_TRY if p), None)
    if not password:
        print("No SUPABASE_DB_PASSWORD env var found.")
        print()
        print("To apply the schema, you have three options:")
        print()
        print("OPTION 1 (easiest) — Supabase Dashboard:")
        print("  1. Open https://supabase.com/dashboard/project/wbchudfstqosjjoiepvo/sql/new")
        print("  2. Click 'New query'")
        print("  3. Paste the entire contents of app/scripts/schema.sql")
        print("  4. Click 'Run'")
        print()
        print("OPTION 2 — provide the DB password:")
        print("  SUPABASE_DB_PASSWORD=your-password python3 scripts/apply_schema.py")
        print()
        print("OPTION 3 — use psql from your machine:")
        print("  psql 'postgresql://postgres.wbchudfstqosjjoiepvo:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres' \\")
        print("    -f app/scripts/schema.sql")
        sys.exit(0)

    # Try the connection
    import psycopg2
    for region in ["us-east-1", "eu-west-1", "ap-southeast-1", "eu-central-1"]:
        host = f"aws-0-{region}.pooler.supabase.com"
        conn_str = f"postgresql://postgres.{PROJECT_REF}:{password}@{host}:6543/postgres"
        try:
            print(f"Trying {host}...")
            conn = psycopg2.connect(conn_str, connect_timeout=10)
            cur = conn.cursor()
            cur.execute(schema)
            conn.commit()
            cur.close()
            conn.close()
            print(f"✓ Schema applied successfully via {host}")
            return
        except Exception as e:
            print(f"  ✗ {e}")

    print("All regions failed. Falling back to OPTION 1 (Dashboard).")
    sys.exit(1)

if __name__ == "__main__":
    main()
