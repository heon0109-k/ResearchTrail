# Google 로그인 후의 작업공간

계정 빌드에서 Google 로그인을 마치면 사이트 루트가 사용자 세션을 확인하고 `browser.html?workspace=account`를 엽니다. 이 문서는 브라우저 전용 모드와 같은 `views/main.html`, `views/reader.html`, `showMain()`를 사용합니다. 원래 사이드바·상단 도구·모바일 메뉴로 이동합니다. 프로젝트 목록이 비었으면 같은 화면의 **새 프로젝트**를 사용합니다.

| 원래 화면과 조작 | 로그인 후 저장하거나 여는 항목 |
|---|---|
| 프로젝트 이름, 프로젝트 메뉴 | 생성, 전환, 이름 변경, 보관, 마지막으로 직접 고른 계정 프로젝트. 열린 탭은 그 탭의 작업을 계속하고, 새 기기는 접근 가능한 마지막 선택을 사용합니다. |
| 타임라인과 태그 | 날짜가 있는 카드와 날짜 미기록 논문, 이어 읽기, 태그 이름·색·배정·삭제, 날짜와 읽기 상태, 기간·확대·태그 표시 설정 |
| 그래프 | 같은 과업 안에서 두 논문을 연결하고 방향·연결 이유를 확인합니다. 연결 편집·삭제, 노드 이동, 확대와 배치 설정이 프로젝트에 저장됩니다. |
| 논문 목록, 상세, 새 논문 | 목록 검색어·정렬·읽기 상태 필터, 논문 등록, 제목·저장 이유·메타데이터 수정, 외부 자료 링크와 채택·숨김, 비공개 PDF 첨부와 읽을 판본 선택. 이전 기록의 문헌 참조도 계속 읽습니다. |
| PDF와 기록 | 해당 판본의 비공개 PDF, 마지막 쪽, 문장 하이라이트 및 영역 캡처, 연결된 원문 메모와 정정 이력, 확정 전 작업 후보와 사용자가 확인한 다음 작업. 리더 배치·확대 설정도 복원합니다. |
| 프로젝트 기록 | 프로젝트 메뉴에서 논문과 연결하지 않은 메모도 작성하고 수정할 수 있습니다. 기존 계정 편집기에서 남은 미확인 요청은 원래 과업·판본·기록에서 다시 확인합니다. |
| 질문하기 | 별도 동의 후 선택한 판본을 색인화합니다. 질문·답변 깊이·확인된 인용·대화가 해당 판본에 속합니다. 인용을 누르면 원문 쪽으로 이동합니다. |
| AI 정리 | 메모 전송 동의, 정리 결과, 근거와 사용자 확인을 거친 다음 작업. 기존 규칙 기반 설정을 OpenAI 전송 동의로 해석하지 않습니다. |

## 기기에 남는 조작

계정 작업공간에서 **저장한 연구 내용**을 기기에만 보관하는 조작은 확인되지 않았습니다. 아래 항목은 기기나 열린 탭에 속합니다.

- **이 브라우저에 저장한 작업 열기**로 연 프로젝트, 논문·PDF, 메모, 그 작업공간의 표시 설정은 기존 브라우저 저장소를 사용합니다. 예시 작업도 계정 데이터와 분리됩니다. 로그인하거나 두 모드를 오가는 동작으로 기기 자료를 가져오지 않습니다.
- 계정 안에서 보고 있는 화면·열린 패널과 탭, 목록과 타임라인의 스크롤, 현재 선택과 찾기 입력, 아직 제출하지 않은 등록 폼·질문·빠른 메모, 선택한 PDF 영역과 미채택 자료 후보는 조작 중의 상태입니다. 복사와 다운로드는 해당 기기의 클립보드와 파일을 사용합니다.
- 이 탭에서 기기 작업공간을 열었다는 선택과 실패한 요청의 재시도 정보는 탭에 남습니다. 재시도 정보는 계정과 프로젝트별로 구분됩니다. 확인된 쓰기는 다른 기기에서도 다시 조회할 수 있습니다. 업로드 도중 새로고침하면 해당 논문에서 원래 PDF를 다시 선택해야 합니다.

## 확인 경로

- `tests/built_product_workspace.test.cjs`는 배포용 루트의 모의 인증 콜백에서 시작합니다. 두 브라우저 컨텍스트에서 프로젝트·논문 두 편·비공개 PDF·연결·메모·하이라이트·읽은 쪽을 대조하고 리더의 질문과 인용을 확인합니다.
- `tests/web_product_mount.test.cjs`, `tests/web_active_project.test.cjs`, `tests/web_product_project_menu.test.cjs`, `tests/web_shared_paper_controls.test.cjs`는 실제 시작 함수와 원래 컨트롤의 이벤트를 사용합니다. DOM 대역을 쓰는 검사는 화면 배치를 검증하지 않습니다.
- `tests/web_product_reader.test.cjs`, `tests/web_product_recovery.test.cjs`, `tests/product_workspace_store.test.mjs`는 지연 응답, 정정, 요청 범위, 재시도 번호와 저장 상태를 확인합니다.
- `tests/web_product_chat.test.cjs`, `tests/web_product_summary.test.cjs`, `tests/product_memo_summary_edge.test.mjs`, `tests/unified_reader_ask_edge.test.mjs`는 모의 제공자로 동의, 입력 범위, 근거, 깊이와 저장을 확인합니다.
- `tests/sql/product_workspace.sql`, `tests/sql/product_selection.sql`, `tests/sql/product_workspace_rag.sql`은 기존 영속성 검사에 과업별 편집, 보관, 다른 계정과의 격리, 과거 요청 재전송 및 검색 범위를 추가합니다. 전체 실행에는 PostgreSQL과 같은 메이저 버전용 pgvector가 필요합니다.

릴리스 순서는 마이그레이션 012, researchtrail 함수, 정적 사이트입니다. 기존 배포와 새 설치의 환경 설정은 [README](../README.md)에 있습니다.

## 브라우저와 데이터베이스에서 재현하기

다섯 화면에서 원래 렌더 함수가 생성한 마크업과 원본 해시는 [변경 전 화면 기준](product_workspace_baseline.md)에서 확인할 수 있습니다. 픽셀 캡처용 기준 화면은 편집 전 보관한 커밋 `0d9d5340bec110e24ac0eb26d6b42082dad2b109`에서 읽습니다. 캡처 스크립트는 격리된 브라우저 프로필에 합성 논문과 PDF를 넣고 원래 버튼을 눌러 다섯 화면을 PNG로 기록합니다. 아래의 Chromium 명령은 실제 브라우저를 실행할 수 있는 Ubuntu 터미널에서 사용합니다. Node 22 이상, Chromium 및 PostgreSQL 16용 pgvector가 필요합니다.

```bash
npm ci
export CHROMIUM_EXECUTABLE_PATH="$(command -v chromium)"
node scripts/capture-product-reference.mjs /tmp/researchtrail-ui-reference
SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build
RESEARCHTRAIL_CAPTURE_DIR=/tmp/researchtrail-ui-account node --test --test-isolation=none tests/built_product_workspace.test.cjs tests/built_pdf.test.cjs tests/built_save_status.test.cjs
python3 -B -m unittest discover -s tests
python3 -B tests/run_account_db.py --concurrent
```

이 환경의 Chromium은 Crashpad 시작 중 `setsockopt EPERM`에서 멈췄습니다. 이곳에서 두 기기의 렌더링과 PDF 스크린샷은 미검증입니다. Python의 모의 HTTP 서버 검사 6개도 로컬 소켓을 열 수 없었습니다. PostgreSQL 16에서 비벡터 SQL은 실행했고, 전체 데이터베이스 검사는 마이그레이션 008의 pgvector 설치 확인에서 멈췄습니다. 기존 JavaScript 검사 중 9개는 이전 계정 화면, 그 선택자 또는 이전 화면에 한정된 스크립트 목록으로 시작합니다. 해당 테스트의 단언은 그대로 두었습니다.

두 정적 빌드의 출력 검사는 브라우저 전용 88개 파일, 계정용 89개 파일에서 통과했습니다. 둘 다 번들 PDF 7개와 공개 설정 2개를 확인했습니다. 이 검사는 Git에 추적된 파일명과 빌드 결과를 비교하므로, 새 소스는 검증용 임시 Git 인덱스에 포함했습니다. 작업 브랜치의 실제 인덱스는 비워 두었습니다. 오프라인 파서 48개, JavaScript 모듈 검사 105개, 비벡터 SQL 스크립트 11개가 통과했습니다. 브라우저 대역을 포함한 전체 JavaScript 실행 결과는 282개 중 273개 통과, 9개 실패입니다.

## 작업 브랜치에서 커밋할 파일

아래 명령은 Bash에서 이 변경의 코드, 마이그레이션, 안내와 테스트만 선택합니다. 정적 출력과 로컬 실험 결과는 생성물입니다.

```bash
git add -- README.md docs/product_workspace_{baseline,parity}.md docs/research/product_workspace_baseline_dom.json
git add -- scripts/{build-web,capture-product-reference}.mjs
git add -- supabase/migrations/20261127001200_product_workspace.sql
git add -- supabase/functions/_rag/{answer,ask-route,generate}.mjs
git add -- supabase/functions/researchtrail/{bytes,handler,memo-summary,paper-pdf,workspace}.mjs
git add -- web/index.html web/styles/{account,timeline}.css web/views/{main,project-records}.html
git add -- web/js/{account,account-actions,account-chat,account-graph,account-memos,account-save-status,ai-summary}.js
git add -- web/js/{capture,chat,core,frame,graph,helpers,import,landing,main,next-action,panel,paper-list,pdf-viewer}.js
git add -- web/js/{product-reader,projects,reader,records-compact,screens,timeline-mobile,timeline,tour,workspace-recovery,workspace-store}.js
git add -- tests/{active_project_edge,product_memo_summary_edge,product_workspace_edge,product_workspace_store,unified_reader_ask_edge}.test.mjs
git add -- tests/{built_product_workspace,web_active_project,web_shared_paper_controls}.test.cjs
git add -- tests/web_product_{chat,mount,project_menu,reader,recovery,summary}.test.cjs
git add -- tests/fixtures/product-question-checks.cjs tests/run_account_db.py tests/sql/{product_selection,product_workspace,product_workspace_rag}.sql
git diff --cached --check
git diff --cached --stat
git commit -m "Use the product workspace for signed-in research projects"
```
