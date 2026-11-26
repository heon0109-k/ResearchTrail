"""Run the account migration and isolation cases on a disposable PostgreSQL cluster."""
import argparse
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(subprocess.check_output(["pg_config", "--bindir"], text=True).strip())
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--concurrent", action="store_true", help="also race two sessions using PostgreSQL's isolationtester")
options = parser.parse_args()
with tempfile.TemporaryDirectory(prefix="researchtrail-pg-") as tmp:
    data = Path(tmp) / "pg"
    auth = ["--auth=trust"]  # Standalone mode has no listener.
    if options.concurrent:
        password = secrets.token_hex(24)
        password_file = Path(tmp) / "init-password"
        password_file.write_text(password + "\n")
        auth = ["--auth=scram-sha-256", "--pwfile", password_file]
    subprocess.run([BIN / "initdb", "-D", data, "--no-locale", "--encoding=UTF8",
                    "--no-sync", *auth], stdout=subprocess.DEVNULL, check=True)
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
grant usage on schema auth to authenticated,anon;
insert into auth.users values ('aaaaaaaa-0000-4000-8000-000000000001'), ('bbbbbbbb-0000-4000-8000-000000000002');
-- Stand in for Storage's catalog. File bytes are exercised separately at the HTTP boundary.
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(bucket_id text references storage.buckets(id),name text,metadata jsonb,primary key(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated,anon;
grant select,insert,update,delete on storage.objects to authenticated,anon;
create policy fixture_permissive on storage.objects for all to public using(true) with check(true);
""")
    for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
        execute(migration.read_text())
    execute((ROOT / "tests/sql/account_workspace.sql").read_text())
    print("PASS: PostgreSQL task and paper registration, retries, isolation, privileges and rollback")
    execute((ROOT / "tests/sql/account_records.sql").read_text())
    print("PASS: record content, context links, corrections, retries and atomic rollback")
    execute((ROOT / "tests/sql/account_resume.sql").read_text())
    print("PASS: read-only task resume, stored context, confirmation, ordering and account isolation")
    execute((ROOT / "tests/sql/account_actions.sql").read_text())
    print("PASS: explicit action confirmation, original candidate, manual entry, retries, links and rollback")
    execute((ROOT / "tests/sql/account_pdfs.sql").read_text())
    print("PASS: private PDF bucket, ownership, artifact identity, upload retries and preserved memo")

    if options.concurrent:
        pkglib = subprocess.check_output(["pg_config", "--pkglibdir"], text=True).strip()
        tester = Path(pkglib) / "pgxs/src/test/isolation/isolationtester"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        pg_ctl = [BIN / "pg_ctl", "-D", data, "-w"]
        flags = f"-p {port} -h 127.0.0.1 -c unix_socket_directories=''"
        subprocess.run([*pg_ctl, "start", "-o", flags, "-l", Path(tmp) / "postgres.log"], check=True)
        try:
            cases = [
                ("account_record_retry.spec", "one record and question"),
                ("account_action_retry.spec", "one confirmed action and its selected link"),
                ("account_pdf_retry.spec", "one PDF artifact and its stable Storage path"),
            ]
            for spec, expected in cases:
                result = subprocess.run([tester, f"host=127.0.0.1 port={port} dbname=postgres"],
                                        input=(ROOT / "tests/sql" / spec).read_text(),
                                        env={**os.environ, "PGPASSWORD": password}, capture_output=True, text=True, timeout=45)
                output = result.stdout + result.stderr
                if result.returncode or "ERROR:" in output or output.count("<waiting ...>") != 2 or output.count("<... completed>") != 2:
                    raise SystemExit(output)
                print(f"PASS: overlapping retries waited and returned {expected} after either commit or rollback")
        finally:
            subprocess.run([*pg_ctl, "stop", "-m", "fast"], check=True)
