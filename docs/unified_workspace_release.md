# Unified workspace release verification · 2026-11-27

**Release verification is incomplete.** A real PostgreSQL run found and confirmed a fix for duplicate paper cards. Three automated checks still expect the former account entry screen. The complete pgvector, browser and loopback Supabase runs need the Ubuntu checks below.

Compared the local `origin/main` at `7577255` with `feature/unified-workspace-qa` at `9bd2edf`. The branch was six commits ahead and zero behind, spanning 56 files. The index and working tree were clean on entry. The release fix and draft regressions are unstaged. Verification used repository fixtures, generated accounts and PDF text, and mocked provider requests. There was no remote fetch, hosted database or Storage request, live model call, deployment, push or PR.

## Controls reviewed

| From the shipped site | Path and observations | Evidence |
|---|---|---|
| Account build, Google login or restored session | The SDK handles the PKCE callback at the site root. The shared timeline opens the last accessible project selected in this tab for this account. A fresh tab uses the first eligible project. An empty account gets **새 프로젝트**. | Real SDK with mocked Auth, plus root and project-picker event tests |
| Timeline, graph and list | **+ 논문 추가** registers a work and its task-specific use. The detail dialog accepts private PDF editions. **이동 경로 추가** selects a second paper and saves a directed link and its reason. The graph supports reason edits and link removal. | Controller event tests, authenticated Edge handlers and real SQL |
| Paper detail → edition → reader | A timeline card or list row opens a particular use. The PDF button identifies an artifact, including separate same-name editions. Text highlights carry page, normalized rectangles and a memo version ID. Opening the reader restores its saved page. | Reader and recovery harnesses, SQL. The rendered two-browser journey is pending. |
| Reader memo and project record | The paper reader fixes the association to the open edition. **프로젝트 기록** supports task-level and paper-associated memos. Corrections retain the original. Confirming a next action is an explicit, separate write. | Controlled delayed/failed requests, project switches and reopened controllers, plus persistence SQL |
| 질문하기 | Opening a paper does no paid work. The panel checks the edition’s index. Consent precedes PDF.js text extraction, chunk upload and indexing. A question sends the authenticated open-edition scope and chosen depth. A verified citation targets its edition and page. | Panel event tests, mocked outgoing Responses and embedding requests, and privacy canary. Rendered citation navigation is pending. |
| Device work, demo and logout | **이 브라우저에 저장한 작업 열기** reopens the same-origin browser store. Logging out returns to device work. Device papers stay separate across login, switching accounts and logout. | Guest and account isolation, storage and PKCE regressions. The built root browser scenario awaits Chromium. |

The former account page still has compatibility code and regression callers. Three existing tests require a team decision on replacing their retired entry-point expectations. Device-only controls such as tags have no account storage contract in this release. Bringing them into the signed-in workspace would need a product decision. Existing Q&A callers retain their linked-paper contract. Widening the shared reader’s single-PDF release scope would be a separate decision.

## Defect found

Saving an edition-bound memo creates a separate `DocumentUse` for its original record context. With two registered papers, the original catalog returned three rows after that save. The new signed-in workspace requests `GET /tasks/{task_id}/papers?view=workspace`. Its authenticated database read omits a redundant, metadata-free record reference when a registration in the same task covers it. Explicit registrations of the same work, independent editions, evidence and existing link endpoints remain addressable. Plain `GET /papers` under a task keeps its previous result. The migration adds one read function and its grant. It performs no data rewrite.

The new database case writes through the production RPCs in one PostgreSQL backend. A second backend opens the committed data as the same owner. It checks the two paper IDs, directed link and reason, exact memo and artifact association, same-name sibling, highlight coordinates and memo ID, and saved page. It also checks independently registered uses, legacy link targets, a work introduced only in a memo, a use carrying its own reason, a reference with an excerpt, anonymous permissions and denial for a foreign owner. Storage objects in this runner use a fixture catalog. The loopback test below uploads and downloads actual PDF bytes.

## Command results

Commands were run from the repository root unless indicated. Node was 24.22.3, npm 11.19.1, Python 3.12.3 and PostgreSQL 16.15 on Ubuntu 24.04. The focused JavaScript cases are included in the full JavaScript count.

| Command | Observed result |
|---|---|
| `git status --short --branch`, `git diff --cached --stat`, `git rev-list --left-right --count origin/main...HEAD`, `git log --oneline origin/main..HEAD`, `git diff --name-status origin/main...HEAD`, `git diff --stat origin/main...HEAD` | Initial index empty, six branch commits, divergence `0 6`. The name-status command lists all 56 already-committed paths. |
| `git diff --check origin/main...HEAD` and `git diff --check` | Passed for the branch and tracked working changes. |
| `npm ci --offline --no-audit --no-fund` | Installed 13 locked packages beside copies of package.json and its lockfile. Rebuilt both modes in that directory from the working tree’s tracked web files and build script with `npm --prefix "$build_fixture" run build`. Both outputs passed `node scripts/check-web-output.mjs "$build_fixture/dist"` (84 and 85 files). |
| `python3 -B scripts/check_next_action_parser.py --offline` | 48/48 passed, zero live calls. The generated evaluation output was kept out of the patch. |
| `PYTHONPATH=src python3 -B -m unittest discover -s tests -p 'test_*.py' -v` | 25/31 passed. All six OpenAIServerTests stopped in setup when creating their loopback HTTP server with PermissionError. |
| `node --test --test-isolation=none tests/*.test.mjs tests/web_*.test.cjs` | 229/232 passed, three failed, zero skipped. Clean starting HEAD had the same three failures, 227/230. The broad run includes auth, guest/demo, storage, projects, parser UI, private PDFs, records, actions, graph, Edge, Q&A, privacy and static build tests. |
| `node --test --test-isolation=none tests/workspace_catalog_edge.test.mjs tests/unified_reader_ask_edge.test.mjs tests/account_rag*.test.mjs tests/account_chat_privacy.test.mjs tests/web_account_chat.test.cjs tests/web_account_timeline.test.cjs tests/web_workspace_cutover.test.cjs tests/web_unified_graph.test.cjs tests/web_reader_recovery.test.cjs` | 63/63 passed. Project changes send the catalog query on the caller’s bearer. Recovery keeps retry identity, pending edits and scope. Korean/English auto depth, all manual depths, invalid input, omitted fields, consent, compatible indexes, failed requests, insufficient evidence, stale answers and verified citation targets ran with mocked transports. |
| `node --test --test-isolation=none tests/workspace_catalog_edge.test.mjs` | Before the fix the workspace request called rt_papers. After the fix the workspace and legacy reads used their respective RPCs with the authenticated bearer, 1/1 passed. |
| `node --test --test-isolation=none tests/*.test.mjs` | 90/90 Edge, retrieval, privacy and provider-contract tests passed. |
| `node --test --test-isolation=none tests/web_account_auth.test.cjs tests/web_workspace_cutover.test.cjs tests/web_account_timeline.test.cjs tests/web_storage_failure.test.cjs tests/web_storage_conflict.test.cjs` | 25/25 passed for authentication, guest storage, project selection, failures and cross-tab protection. |
| `npm run test:build` | 1/1 passed for deterministic public configuration and removal of stale build output. |
| `env -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY npm run build && node scripts/check-web-output.mjs` | Passed. 84 static files and seven bundled demo PDFs. Browser config held exactly the two empty public fields. |
| `SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build && node scripts/check-web-output.mjs` | Passed. 85 static files and seven bundled demo PDFs. The root was the account entry and browser.html was the shared app. The privacy test also checked its synthetic server-secret canary against browser sources, built bytes, responses and captured logs. |
| `CHROMIUM_EXECUTABLE_PATH=/snap/brave/current/opt/brave.com/brave/brave node --test --test-isolation=none tests/built_pdf.test.cjs tests/built_save_status.test.cjs` | Browser-only build. Both scenarios stopped at Chromium launch, Crashpad setsockopt denied. No rendered assertions ran. |
| `CHROMIUM_EXECUTABLE_PATH=/snap/brave/current/opt/brave.com/brave/brave node --test --test-isolation=none tests/built_account_reader.test.cjs tests/built_workspace_cutover.test.cjs tests/built_account_chat.test.cjs` | Account build. All four scenarios stopped at the same launch error. |
| `python3 -B tests/run_account_db.py --concurrent` | Full suite blocked at migration 008. PostgreSQL 16 lacked vector.control. Indexing, vector search and the three overlapping record/action/PDF retry schedules remain unverified in PostgreSQL. |
| `pg_config --version`, `apt-cache policy postgresql-16-pgvector`, `apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=5 download postgresql-16-pgvector` | PG 16.15, pgvector package available in the local apt metadata but absent. Download to a temporary directory failed to resolve the Ubuntu mirror. |
| `python3 -B /tmp/researchtrail-release-Ptobq0dq/db_core.py --before`, then `python3 -B /tmp/researchtrail-release-Ptobq0dq/db_core.py` | Separate socket-free diagnostic on a new PostgreSQL cluster. It used the repository runner’s bootstrap and migrations 001–007, 010 and 011. The old catalog failed the two-card expectation. After the fix, all eight existing non-vector SQL cases and the new two-session case passed. The shared suite command above runs these same checked-in SQL files with all migrations on Ubuntu. |
| `docker -H unix:///var/run/docker.sock info --format '{{.ServerVersion}}'` and `node_modules/.bin/supabase status -o json` | The local daemon socket denied access. CLI status output was captured privately. |
| `node tests/local_account_pdfs.mjs --reader` and `node tests/local_workspace_release.mjs` | Both stopped at local-stack verification before creating accounts. Neither the real Auth/Storage integration nor the browser journey is counted as passed. |
| `node --check tests/local_workspace_release.mjs`, `node --check web/js/account.js`, `node --check web/js/main.js` | Passed syntax checks. |

The three failing cases are in `tests/web_account_memos.test.cjs:245` (expects the old iframe URL), `tests/web_account_papers.test.cjs:100` (clicks the removed projects button), and `tests/web_account_pdfs.test.cjs:121` (installs the retired frame entry function). Their assertions remain intact. Current-entry tests exercise session changes, late responses, raw PDF uploads and downloads on the signed-in timeline. Passing those tests and the offline parser supplies no live-model quality or human acceptance verdict.

## Ubuntu commands for the outstanding checks

Run the following from an ordinary Ubuntu user account with usable localhost sockets. The first block prepares the browser and runs the previously blocked suites. It uses both builds because their root entry pages differ.

```bash
cd /home/usakapi329/projects/research-trail
# Select the installed Node 24 runtime in this checkout's Ubuntu environment.
export PATH="$HOME/.nvm/versions/node/v24.22.3/bin:$PATH"
node -v
npm ci --no-audit --no-fund
unset OPENAI_API_KEY CHROMIUM_EXECUTABLE_PATH
npx --no-install playwright-core install --with-deps chromium

PYTHONPATH=src python3 -B -m unittest discover -s tests -p 'test_*.py' -v

env -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY npm run build
node scripts/check-web-output.mjs
node --test --test-isolation=none tests/built_pdf.test.cjs tests/built_save_status.test.cjs

SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build
node scripts/check-web-output.mjs
node --test --test-isolation=none tests/built_account_reader.test.cjs tests/built_workspace_cutover.test.cjs tests/built_account_chat.test.cjs
```

For the complete SQL suite, install the extension for the selected server major. These package names match this checkout’s Ubuntu 24.04 / PostgreSQL 16 host. The runner initializes its own temporary cluster and starts a password-protected loopback listener only for concurrency. The Supabase integration stack below uses the project’s configured PostgreSQL 17 image.

```bash
sudo apt-get update
sudo apt-get install postgresql-16 postgresql-client-16 postgresql-16-pgvector
export PATH="/usr/lib/postgresql/16/bin:$PATH"
pg_config --version
test -r "$(pg_config --sharedir)/extension/vector.control" &&
  test -x "$(pg_config --pkglibdir)/pgxs/src/test/isolation/isolationtester" &&
  python3 -B tests/run_account_db.py --concurrent
```

Run the following after the account build, with a local Docker daemon. It copies just the project config, migrations and function sources to a disposable work directory, uses a distinct project ID and ports, and reads its own loopback CLI status. The shipped browser SDK signs the same synthetic user into two independent browser contexts. The test submits writes through the real UI, drops the first successful memo acknowledgement, retries it, then compares the second browser’s stored link, downloaded file bytes and digests, receipt, memo, rectangles and page. It also opens the same-name sibling, logs out to guest work and checks that a second account opens empty. Provider generation routes are blocked in this test. The built Q&A test above supplies fake passages and answers for citation navigation.

```bash
(
  set -eu
  repo=$(git rev-parse --show-toplevel)
  cli="$repo/node_modules/.bin/supabase"
  stack=$(mktemp -d /tmp/rt-release.XXXXXXXX)
  mkdir "$stack/supabase"
  cp "$repo/supabase/config.toml" "$stack/supabase/"
  cp -R "$repo/supabase/migrations" "$repo/supabase/functions" "$stack/supabase/"
  touch "$stack/supabase/seed.sql"
  sed -i -E \
    -e "s/^project_id = .*/project_id = \"rt-release-${stack##*.}\"/" \
    -e 's/5432([0-9])/5532\1/g' \
    -e 's/^inspector_port = 8083$/inspector_port = 18083/' "$stack/supabase/config.toml"
  cd "$stack"
  unset DOCKER_CONTEXT SUPABASE_URL SUPABASE_PUBLISHABLE_KEY OPENAI_API_KEY
  export DOCKER_HOST=unix:///var/run/docker.sock DO_NOT_TRACK=1
  docker info --format '{{.ServerVersion}}'
  "$cli" start >/dev/null
  worker=''
  cleanup() {
    if [ -n "$worker" ]; then kill "$worker" 2>/dev/null || true; fi
    "$cli" stop --no-backup >/dev/null
  }
  trap cleanup EXIT
  "$cli" migration up --local
  "$cli" functions serve > "$stack/function.log" 2>&1 &
  worker=$!
  public_key=$("$cli" status -o json 2>/dev/null | node -e "const fs=require('node:fs'); process.stdout.write(JSON.parse(fs.readFileSync(0)).PUBLISHABLE_KEY)")
  for attempt in $(seq 1 90); do
    if curl -H "apikey: $public_key" --noproxy '*' -s --max-time 2 http://127.0.0.1:55321/functions/v1/researchtrail/tasks | rg -q 'RESOURCE_UNAVAILABLE'; then break; fi
    if [ "$attempt" -eq 90 ]; then echo 'Local researchtrail function did not become ready.' >&2; exit 1; fi
    sleep 1
  done
  node "$repo/tests/local_account_pdfs.mjs" --reader
  node "$repo/tests/local_workspace_release.mjs"
)
```

## Production compatibility and rollout order

1. Compare the destination’s migration history with the table below. Apply the missing migrations in timestamp order. A Production project already current through `origin/main` needs **010 and 011**. Migration 008 needs pgvector installed in the `extensions` schema. The private bucket and existing artifact IDs are reused.
2. Deploy the **researchtrail** Edge Function, with entry `supabase/functions/researchtrail/index.mjs` and sibling imports from `supabase/functions/_rag/`. Keep the checked-in function authentication configuration. The handler verifies the caller with Supabase Auth before it dispatches data operations. Keep `OPENAI_API_KEY` server-only. `OPENAI_MODEL` defaults to `gpt-6-luna`. `RAG_EMBEDDING_MODEL` defaults to `text-embedding-3-small` for new indexes. Existing ready indexes use their recorded embedding model and 1536 dimensions when answering. Keep access to that model for those indexes. The template’s three values stay blank.
3. Build and publish the static site after the RPCs and function are available. Vercel uses the repository root, `npm ci`, `npm run build`, output `dist`, and only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as public build settings. Preserve the Production site origin and its allowed root OAuth redirect for existing browser data and callbacks. The old request shape still works. The new reader requires the updated function to accept `scope: "open_pdf"` and `answer_depth`. An older handler can also silently return the full legacy catalog for the new projection. A frontend rollback can use the additive backend.

| Timestamp | File under supabase/migrations |
|---|---|
| 20261127000100 | 20261127000100_account_tasks_and_papers.sql |
| 20261127000200 | 20261127000200_account_records.sql |
| 20261127000300 | 20261127000300_task_resume.sql |
| 20261127000400 | 20261127000400_confirm_next_action.sql |
| 20261127000500 | 20261127000500_private_paper_pdfs.sql |
| 20261127000600 | 20261127000600_pdf_reader.sql |
| 20261127000700 | 20261127000700_paper_links.sql |
| 20261127000800 | 20261127000800_rag_index.sql |
| 20261127000900 | 20261127000900_rag_search.sql |
| 20261127001000 | 20261127001000_paper_link_changes.sql |
| 20261127001100 | 20261127001100_workspace_paper_catalog.sql |

## Files to commit

The six earlier implementation commits are already on the branch. This patch contains the workspace catalog migration, Edge route and browser wiring, draft database/Edge/root/loopback regressions, and the updated usage and verification notes. Stage exactly these files when ready.

```bash
git add -- README.md docs/unified_workspace_release.md \
  web/js/account.js web/js/main.js \
  supabase/functions/researchtrail/handler.mjs \
  supabase/migrations/20261127001100_workspace_paper_catalog.sql \
  tests/run_account_db.py tests/sql/workspace_release_write.sql tests/sql/workspace_release.sql \
  tests/workspace_catalog_edge.test.mjs tests/web_workspace_cutover.test.cjs tests/local_workspace_release.mjs
git diff --cached --check
git diff --cached --stat
git commit -m "Keep reader memos from duplicating workspace papers and verify release flows"
```
