# Google 로그인 후의 작업공간

Google 로그인을 마치면 사이트 루트가 세션을 확인하고 원래 타임라인을 엽니다. 게스트와 로그인 사용자는 같은 `views/main.html`, `views/reader.html`, `showMain()`과 화면별 렌더 함수를 사용합니다. 로그인 상태에서는 계정 저장소와 인증된 `researchtrail` 함수가 이 화면의 데이터를 제공합니다.

- 새 기기는 계정에서 마지막으로 직접 선택한 프로젝트를 엽니다. 이미 열었던 탭을 새로고침하면 그 탭의 프로젝트를 유지합니다. 선택한 프로젝트에 접근할 수 없으면 접근 가능한 첫 프로젝트를 엽니다. 자동으로 연 프로젝트는 계정의 마지막 선택을 바꾸지 않습니다.
- 프로젝트가 없는 계정은 같은 타임라인의 **새 프로젝트**에서 시작합니다. 직접 과업을 바꾸려면 상단의 **프로젝트 이름**을 누릅니다. 프로젝트 기록도 이 메뉴에서 엽니다.
- **로그아웃**하면 기기에 저장한 작업공간으로 돌아갑니다. 로그아웃 상태의 소개 페이지에서 **이 브라우저에 저장한 작업 열기**로 기존 논문과 메모에 접근할 수 있습니다. 로그인 중에 기기 기록을 가져오거나 계정으로 업로드하는 단계는 없습니다.
- 계정 빌드의 과거 주소 `views/account.html`과 `views/account-projects.html`은 쿼리와 해시를 보존해 사이트 루트로 이동합니다. 직접 연 `browser.html`도 인증 진입점을 거칩니다. 명시적으로 연 예시는 합성 프로젝트를 보여 줍니다.

## 화면별 저장 경로

| 원래 화면과 조작 | 로그인 후 계정에서 복원하는 내용 |
|---|---|
| 프로젝트 이름과 메뉴 | 프로젝트 생성·이름 변경·보관, 마지막으로 직접 고른 프로젝트. 프로젝트를 보관하면 과거 기록과 파일은 유지됩니다. |
| 타임라인과 사이드바 | 날짜별 카드, 날짜 미기록 논문, 이어 읽기, 태그 이름·색·배정·삭제, 기간과 태그 표시 설정. 태그와 논문을 함께 제거할 때 다른 기기에서 배정이 달라졌으면 다시 확인합니다. |
| 연결 그래프 | 동일 과업의 두 논문 사이 방향·연결 이유·편집·삭제, 노드 이동과 확대·배치. |
| 논문 목록·상세·등록 | 제목 검색어, 정렬·읽기 상태 필터, 제목·날짜·저장 이유·읽기 상태·태그·저자 등의 변경, 채택·숨김 처리한 외부 자료, 비공개 PDF와 읽을 판본. 한 번에 제출한 논문 수정은 같은 저장 요청에서 반영하며, 다른 과업에 있는 같은 저작물의 제목은 유지합니다. |
| PDF와 읽기 기록 | 선택한 파일의 원본 바이트와 판본 ID, 마지막 쪽, 문장과 좌표를 담은 하이라이트, 영역 캡처의 이미지·쪽·좌표, 연결한 메모 원문과 정정 이력. 리더의 배치·확대 설정도 복원합니다. 새 기기에서 PDF를 열기만 하면 저장된 쪽으로 이동합니다. |
| 메모와 다음 작업 | 리더에서 쓴 메모는 해당 저작물·판본을 가리킵니다. **프로젝트 기록**에서는 논문을 지정하지 않은 메모도 작성하고 정정할 수 있습니다. 후보와 최종 확인값은 분리하며 사용자가 확인한 다음 작업만 확정 저장합니다. |
| 질문하기 | 해당 PDF 판본의 색인·대화·답변 깊이·확인된 인용. 동의 화면에서 추출 본문을 구절로 나누어 임베딩 서비스로 보낸다고 안내합니다. 호환되는 준비 완료 색인은 재사용합니다. 선택한 PDF의 구절만 답변 모델에 보내며, 검증된 인용은 같은 판본의 원문 쪽을 엽니다. 추출할 글자가 없거나 근거가 부족하면 패널에서 알립니다. |
| AI 정리 | 메모 전송에 대한 별도 동의, 정리 결과와 근거, 사용자가 확인한 다음 작업. 브라우저 전용 개발 설정과 계정의 전송 동의는 별도로 관리합니다. |

계정 저장 문구는 서버 응답을 확인한 뒤에 표시합니다. 확인하지 못한 변경은 계정·프로젝트와 해당 판본, 논문 또는 기록에 연결됩니다. 재시도할 때 지원되는 요청 ID를 유지합니다. 과거 수정의 늦은 응답 또는 다른 프로젝트의 저장 성공으로 현재 실패 표시를 해제하지 않습니다.

## 기기와 탭에 남는 조작

- **게스트 저장**으로 만든 프로젝트·PDF·메모와 해당 작업공간의 표시 설정은 이 브라우저에 남습니다. 계정 저장 자료는 로그아웃한 작업공간에 나타나지 않습니다.
- 계정에서 보고 있는 화면, 열린 패널·탭, 목록과 타임라인의 스크롤, 현재 선택, **내용 찾기**의 검색어는 탐색 상태입니다. 위 표의 **논문 목록** 검색어·정렬·필터는 계정 프로젝트 설정에 속합니다.
- 등록 전 폼, 아직 전송하지 않은 질문이나 빠른 메모 입력, 드래그 중인 영역, 선택 전 첨부 파일과 미채택 자료 후보는 조작 중의 상태입니다. 복사와 다운로드는 기기의 클립보드와 파일을 사용합니다.
- 현재 탭의 프로젝트와 실패한 요청의 재시도 정보는 계정별로 탭에 보관합니다. PDF 업로드가 중단된 상태에서 새로고침하면 저장 대상 논문에서 같은 파일을 다시 선택해야 합니다. 다른 기기에서는 서버가 수락한 내용을 조회합니다.

이 표에서 저장 동작이 있는 계정 연구 데이터에 브라우저 전용 저장소를 사용하는 컨트롤은 확인되지 않았습니다. 렌더 실측과 두 기기 브라우저 동작의 검증 상태는 아래와 같습니다.

## 검증 상태

| 항목 | 관찰 결과 |
|---|---|
| 로그인과 복귀 경로 | 새 진입 테스트에서 PKCE 콜백·갱신된 토큰·계정 교체·로그아웃·과거 주소를 확인했습니다. 제거된 작업공간 전환 버튼과 이전 계정 화면을 찾는 기존 테스트는 일부 실패하며 승인된 단언을 유지합니다. |
| 화면 비교 | 기준 커밋과 현재 코드에서 같은 합성 프로젝트로 데스크톱·휴대폰의 타임라인, 그래프, 목록, 상세, 리더 마크업을 생성했습니다. 리더에는 판본 저장 안내가 추가됩니다. 실제 픽셀과 반응형 배치 검사는 Chromium이 시작하지 못해 미검증입니다. [화면별 비교표](research/product_workspace_paired_markup.md) · [기준과 측정 방법](product_workspace_baseline.md) |
| 계정 저장과 Q&A | 선택·재시도·원자적 논문 수정과 판본별 캡처를 대상으로 JS 및 Edge 검사를 실행했습니다. 모의 제공자를 사용하는 Q&A 검사는 실제 핸들러와 검색·생성 코드를 거칩니다. 실제 모델의 답변 품질은 사람의 평가 대상입니다. |
| 데이터베이스 | 로컬 PostgreSQL 16의 비벡터 검사와 012에서 013으로 올린 기존 데이터 검사를 실행했습니다. 이 환경에서는 서버 버전에 맞는 pgvector가 없어 008을 포함한 전체 SQL·동시성 검증이 중단됐습니다. |
| 배포용 브라우저와 로컬 스택 | Chromium이 Crashpad의 `setsockopt EPERM`에서 중단돼 배포용 PDF·저장 상태·두 세션·인용 이동·픽셀 비교는 브라우저 단언에 도달하지 못했습니다. 로컬 Docker 기반 Supabase 통합도 실행 가능한 루프백 스택이 필요합니다. |

2026-11-27 검증에서 오프라인 파서는 48/48, 두 정적 빌드는 각각 파일 89개와 번들 PDF 7개의 출력 검사를 통과했습니다. 모의 응답을 사용한 제품·Edge 집중 검사 86개가 통과했습니다. 전체 JavaScript 회귀는 309개 중 295개 통과, 14개 실패입니다. 실패한 기존 검사에는 제거한 계정 화면이나 버튼을 요구하는 경우와 새 화면의 필수 스크립트를 로드하지 않는 테스트 구성이 있습니다. Python 회귀는 31개 중 25개 통과했고 나머지 6개는 모의 HTTP 서버를 열지 못했습니다.

비벡터 SQL 스크립트 14개가 통과했습니다. 독립된 두 PostgreSQL 연결에서 등록한 논문 두 편의 ID, 방향 있는 연결, 같은 이름의 PDF 판본과 SHA-256, 원문 메모, 연결된 하이라이트의 좌표, 2쪽 읽기 위치와 캡처 이미지를 대조했습니다. 012에서 남은 필터 복구와 기존 저장 요청 재전송도 확인했습니다. Chromium으로 실행하는 7개 검사와 좌우 PNG 비교는 시작 단계에서 멈췄고, 배포본에서 둘째 브라우저를 새로고침해 3쪽이 복원되는지, 실제 Supabase Storage가 같은 원본 바이트를 내려주는지는 미검증입니다.

## Ubuntu에서 재현

저장소 루트에서 Node 22 이상과 프로젝트 의존성을 사용합니다. 아래의 API 예시는 합성 공개 설정입니다. 테스트에 실제 OpenAI 키는 필요하지 않습니다.

```bash
npm ci
python3 -m venv /tmp/rt-parser-env
source /tmp/rt-parser-env/bin/activate
python -m pip install PyYAML jsonschema
python scripts/check_next_action_parser.py --offline
PYTHONPATH=src python -B -m unittest discover -s tests

env -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY npm run build
node scripts/check-web-output.mjs
SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build
node scripts/check-web-output.mjs
```

두 번째 빌드는 아래의 로그인 브라우저 검사가 사용합니다. 출력 검사는 Git에서 추적하는 공개 소스와 빌드의 파일명·바이트를 대조합니다. 전체 JS 회귀와 별도로 현재 제품의 핵심 경로를 빠르게 재현할 수 있습니다.

```bash
node --test --test-isolation=none tests/web_single_workspace_entry.test.cjs tests/web_active_project.test.cjs tests/web_product_mount.test.cjs tests/web_product_project_menu.test.cjs
node --test --test-isolation=none tests/web_paper_edit_controls.test.cjs tests/web_shared_paper_controls.test.cjs tests/web_product_{reader,recovery,captures}.test.cjs tests/{workspace_edit_receipts,product_workspace_store,product_workspace_atomic_edge}.test.mjs
node --test --test-isolation=none tests/web_product_{chat,summary}.test.cjs tests/{web_product_chat_edge,unified_reader_ask_edge,account_rag_index_edge,product_memo_summary_edge}.test.mjs
mapfile -t modules < <(find tests -maxdepth 1 -name '*.test.mjs' ! -name 'built_*' | sort)
node --test --test-isolation=none "${modules[@]}" tests/web_*.test.cjs

npx --no-install playwright-core install --with-deps chromium
env -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY npm run build
node --test --test-isolation=none tests/built_{pdf,save_status}.test.cjs
SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build
node --test --test-isolation=none tests/built_product_workspace.test.cjs tests/built_product_chat_edge.test.mjs
node scripts/compare-product-markup.mjs /tmp/rt-product-markup.md
node scripts/compare-product-workspace.mjs /tmp/rt-product-visual
```

`built_product_workspace`는 배포용 루트에서 모의 Google 로그인을 거쳐 두 독립 브라우저 세션에서 프로젝트·논문 두 편·PDF 판본·링크·메모·하이라이트·쪽을 비교합니다. `built_product_chat_edge`는 원래 질문 탭의 요청을 실제 Edge 핸들러에 전달하고, 모의 데이터베이스와 임베딩·답변 응답을 사용해 인용 이동을 검사합니다. 시각 비교 명령은 편집 전 커밋 `0d9d5340bec110e24ac0eb26d6b42082dad2b109`과 현재 계정 빌드에서 화면별 PNG 쌍, 컨트롤 좌표, 비교 HTML을 만듭니다.

PostgreSQL 16 패키지를 제공하는 Ubuntu 환경에서 일반 사용자로 실행합니다. SQL 러너가 임시 클러스터를 만들며 동시성 검사에서만 로컬 리스너를 엽니다.

```bash
sudo apt-get update
sudo apt-get install postgresql-16 postgresql-client-16 postgresql-16-pgvector
export PATH="/usr/lib/postgresql/16/bin:$PATH"
pg_config --version
test -r "$(pg_config --sharedir)/extension/vector.control" &&
  test -x "$(pg_config --pkglibdir)/pgxs/src/test/isolation/isolationtester" &&
  python3 -B tests/run_account_db.py --concurrent
```

실제 Auth·Storage·Edge·DB 경로는 다음과 같이 **폐기할 로컬 Docker 스택**에서 검사합니다. 이 명령은 새 프로젝트 ID와 포트를 사용합니다. 로컬 스크립트가 CLI에서 루프백 주소와 게시용 키를 확인하고 합성 계정을 만들어 두 브라우저에 로그인합니다. 제공자 호출 경로는 차단합니다. 앞에서 만든 계정 정적 빌드와 Chromium이 필요합니다.

```bash
(
  set -eu
  repo=$(git rev-parse --show-toplevel)
  cli="$repo/node_modules/.bin/supabase"
  stack=$(mktemp -d /tmp/rt-product-stack.XXXXXXXX)
  tar -cf - supabase/config.toml supabase/migrations/*.sql supabase/functions/{researchtrail,_rag}/*.mjs | tar -C "$stack" -xf -
  touch "$stack/supabase/seed.sql"
  sed -i -E -e "s/^project_id = .*/project_id = \"rt-product-${stack##*.}\"/" \
    -e 's/5432([0-9])/5532\1/g' -e 's/^inspector_port = 8083$/inspector_port = 18083/' "$stack/supabase/config.toml"
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
  public_key=$("$cli" status -o json 2>/dev/null | node -e "process.stdout.write(JSON.parse(require('node:fs').readFileSync(0)).PUBLISHABLE_KEY)")
  for attempt in $(seq 1 90); do
    if curl --noproxy '*' --silent --max-time 2 -H "apikey: $public_key" http://127.0.0.1:55321/functions/v1/researchtrail/tasks | rg -q RESOURCE_UNAVAILABLE; then break; fi
    if [ "$attempt" -eq 90 ]; then exit 1; fi
    sleep 1
  done
  node "$repo/tests/local_account_pdfs.mjs" --reader
  node "$repo/tests/local_product_workspace_release.mjs"
)
```

## Preview와 기존 사용자 호환성

1. Preview용 Supabase 프로젝트의 마이그레이션 이력을 확인합니다. 011까지 적용한 기존 프로젝트는 `20261127001200_product_workspace.sql`, `20261127001300_workspace_reader_and_atomic_edits.sql` 순서로 올립니다. 012까지 적용했다면 013부터 적용합니다. 신규 프로젝트는 `supabase/migrations/`의 001부터 013까지 타임스탬프 순서로 적용합니다. 008에는 `extensions` 스키마의 pgvector와 1,536차원 벡터가 필요합니다.
2. 갱신된 `researchtrail` 함수와 형제 `_rag/` 모듈을 함께 배포합니다. 함수에만 `OPENAI_API_KEY`를 설정합니다. 답변 모델은 `OPENAI_MODEL`이며 기본값은 `gpt-6-luna`입니다. 새 색인의 `RAG_EMBEDDING_MODEL` 기본값은 `text-embedding-3-small`입니다. 기존 색인은 기록된 임베딩 모델과 호환되어야 합니다. 예전 질문 호출에서 검색 범위를 생략하면 기존 연결 논문 계약을 유지합니다.
3. 해당 Preview 프로젝트의 `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`로 정적 빌드를 만듭니다. Google OAuth는 Supabase Auth의 콜백 URL을, Supabase의 허용 리디렉션은 실제 사이트 루트를 사용합니다. Preview에서 기존 계정 레코드와 판본을 확인한 후 Production 전환을 결정합니다.

이 순서로 기존 과업·판본·원본 파일·원문 메모의 ID와 연결을 유지하며 새 클라이언트가 사용하는 RPC를 먼저 준비합니다. 브라우저에 저장된 자료를 이관하는 작업은 없습니다. PR의 실제 변경 파일은 커밋된 기능 브랜치에서 `git diff --name-status origin/main...HEAD`로 확인합니다.

## 이번 변경 커밋

저장소 루트의 Bash에서 실행합니다. 기준은 `feature/server-backed-workspace-ui` 브랜치의 `8a67e8d`입니다.

```bash
git add -- README.md docs/product_workspace_{baseline,parity}.md docs/research/product_workspace_paired_markup.md
git add -- scripts/{build-web,capture-product-reference,check-web-output,compare-product-markup,compare-product-workspace}.mjs
git add -- supabase/functions/researchtrail/workspace.mjs supabase/migrations/20261127001300_workspace_reader_and_atomic_edits.sql
git add -- web/index.html web/views/{account,site-root}.html
git add -- web/js/{account,account-chat,account-graph,capture,core,find,frame,import,landing,main,panel,pdf-viewer,product-reader,projects,reader,workspace-store}.js
git add -- tests/{built_product_chat_edge.test,local_product_workspace_release,product_workspace_atomic_edge.test,web_product_chat_edge.test,workspace_edit_receipts.test}.mjs
git add -- tests/{built_product_workspace,web_paper_edit_controls,web_product_captures,web_product_mount,web_product_reader,web_single_workspace_entry}.test.cjs
git add -- tests/fixtures/{product-chat-edge,product-persistence-journey,product-visual}.mjs tests/run_account_db.py tests/sql/product_workspace_client_{read,write}.sql
git diff --cached --stat
git diff --cached --check && git commit -m "Finish account persistence in the shared research workspace"
```
