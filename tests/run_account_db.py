"""Run the account migration and isolation cases on a disposable PostgreSQL cluster."""
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(subprocess.check_output(["pg_config", "--bindir"], text=True).strip())
with tempfile.TemporaryDirectory(prefix="researchtrail-pg-") as tmp:
    data = Path(tmp) / "pg"
    subprocess.run([BIN / "initdb", "-D", data, "--no-locale", "--encoding=UTF8",
                    "--no-sync", "--auth=trust"], stdout=subprocess.DEVNULL, check=True)
    # A postmaster normally advances beyond bootstrap OIDs. PostgreSQL exempts catalog OIDs
    # below 16384 from RLS. Set the normal starting OID on this unused temporary cluster.
    subprocess.run([BIN / "pg_resetwal", "-o", "16384", data], stdout=subprocess.DEVNULL, check=True)
    # Standalone mode executes real PostgreSQL privileges, transactions and RLS without a socket.
    def execute(sql):
        result = subprocess.run([BIN / "postgres", "--single", "-j", "-D", data, "postgres"],
                                input="\n".join(line for line in sql.splitlines() if line.strip()) + "\n\n", capture_output=True, text=True,
                                env={**os.environ, "LC_MESSAGES": "C"})
        if result.returncode or any(marker in result.stderr for marker in ("ERROR:", "FATAL:", "PANIC:")):
            raise SystemExit(result.stderr)

    execute("""
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001'), ('bbbbbbbb-0000-4000-8000-000000000002');
""")
    for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        execute(migration.read_text())
    execute((ROOT / "tests/sql/account_workspace.sql").read_text())
    print("PASS: PostgreSQL task and paper registration, retries, isolation, privileges and rollback")
