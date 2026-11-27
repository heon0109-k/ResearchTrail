# ResearchTrail.

> 논문 읽기를 멈췄다가 다시 돌아왔을 때, 왜 이 논문을 남겼고 다음에 무엇을 하려 했는지 바로 이어 가게 돕는 기록 도구

| 항목 | 내용 |
|---|---|
| 팀 | 4팀 · 글벗 |
| 서비스 | ResearchTrail |
| 대상 사용자 | 과제·프로젝트·스터디·연구를 위해 논문을 읽고 기록하며, 중단한 읽기와 탐색을 다시 이어가려는 학생 |
| 리뷰 기간 | 2026-11-11 ~ 2026-11-18 |

**2026-11-16 업데이트** · 질문하기에 **단일 PDF RAG(실험)**를 추가했습니다. 열어 둔 PDF 전체에서 질문과 관련된 구절을 찾아 답하고, 확인된 근거는 쪽 링크로 보여 줍니다([6절](#6-ai-기능-실험)).

**문의 및 피드백** · `rudfla312@ajou.ac.kr`

---

## 사용자 가이드

### 1. 서비스 소개

**해결하려는 문제**

일부 학생은 논문 읽기를 중단했다가 돌아왔을 때, 자료를 남긴 이유나 어디까지 진행했는지, 다음에 무엇을 하려 했는지를 확인하려고 대화·메모·회의록을 다시 살펴봅니다. 이 과정에서 실제 검토나 작성에 늦게 착수하는 경우가 있습니다.

**이번 MVP에서 할 수 있는 것**

| 기능 | 설명 |
|---|---|
| 타임라인에 논문 쌓기 | 읽은 논문을 날짜순으로 쌓고, 논문마다 **저장 이유**를 남깁니다. |
| 읽기 기록 | 하이라이트·영역 캡처 아래 메모를 남기거나 **+ 메모 추가**로 메모만 기록합니다. 현재 입력은 자동 저장되고 편집을 마치면 이전 원문과 새 버전을 기록 이력에 보관합니다. |
| 기록 이력 | 요청 당시 원문 메모, 최초 후보, 확인한 최종 내용을 펼쳐 볼 수 있습니다. 후보를 수정하거나 취소해도 생성 이력이 남습니다. |
| 다음 작업 후보 | 메모에서 다음 할 일 한 건을 찾아 후보로 보여 줍니다. 고치거나 취소할 수 있고, **확인해야만 저장**됩니다. |
| 논문 목록 | 제목·읽기 상태·다음 할 일을 세로 목록으로 확인합니다. 최근 열람순으로 표시하며, 제목 검색과 태그 선택을 함께 사용할 수 있습니다. 제목을 누르면 읽기 화면이 열립니다. |
| 등록한 논문 찾기 | **내용 찾기**에서 제목을 검색하면 메모가 없는 논문도 찾습니다. 결과는 **논문**과 **읽기 기록**으로 나뉘며, 선택한 태그가 있으면 그 범위에서 찾습니다. |
| 이어 읽기 | 마지막으로 읽기 화면을 연 논문을 기억하고, 다시 열면 그 논문과 멈춘 쪽·저장한 다음 할 일을 보여줍니다. |
| AI 정리 (실험) | 서버에 OpenAI 키를 설정하고 켜면, 메모를 남길 때마다 OpenAI가 그 논문의 메모를 모아 다음 할 일 한 가지를 제안합니다. 고쳐서 저장할 수 있고, 저장은 사용자가 정합니다. ([6절](#6-ai-기능-실험)) |
| 질문하기 (실험) | 같은 키로 열어 둔 PDF 한 편의 관련 구절을 검색해 질문하고, 답에 붙은 쪽 번호로 원문을 확인합니다. 논문과 관계없는 질문에는 답하지 않습니다. |

**하지 않는 것:** 외부 논문 검색·추천, 메모 속 행동(메일·알림 등)을 대신 실행하는 기능, 논문과 관계없는 질문 답변은 이번 버전에 없습니다.

> ⚠️ **AI는 기본으로 꺼져 있습니다.** 끈 상태에서 **다음 할 일 찾기**는 규칙으로 만든 **예시 응답**이며 화면에 "규칙 기반"으로 표시되고, 메모는 외부로 전송되지 않습니다. 서버에 OpenAI 키를 설정하고 동의한 뒤 켰을 때만 메모와 본문 일부가 OpenAI로 전송됩니다. AI 기능은 실험 단계입니다([6절](#6-ai-기능-실험)).

---

### 2. 실행 방법

**배포 안내** · ResearchTrail은 곧 웹으로 배포할 예정입니다. 배포 전에는 아래 안내에 따라 터미널에서 실행하고, 사용하면서 좋았던 점이나 불편했던 점을 알려 주세요.

화면 실행에는 별도 Python 라이브러리가 필요하지 않습니다. 아래 명령에는 Git과 Python 3가 필요합니다.

```bash
git clone https://github.com/heon0109-k/ResearchTrail.git ResearchTrail-mvp &&
cd ResearchTrail-mvp &&
python3 -m http.server 5500 --bind 127.0.0.1 --directory web
```

브라우저에서 **http://127.0.0.1:5500/** 을 엽니다. AI 기능도 사용하려면 [6절](#6-ai-기능-실험)의 로컬 서버를 실행합니다.

- `ResearchTrail-mvp` 폴더가 이미 있다면 복제 명령과 `cd`에서 같은 새 폴더 이름을 사용하세요.
- 5500번에서 서버가 이미 실행 중이면 그 터미널에서 `Ctrl+C`로 종료한 뒤 다시 실행하세요. 서버를 실행한 폴더에 `web/index.html`이 있어야 합니다.
- 지원 환경: 데스크톱 Chrome 최신 버전 (모바일 화면은 확인하지 않았습니다)
- 계정: 가입 없이 바로 사용합니다.
- VS Code를 쓴다면 Live Server 확장으로 `web/index.html`을 열어도 됩니다.
- 메모와 다음 할 일의 저장·재개는 오프라인에서도 동작합니다. 예시 PDF 7편과 PDF.js 3.11.174 뷰어는 앱에 포함되어 있습니다. OpenAI AI 정리와 질문하기, 외부 글꼴·논문 정보 조회에는 인터넷이 필요합니다.

#### 정적 빌드

Node.js 22 이상과 npm으로 저장소 루트에서 실행합니다.

```bash
npm ci
npm run build
python3 -m http.server 5500 --bind 127.0.0.1 --directory dist
```

`SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`를 모두 비워 두면 기존 브라우저 데모를 사용할 수 있습니다. 두 변수를 설정하면 빌드가 공개 프로젝트 URL과 게시용 키만 `dist/js/browser-config.js`에 기록하고 시작 화면에 **Google로 로그인**을 표시합니다. 로그인 후에는 현재 사이트의 루트로 돌아오며 새로고침해도 계정을 유지합니다. 새 기기에서 로그인하면 공유 타임라인이 계정에서 마지막으로 선택한 프로젝트를 엽니다. 이미 열어 둔 탭을 새로고침하면 그 탭의 프로젝트를 유지합니다. 선택한 프로젝트가 삭제되었거나 접근할 수 없으면 계정 목록의 첫 프로젝트가 열립니다. 프로젝트가 없으면 **새 프로젝트**로 첫 과업을 만드세요. 사이드바 옆 상단의 **프로젝트 이름**을 눌러 과업을 바꾸고 **+ 논문 추가**로 등록합니다. **이 브라우저에 저장한 작업 열기**에서 기기 안의 기존 논문과 메모를 열고 **계정 타임라인으로**를 눌러 돌아옵니다. 기기 자료는 로그인해도 자동으로 업로드되지 않습니다. **로그아웃**하면 이 브라우저의 작업공간으로 돌아갑니다.

Google 로그인을 사용할 때는 Supabase Auth에서 Google 제공자를 설정하고, Google에 Supabase의 OAuth 콜백 URL을 등록합니다. Supabase의 허용 리디렉션 URL에는 앱을 여는 주소의 루트(예: `http://127.0.0.1:5500/`)를 등록합니다. 로컬 Supabase를 쓰는 경우 `supabase/config.toml`의 `[auth.external.google]`에 지정된 환경변수를 서버에 설정하고 해당 제공자를 활성화합니다. 모의 세션 검사는 `node tests/web_account_auth.test.cjs`로 실행합니다.

`npm run test:build`로 빌드 결과와 공개 설정을 검사합니다. 빌드 후 `npx playwright-core install chromium`으로 테스트용 브라우저를 준비한 뒤 `npm run test:pdf`를 실행하면 예시 논문이 읽기 화면에 렌더링되는지 확인할 수 있습니다.

계정 프로젝트의 로컬 실행에는 Docker와 로컬 Supabase가 필요합니다. 저장소 루트에서 `npx supabase start`, `npx supabase migration up --local`을 실행한 뒤 `npx supabase functions serve`을 실행합니다. 브라우저 빌드에는 같은 로컬 프로젝트의 공개 설정을 사용합니다.

프로젝트 이름은 과업 목표(`ResearchTask.goal_text`)로 저장합니다. 논문 제목은 `Document`에, 저장 이유와 읽은 정도는 선택한 과업의 `DocumentUse`에 저장합니다. 링크와 업로드한 PDF는 각각 `DocumentArtifact`로 등록합니다. 같은 논문을 다른 과업에서 사용할 때는 등록 양식에서 기존 논문을 선택할 수 있습니다. 브라우저 전용 작업과 예시 데이터는 해당 작업공간에 보관합니다.

#### Vercel Preview 설정

저장소 루트의 `vercel.json`에 정적 빌드 설정이 있습니다. 기존 Vercel 프로젝트에서 아래 값을 확인하세요.

| 대시보드 항목 | 값 |
|---|---|
| Framework Preset | Other |
| Root Directory | 저장소 루트 (기본값 `./`) |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Production Branch / Preview 브랜치 | `main` / `feature/unified-workspace-qa` |
| Preview 환경변수 `SUPABASE_URL` | 테스트용 Supabase 프로젝트의 공개 HTTPS Project URL |
| Preview 환경변수 `SUPABASE_PUBLISHABLE_KEY` | 같은 프로젝트의 Publishable key (`sb_publishable_`로 시작) |

두 변수는 **Preview** 범위에 입력하세요. 브라우저 전용 데모를 시험할 때는 둘 다 비워 둡니다. 새 Vercel 프로젝트의 최초 배포는 Production으로 처리되므로 Preview만 준비하는 단계에서는 새 프로젝트의 **Deploy**를 누르기 전에 멈춥니다. [Vercel 빌드 설정](https://vercel.com/docs/builds/configure-a-build) · [배포 환경](https://vercel.com/docs/deployments/environments)

`npm run build` 후 `node scripts/check-web-output.mjs`로 현재 `dist/`의 파일 목록, 원본과의 바이트 일치 여부, 공개 설정 두 항목을 검사합니다. `node --test tests/web_vercel_preview.test.cjs`는 합성 설정과 공개 목록 밖의 파일을 넣어 이 과정을 재현합니다. 웹 파일을 추가할 때는 `scripts/build-web.mjs`의 공개 파일 목록에도 등록하세요.

계정 기능에는 마이그레이션과 `researchtrail` 함수가 준비된 테스트용 Supabase 프로젝트가 필요합니다. Preview 주소가 정해지면 Supabase Auth의 **URL Configuration → Redirect URLs**에 해당 HTTPS 루트(마지막 `/` 포함)를 등록하세요. Google 로그인 후 같은 루트로 돌아오는지, 새로고침하면 같은 계정이 열리는지 확인하세요. 테스트용 PDF에 메모와 하이라이트를 남긴 뒤 두 번째 브라우저에서 같은 판본과 읽던 쪽을 다시 여세요. Preview에 접근할 수 있는 브라우저에서 `/assets/papers/bert-naacl2019.pdf`는 200, `/package.json`과 `/supabase/config.toml`은 404인지 확인하세요.

로그인 후에도 같은 사이드바, 태그, 기간 선택, 그래프, 목록, 오른쪽 논문 상세 패널과 PDF 읽기 화면을 사용합니다. 상단 저장 상태에서 실패한 프로젝트와 항목을 확인하고 해당 작업만 다시 저장할 수 있습니다. 프로젝트 이름 변경과 삭제는 프로젝트 메뉴의 **더보기**에 있습니다.

계정 타임라인과 목록은 `GET /tasks/{task_id}/papers?view=workspace`를 사용합니다. 등록한 논문의 PDF에 메모를 추가해도 논문 카드는 하나로 유지됩니다. 기존 `/papers`는 기록별 문헌 사용 맥락을 포함한 전체 목록을 반환합니다. 011까지의 배포와 로컬 검증 이력은 [통합 작업공간 릴리스 검증](docs/unified_workspace_release.md)에 있습니다.

원래 화면별 저장 항목, 기기에 남는 조작과 재현 명령은 [로그인 작업공간 대조표](docs/product_workspace_parity.md)에 있습니다.

#### 기존 계정 프로젝트의 배포 순서

1. 배포할 Supabase 프로젝트의 적용 이력을 확인하고 `supabase/migrations/`의 누락된 파일을 타임스탬프 순서로 적용합니다. 기존 통합 작업공간(011)까지 적용한 프로젝트에는 `20261127001200_product_workspace.sql`이 필요합니다. 처음 설치할 때는 001부터 012까지 적용합니다. 색인 마이그레이션 008은 `extensions` 스키마의 pgvector를 사용합니다.
2. `supabase/functions/researchtrail/index.mjs`를 진입점으로 하는 **researchtrail** 함수를 새 버전으로 배포합니다. 같은 디렉터리의 `workspace.mjs`, `bytes.mjs`, `memo-summary.mjs`, PDF 처리 모듈과 형제 디렉터리 `_rag/`도 함께 포함합니다. 기존 로그인 확인과 서버의 임베딩 모델 설정을 유지합니다.
3. 새 함수가 준비되면 사이트 루트에서 `npm ci`, `npm run build`로 생성한 `dist`를 배포합니다. 공개 빌드 설정은 해당 프로젝트의 `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`입니다. `OPENAI_API_KEY`는 함수의 서버 비밀값에만 둡니다.

기존 과업·논문·메모·판본·PDF 파일과 색인은 같은 ID를 유지합니다. 과업 이름을 바꾸면 이전 메모도 그 과업에 계속 속합니다. 논문 상세에서 바꾼 제목과 저장 이유는 현재 과업의 해당 논문에만 적용됩니다. 프로젝트나 논문 삭제는 작업공간에서 항목을 숨기며, 이력에 연결된 원문 메모와 파일은 보존합니다. 기존 PDF 질문 API는 검색 범위를 생략한 호출의 연결 논문 계약을 유지합니다. 기기 안에 있던 자료는 기존 브라우저 주소에서 다시 열 수 있습니다.

`GET /tasks?view=workspace`는 접근 가능한 프로젝트별 논문 수를, `GET /tasks/{task_id}/workspace`는 태그와 과업·논문·판본별 부가 데이터 및 버전을 반환합니다. 같은 경로로 보내는 `PATCH`는 저장 요청 ID와 버전을 검사합니다. 동시에 바뀐 데이터에 이전 버전으로 저장하면 HTTP 409가 돌아옵니다. 같은 요청의 재전송은 처음 저장한 버전의 응답을 돌려줍니다. 작업공간 변경 요청 하나의 JSON 크기 한도는 10 MiB입니다.

#### 계정 논문의 비공개 PDF

**+ 논문 추가**에서 PDF(한 개당 최대 10 MiB)를 선택하거나, 이미 등록한 논문에서 **PDF 첨부**를 누릅니다. DOI만 등록해도 원문 링크와 읽기 기록을 사용할 수 있습니다. 같은 계정으로 다른 기기에서 프로젝트를 열고 파일명 옆 **열기**를 누르면 업로드했던 판본을 읽을 수 있습니다.

파일명만 등록했던 판본에는 **이 파일명에 PDF 첨부**를 사용하세요. 기존 판본 ID와 해당 판본을 가리키는 기록이 유지됩니다. 이름이 같은 여러 PDF를 올리면 **열기** 버튼에 파일별 해시 앞 8자리가 함께 표시됩니다.

`POST /tasks/{task_id}/papers/{document_use_id}/pdf`는 PDF 바이트와 URL 인코딩한 파일명(`X-PDF-Name`)을 받습니다. 서버가 파일명, MIME, 파일 형식 표시와 실제 크기를 검사하고, 비공개 Storage 버킷 `researchtrail-pdfs`에 저장합니다. 판본에 보관된 고정 경로와 SHA-256을 사용해 `GET /tasks/{task_id}/artifacts/{artifact_id}/pdf`에서 본인 파일을 확인합니다. 전송이 끊기면 같은 논문에 같은 파일을 다시 첨부하세요. 재시도는 기존 판본을 사용하며 메모를 추가하지 않습니다.

로컬 마이그레이션을 적용하고 함수를 실행한 뒤 `node tests/local_account_pdfs.mjs`로 실제 Storage 연결을 검사할 수 있습니다. 이 검사는 로컬 공개 설정을 사용하고 합성 계정 두 개와 테스트 과업을 만듭니다.

#### 계정 PDF의 읽기 위치와 하이라이트

PDF에서 구절을 선택하고 **선택한 구절에 형광펜**을 누릅니다. 저장된 메모를 연결하려면 **하이라이트에 연결할 메모**에서 고르세요. 이미 만든 하이라이트에도 목록에서 **선택한 메모 연결**을 누를 수 있습니다. 메모를 정정해도 기존 하이라이트는 처음 연결한 버전을 가리킵니다.

같은 계정과 프로젝트에서 같은 PDF 판본을 다시 열면 마지막으로 읽은 쪽을 표시합니다. 형광펜은 각 쪽의 너비와 높이에 대한 비율로 저장되어 화면이 좁아져도 같은 구절에 표시됩니다. PDF를 불러오지 못했을 때도 저장된 쪽 번호, 선택한 구절, 연결한 메모를 확인할 수 있습니다. 파일이 목록에서 이용 불가로 표시되면 **저장된 읽기 위치 보기**를 누르세요.

로컬 계정 두 개로 읽기 위치와 메모 연결까지 검사하려면 마이그레이션 적용 후 `node tests/local_account_pdfs.mjs --reader`를 실행합니다.

#### 계정 PDF 질문하기

계정 타임라인이나 논문 목록에서 판본을 열고 **질문하기**를 누르면 해당 판본의 색인 상태를 확인합니다. 처음 준비할 때는 전송 안내를 읽고 **동의하고 색인 준비**를 누르세요. PDF에서 추출한 본문을 구절로 나누어 임베딩 서비스에 보내고 계정에 색인을 저장합니다. 같은 판본의 색인이 준비되어 있으면 질문 전송에 동의한 뒤 바로 재사용합니다. 질문에 붙은 쪽 번호를 누르면 같은 판본의 원문으로 이동합니다.

계정에 저장한 대화와 답변 깊이는 같은 PDF 판본을 다시 열면 복원됩니다. 전송 동의는 리더를 열 때마다 확인합니다. 같은 리더에서 **색인 다시 시도**를 누르면 마지막으로 저장이 확인된 묶음 다음부터 재개합니다. 리더를 닫아 중단된 색인은 다시 열어 **색인 상태 다시 확인**으로 완료 여부를 확인할 수 있고, 필요한 경우 처음부터 다시 만들 수 있습니다.

#### 계정 PDF 질문 API

통합 리더용 요청은 `POST /functions/v1/researchtrail/tasks/{task_id}/artifacts/{artifact_id}/ask`에 로그인한 사용자의 Bearer 토큰과 프로젝트 게시용 키를 보냅니다. URL의 판본에 완료된 색인이 있어야 합니다. 아래 예시는 그 판본의 두 표를 비교합니다.

```json
{"question":"표 1과 표 2의 결과를 비교해 주세요.","consent":true,"scope":"open_pdf","answer_depth":"auto","current_page":3}
```

`scope: "open_pdf"`는 URL의 판본 한 건만 검색합니다. 응답의 `searched`에는 해당 판본 한 건이 담기고 `excluded`는 빈 배열입니다. 이 경로에서 논문 제목은 `null`이므로 리더는 열어 둔 논문의 제목을 표시할 수 있습니다. 기존 호출은 `scope`를 생략하거나 `"linked_papers"`를 지정하면 열린 판본과 연결 논문 최대 8편을 검색합니다.

| 답변 깊이 | `answer_depth` | 답변 모델에 보내는 `reasoning.effort` |
|---|---|---|
| 자동 | `auto` | 한국어·영어 질문마다 수치·약어 등 단순 조회는 `none`, 일반 설명은 `low`, 비교·종합은 `medium` |
| 빠르게 | `none` | `none` |
| 보통 | `low` | `low` |
| 꼼꼼하게 | `medium` | `medium` |

깊이를 생략하면 이전 호출과 같이 `none`입니다. 지원하지 않는 범위나 깊이는 외부 요청 전에 `400 INVALID_INPUT`으로 처리합니다. 질문마다 `consent: true`가 필요합니다. 선택적으로 `current_page`, `selection: {"text":"…","page":3}`, `history`를 보낼 수 있습니다. 리더에서 대화를 전달할 때는 현재 탭의 같은 계정·과업·판본에 해당하는 기록만 보내세요. `open_pdf`에서는 선택한 문장이 검색 구절에서 확인될 때 모델 입력에 인용하며, 답변의 근거도 실제 전송한 구절과 쪽 번호로 검증합니다.

Supabase의 **Edge Function Secrets**에는 `OPENAI_API_KEY`를 설정합니다. `OPENAI_MODEL`의 기본값은 `gpt-6-luna`이고, 새 색인용 `RAG_EMBEDDING_MODEL`의 기본값은 `text-embedding-3-small`입니다. 기존 색인에 대한 질문은 그 색인에 기록된 모델과 1,536차원을 사용합니다. 답변 모델이나 깊이만 바꾸면 기존 색인을 그대로 쓸 수 있습니다. Vercel 정적 빌드의 공개 설정은 `SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY` 두 항목입니다.

#### 계정 기록 저장 API

`researchtrail` 함수의 `POST /tasks/{task_id}/records`는 [SPEC §5.2](docs/SPEC.md#52-기록-저장과-선택적-맥락)의 본문을 받습니다. 최소 본문은 `{"record":{"content_text":"  합성 메모  "}}`입니다. 호출자는 저장 동작마다 새 UUID를 `Idempotency-Key` 헤더에 넣습니다. 기존 계정 API처럼 본문의 `request_id`로 보내도 됩니다. 같은 저장을 재전송할 때는 본문과 UUID를 유지합니다. 같은 문장을 새 메모로 저장할 때는 새 UUID를 사용합니다.

성공 응답은 `record_id`와 `context_refs`입니다. `context_refs`의 `question_ids`, `decision_ids`, `document_ids`, `document_use_ids`, `artifact_ids`, `excerpt_ids`는 이 기록에 연결된 ID 목록이며 빈 목록은 `[]`입니다. 정정은 새 UUID와 같은 과업의 `revises_record_id`로 저장합니다. 잘못된 연결이 있으면 원문과 맥락 모두 저장되지 않습니다. 브라우저 전용 작업공간의 메모는 계속 이 브라우저에 저장됩니다.

논문 리더의 메모는 열어 둔 PDF 판본에 연결됩니다. 상단 프로젝트 이름을 누른 뒤 **프로젝트 기록**을 열면 과업 전체 또는 특정 논문을 선택할 수 있습니다. 입력칸에서 논문 선택기로 이동할 때는 연결을 고르고 **편집 완료**를 누르세요. 다른 곳으로 이동해 편집을 마칠 때도 해당 버전을 전송합니다. 메모 응답을 기다리는 동안에도 이어 쓸 수 있습니다. **메모 저장 다시 시도**는 미확인 메모를 같은 요청으로 다시 보내고, **PDF 업로드 다시 시도**는 열어 둔 탭에서 해당 파일만 다시 올립니다. **이제 닫아도 돼요.**는 이 탭의 해당 계정에서 요청한 저장을 모두 확인하고 작성 중인 변경이 없을 때 표시됩니다. 다른 프로젝트에 미확인 저장이 있으면 상태 메시지에 표시된 프로젝트로 돌아가 해당 항목을 다시 저장하세요. 이 탭은 계정과 과업별로 초안과 미확인 저장 요청을 보관합니다. 저장된 메모의 **수정**은 원문을 보존하는 정정 기록을 만들며, **+ 새 메모**는 독립된 기록을 시작합니다.

#### 계정 다음 작업 확인

저장된 메모에서 **다음 할 일 찾기 →**를 누르면 브라우저가 해당 원문 한 건에서 규칙 기반 후보를 찾습니다. **다음 작업 직접 입력**으로도 시작할 수 있습니다. 과업과 원문을 확인하고 최종 행동을 편집한 뒤 **확인하고 저장**을 눌러야 계정에 저장됩니다. 취소하면 원문과 기존 확정 작업이 그대로 남습니다.

`POST /tasks/{task_id}/next-actions`에 `source_record_id`, `reviewed_action`, `confirmed: true`를 전송합니다. 선택한 항목만 `links`에 넣습니다. 브라우저는 오프라인에서 받은 최초 후보를 선택적 `original_candidate`에 별도로 보냅니다. 직접 입력은 최초 후보가 `null`입니다. 저장 결과가 불확실하면 같은 탭에서 해당 기록을 열고 **같은 요청 다시 확인**을 누르세요. 같은 확인의 본문과 UUID(`request_id` 또는 `Idempotency-Key`)를 재사용합니다.

#### 계정 과업 재개 조회

프로젝트를 열거나 페이지를 새로고침하면 해당 과업을 다시 조회합니다. 다른 브라우저에서 저장한 내용도 이때 확인할 수 있습니다. `GET /tasks/{task_id}/resume`은 로그인한 계정에서 선택한 과업의 `task_id`, `task`, `records`, `context`, `next_actions`를 반환합니다. 각 기록의 원문은 `record.content_text`에 있고 정정 대상은 `revises_record_id`로 구분합니다. `context`에는 `questions`, `decisions`, `document_contexts` 목록이 있습니다. 각 문헌 사용 맥락의 `artifacts`와 그 안의 `excerpts`에서 저장된 판본·위치·구절을 확인할 수 있습니다. 재개 조회는 원문 사이트나 AI를 호출하지 않습니다.

`next_actions`에는 사용자가 명시적으로 확인한 작업의 `source_record_id`, `saved_action`, 선택한 `links`가 들어갑니다. 확정 작업을 펼치면 원문과 최초 후보, 사용자가 확인한 값을 볼 수 있습니다. 최초 후보가 보존되기 전의 작업은 미기록으로 표시합니다. 저장 시각이 최신인 항목부터 반환하고, 시각이 같으면 ID 오름차순입니다. 미기록 속성은 `null`, 등록된 항목이 없는 목록은 `[]`로 반환합니다. 접근 권한이 없는 과업과 존재하지 않는 과업은 모두 `404 RESOURCE_UNAVAILABLE`로 응답합니다.

---

### 3. 핵심 기능 체험 순서

**가정할 역할:** 다음 주 AI 스터디에서 RAG 논문을 발표해야 하는 컴퓨터공학 3학년. 오늘 논문을 읽다가 다른 과제 때문에 멈춥니다.

**체험 목표:** 메모에서 다음 할 일을 뽑아 확인·저장하고, 다시 열었을 때 어디서부터 이어 가면 되는지 바로 보이는지 확인합니다.

표의 **관련 AC**는 [SPEC 6.1절 수용 기준](docs/SPEC.md#61-판정-원칙)의 AC1~AC7 번호입니다. 각 AC의 현재 구현·검증 범위는 SPEC의 AC별 "현재 상태"를 따릅니다.

시나리오 1~3은 **AI를 끈 상태** 기준입니다. AI를 켜면 메모마다 있는 **다음 할 일 찾기** 대신 OpenAI가 **다음에 할 일** 칸에 제안을 띄웁니다([6절](#6-ai-기능-실험)).

#### 시나리오 1. 논문 등록 → 메모 → 다음 할 일 확정 (약 3분)

| 단계 | 할 일 | 입력 예시 | 관련 AC |
|---|---|---|---|
| 1 | 첫 화면에서 **시작하기** 클릭 | 사용법 안내가 나오면 끝까지 넘기거나 닫습니다. | — |
| 2 | 왼쪽 **+ 논문 추가** 클릭 | 논문 제목: `Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks`<br>읽은 정도: `읽는 중`<br>저장 이유: `발표에서 baseline 비교 근거로 쓰려고` | AC6 |
| 3 | **타임라인에 추가** 클릭 | 타임라인에 카드가 생깁니다. | AC6 |
| 4 | 카드 클릭 → 오른쪽 패널에서 **이어 읽기** 클릭 | 읽기 화면이 열립니다. | AC5 |
| 5 | 오른쪽 **읽기 기록 → + 메모 추가** 후 카드의 메모에 입력 | `RAG 논문 표 2 성능 비교는 봤는데 retriever 설정이 왜 다른지 모르겠음. 금요일까지 부록에서 retriever 설정 확인하기` | AC6 |
| 6 | 해당 메모 카드의 **다음 할 일 찾기 →** 한 번 클릭 | 그 카드의 메모에서 바로 제안을 찾습니다. 규칙 기반 예시 기능이며 메모는 외부로 전송되지 않습니다. | AC1, AC3 |
| 7 | 후보 확인 → **다음 할 일로 저장** | **다음에 할 일** 박스에 표시된 **확정 전 초안**을 고쳐서 저장해도 됩니다. 취소하면 기존 할 일이 다시 보입니다. | AC4 |

하이라이트·캡처·메모만 남긴 기록 중 한 건의 메모를 후보 입력으로 사용합니다. 다른 기록이나 논문 원문은 합치지 않습니다. 기존 전체 메모는 같은 목록의 **논문 메모** 카드로 표시됩니다.

메모를 수정하거나 후보를 고쳐 저장한 뒤 읽기 화면의 **기록 이력**을 펼치면 이전 원문, 최초 후보, 저장한 최종 내용을 확인할 수 있습니다.

#### 시나리오 2. 다시 열기 (약 1분)

| 단계 | 할 일 | 관련 AC |
|---|---|---|
| 1 | 읽기 화면에서 새로고침해 같은 논문, 메모, 저장한 다음 할 일이 유지되는지 확인합니다. | AC4, AC5 |
| 2 | 같은 브라우저의 새 탭에서 [ResearchTrail](http://127.0.0.1:5500/)을 엽니다. | AC5 |
| 3 | 타임라인의 **다시 오셨네요** 안내에서 마지막으로 열람한 논문과 저장한 **다음 할 일**을 확인합니다. 후보를 고쳐 저장했다면 수정한 최종 내용이 표시됩니다. | AC5, AC6 |
| 4 | 안내의 **이어 읽기**를 한 번 눌러 읽기 화면을 엽니다. **기록 이력**을 펼쳐 원문 메모·최초 후보·확인한 최종값을 확인합니다. | AC4, AC5 |

> 저장된 기록 없이 화면부터 보고 싶다면 첫 화면의 **예시 먼저 보기 →** 를 누르세요. 예시 타임라인이 열립니다. 논문을 열면 포함된 PDF 7편을 바로 읽을 수 있고, Attention·RAG 논문 2편은 원문 링크로 연결됩니다. 논문별 출처·라이선스는 읽기 화면의 **예시 논문 출처·이용 조건**과 [전체 출처 목록](web/assets/papers/credits.html)에 있습니다. 예시 기록은 팀이 작성한 체험용 데이터입니다.

**태그로 보기:** 왼쪽 태그를 누르면 해당 논문과 그 논문끼리의 연결만 표시됩니다. 같은 태그를 다시 누르거나 **전체**를 누르면 전체로 돌아옵니다. **태그 구분 없이 보기**를 켜면 태그별 줄을 합치고, 끄면 태그별로 나눕니다.

**다 읽은 뒤:** 읽기 화면의 **다 읽었어요**를 누르면 완료한 논문은 이어 읽기 대상에서 제외합니다. 다른 **읽는 중** 논문을 먼저 안내하고, 없으면 **읽을 것** 논문을 **읽기 시작**으로 안내합니다. 같은 상태에서는 최근 열람 순서, 열람 이력이 없으면 등록한 읽은 날짜순으로 고릅니다. 모두 다 읽었다면 이어 읽기 안내를 숨깁니다. 메모와 저장된 할 일은 삭제하지 않습니다.

#### 시나리오 3. 예외 상황 (선택)

읽기 화면에서 기록 한 건의 메모 내용을 바꾸고 그 카드를 선택한 뒤 **다음 할 일 찾기 →**를 눌러 봅니다.

| 입력 / 동작 | 확인할 것 | 관련 AC |
|---|---|---|
| `지난번 하던 거 이어갈래` | 다음 할 일을 정하지 않고 "분명하게 찾지 못했어요"라고 안내합니다. 메모와 기존 다음 할 일은 그대로입니다. | AC2 |
| `내일 교수님께 메일 보내줘` | 메일을 보내지 않습니다. 기록할 행동을 찾지 못했다고 안내합니다. | AC7 |
| `표 2는 다 비교했음` | 이미 끝낸 일이라 다음 할 일로 올리지 않습니다. | AC3 |
| `표 2 확인하기. 부록 비교하기.` | 할 일이 둘인데 무엇부터 할지 고르지 않았으므로 임의로 고르지 않고 다시 묻습니다. | AC2 |
| `표 2 확인하기. 부록 비교는 먼저 하기.` | "먼저"로 고른 `부록 비교는 먼저 하기`만 후보가 됩니다. | AC2, AC3 |
| 후보에서 **취소** | 메모와 생성한 후보 이력은 유지되고, 기존 다음 할 일은 바뀌지 않습니다. | AC4 |
| 다음 할 일을 직접 적기 | 제안 기능을 쓰지 않고 기존 **다음에 할 일** 칸에 직접 입력할 수 있습니다. | AC7 |
| 주소 뒤에 `?aifail=1`을 붙여 접속 | 후보 생성 실패를 흉내 냅니다. 메모는 남고 **다시 시도**와 직접 입력을 안내합니다. | AC7 |
| 메모를 비우고 후보 만들기 | 메모를 먼저 적으라고 안내합니다. | AC2 |

---

### 4. 기대 결과 및 확인 방법

**정상 실행 시**

- 시나리오 1의 6단계 후보는 **`금요일까지 부록에서 retriever 설정 확인하기`** 입니다. 이미 끝낸 "표 2 성능 비교"는 후보가 되면 안 됩니다.
- **다음에 할 일** 박스에서 제안 내용을 확인하고 고칠 수 있습니다. **다음 할 일로 저장**을 누르면 최종 내용이 **다음에 할 일** 칸에 표시됩니다.
- **취소**하면 기존 다음 할 일이 다시 보입니다. **다음에 할 일** 칸에 직접 입력할 수도 있습니다.

**최종 확인 방법**

- 새로고침하거나 브라우저를 닫았다 열어도 논문, 저장 이유, 메모, 다음 할 일이 남아 있으면 저장된 것입니다.
- 다시 열었을 때 **다시 오셨네요** 안내와 읽기 화면에 같은 최종 작업이 표시되는지 확인합니다.
- 읽기 화면의 **기록 이력**에서 원문 메모·최초 후보·확인한 최종값을 각각 확인할 수 있습니다.

**다른 입력으로 다시 해 보기**

- 같은 논문의 메모를 바꾸고 다시 **다음 할 일 찾기 →**를 눌러 보세요.
- **+ 논문 추가**로 본인이 최근 읽은 논문을 등록하고 직접 쓴 메모로 해 보세요.
- 브라우저의 사이트 데이터를 삭제하면 저장 기록도 사라질 수 있습니다.

---

### 5. 제한 및 알려진 문제

| 구분 | 내용 |
|---|---|
| 모의 처리 | AI를 끈 상태의 다음 작업 후보는 규칙 기반 **예시 응답**입니다(`web/js/ai-stub.js`). OpenAI 제안은 AI를 켰을 때만 동작하며 한계는 [6절](#6-ai-기능-실험)에 있습니다. 진행 상태·막힌 점·기한의 분리 추출은 아직 화면에 연결되지 않았습니다. 규칙이 알아듣지 못하는 완료·선택 표현이 있으면 후보가 틀리거나 다시 묻습니다. 그때는 **다음에 할 일** 칸에 직접 적어 주세요. |
| 저장 실패 | 저장하지 못하면 경고가 표시됩니다. 새로고침하기 전에 메모를 복사해 두세요. 후보 확인 저장이 실패하면 기존 작업과 후보 입력이 유지되며 **다시 저장**할 수 있습니다. |
| PDF 저장 실패 | PDF 파일 저장에 실패하면 안내하며 기존 첨부와 메모를 유지합니다. 새 논문 등록 중 실패하면 입력 내용을 유지하므로 다시 추가할 수 있습니다. |
| 코드·데이터셋 | PDF를 첨부하면 링크 후보를 자동으로 찾습니다. 원하는 후보를 저장하거나 **+ 직접 추가**로 링크를 등록할 수 있습니다. 예시에 포함된 PDF는 읽기 화면에서 **PDF에서 링크 찾기**로 확인할 수 있습니다. 탐색에는 인터넷 연결이 필요하며, PDF에서 인용한 다른 프로젝트의 링크도 후보에 포함될 수 있습니다. |
| 링크 형식 | http·https 링크, arXiv 식별자, DOI를 지원합니다. 실행형 주소 등은 저장·열기를 차단하며, 이전 기록의 잘못된 링크는 수정 안내를 표시합니다. |
| 다음 할 일 표시 | 읽기 화면·이어 읽기·재개 안내는 같은 논문의 다음 할 일을 사용합니다. 이전 전체 타임라인 메모는 해당 논문에 자동 연결하지 않고 ‘이전 전체 메모 · 논문 연결 미확인’으로 구분합니다. |
| 미기록 맥락 | 읽던 쪽이나 저장·연결 이유가 없으면 ‘미기록/확인 필요’로 표시합니다. 전체 타임라인 메모는 특정 논문의 판단으로 간주하지 않고 ‘논문 연결 미확인’으로 구분합니다. |
| 읽기 상태 | 읽을 것·읽는 중·다 읽음을 선택할 수 있습니다. 상태가 없거나 이전 상태를 해석할 수 없으면 ‘미기록/확인 필요’로 표시하며, 기존 값을 임의로 읽을 것으로 바꾸지 않습니다. |
| 이전 기록 | 열람 순서가 없는 이전 기록은 읽은 날짜가 최근인 ‘읽는 중’ 논문을 우선 표시합니다. 논문 읽기 화면을 열면 이후에는 실제 열람 순서를 기억합니다. |
| 저장 위치 | 브라우저 전용 작업은 **이 브라우저의 이 주소**에 저장됩니다. 계정 프로젝트에 등록한 논문과 서버가 저장을 확인한 메모는 같은 계정으로 다시 열 수 있습니다. |
| 메모 이력 | 현재 메모 입력칸과 별도로 버전을 누적합니다. 편집을 마치거나 후보를 요청하면 버전을 보관하며, 키 입력 하나하나를 별도 버전으로 쌓지는 않습니다. |
| 이전 데이터 | 이력 기능 적용 전 이미 덮어쓴 내용은 복구할 수 없습니다. 현재 남아 있는 메모·다음 할 일부터 보관하며, 알 수 없는 최초 후보는 미기록으로 표시합니다. |
| 미구현 | 팀 공유, 외부 논문 검색·추천, 외부 노트 동기화 |
| 하이라이트 메모·질문 복사 | 문장·영역 캡처 아래 메모 한 칸을 사용합니다. 카드 오른쪽 위 작은 복사 아이콘(**AI에게 물어볼 질문 복사**)은 논문 제목·쪽수·선택한 내용·현재 메모를 질문 텍스트로 복사합니다. AI에 직접 전송하지 않으며, 캡처 이미지는 챗봇에 함께 첨부해야 합니다. 기존 분류·막힌 이유·질문 데이터는 삭제하지 않습니다. |
| 시연용 부가 기능 | PDF 읽기·캡처·연결 그래프·내용 찾기는 화면에서 쓸 수 있지만 이번 MVP의 검증 대상은 아닙니다. |
| 데이터 | 개인 정보나 비공개 연구 내용은 입력하지 마세요. |


### 6. AI 기능 (실험)

로그인한 작업공간의 **질문하기**는 현재 PDF 판본에서 근거를 찾습니다. 처음 색인을 만들 때는 PDF에서 추출한 텍스트를 나누어 임베딩 서비스로 보낸다는 안내를 읽고 동의합니다. **AI 정리**의 전송 동의는 별도입니다. 프로젝트에서 **동의하고 켜기**를 누르면 인증된 서버가 선택한 논문 제목과 저장 이유, 해당 판본에 저장한 메모와 연결 구절, 확인된 다음 작업을 사용해 정리합니다. 이전에 규칙 기반 정리만 켰던 프로젝트는 **OpenAI 전송 설정**에서 동의할 때까지 규칙 기반으로 동작합니다. 끄면 프로젝트의 정리 전송 동의가 해제됩니다. 정리 결과와 답변은 계정에 저장됩니다. 제안한 작업을 확정하려면 사용자가 직접 확인합니다. 서버의 답변 모델은 `OPENAI_MODEL`로 지정하며 기본값은 `gpt-6-luna`입니다.

**브라우저 전용 개발 서버에서 켜는 법**

1. ResearchTrail 폴더에서 아래 명령으로 설정 예시를 복사합니다. 이미 `.env`가 있으면 그 파일을 사용합니다.

   ```bash
   cp -n .env.example .env
   ```

2. 프로젝트 루트의 `.env`에서 `OPENAI_API_KEY=` 뒤에 키를 입력합니다. 키는 서버가 읽습니다. `OPENAI_MODEL`에는 해당 API 프로젝트에서 사용할 모델 ID를 지정합니다.
3. 같은 폴더에서 `python3 scripts/serve_openai.py`를 실행하고 **http://127.0.0.1:5500/** 을 엽니다. 5500번을 이미 사용 중이면 `--port 5501`로 실행해 **http://127.0.0.1:5501/** 을 엽니다. 파일에 키를 저장하지 않은 경우에는 터미널에서 키를 입력할 수 있습니다.
4. 논문의 **기록 → AI 정리** 또는 **질문하기**에서 전송할 내용을 확인하고 동의합니다. 질문 입력창 옆의 **답변 깊이**에서 자동·빠르게·보통·꼼꼼하게를 선택할 수 있습니다.

이 서버는 실행한 컴퓨터에서만 접속할 수 있습니다. API 사용량은 서버에 설정한 키의 계정으로 청구됩니다.

**써 보기**

| 기능 | 할 일 | 확인할 것 | 관련 AC |
|---|---|---|---|
| AI 정리 | 메모를 남기고 칸 밖을 누릅니다. 예: `7쪽 3.4절의 Empowerment와 Directness가 어떻게 다른지 잘 모르겠음.` | 몇 초 뒤 **다음에 할 일** 칸에 ✦ 표시와 함께 제안이 뜹니다. 문장을 고쳐 **저장**한 뒤 **← 타임라인**을 누르면, 위쪽 **이어 읽기** 줄(또는 **다시 오셨네요** 안내)에 그 문장이 보입니다. **AI 정리 보기**에서 제안의 근거가 된 메모를 확인할 수 있습니다. | AC1, AC4 |
| 질문하기 | **질문하기** 탭에서 `TS와 SS 실험 조건은 각각 어떤 문맥을 사용해?`를 보냅니다. | 열어 둔 PDF 전체에서 관련 구절을 찾아 답합니다. `7쪽`·`p.7`처럼 쪽을 지정하면 우선 참고합니다. 답변의 인용문이 보낸 원문과 일치하면 쪽 링크가 표시되며, 누르면 원문으로 이동합니다. 근거를 확인하지 못하면 그 한계를 안내합니다. | 실험 기능 · MVP 평가 AC 제외 |

**OpenAI로 보내는 것** (AI를 켰을 때만)

- AI 정리: 이 논문의 제목, 저장 이유, 메모와 하이라이트한 문장, 지금 저장된 다음 할 일(참고용)
- 질문하기: 한국어가 포함된 질문은 먼저 질문 한 건과 현재 PDF에서 뽑은 영문 어휘 목록(최대 1,800개·1만 4천 자)을 OpenAI로 보내 영어 검색어를 만듭니다. 이 목록에는 문장·쪽 번호가 없으며, 원래 검색어와 영어 확장어를 함께 사용해 PDF 한 편에서 구절을 찾습니다. 이후 논문 제목, 원래 질문, 선택한 문장, 검색 구절(최대 6개·합계 1만 자), 현재 쪽 번호, 최근 대화 6개를 기존 답변 요청에 보냅니다. 텍스트 추출·검색은 브라우저에서 수행하고 색인은 메모리에만 둡니다. 키는 로컬 서버에서만 사용하며, 동의 후 검색어 확장과 답변 요청을 같은 서버로 보냅니다.

한국어 질문은 정상 흐름에서 검색어 확장 1회와 답변 1회로 총 2회 요청합니다. 확장은 재시도 없이 최대 8초로 제한하며, 실패하면 원래 질문으로 검색했다고 안내합니다. 기존 답변 재시도가 발생하면 총 요청은 최대 3회가 됩니다. 영어로만 묻는 질문은 확장 요청을 하지 않습니다.

**끄는 법:** AI 정리의 **설정 → 끄기**를 누르면 전송이 멈추고, 이 브라우저의 전송 동의가 해제됩니다. 서버에 입력한 키는 서버를 종료할 때까지 사용됩니다. 메모마다 **다음 할 일 찾기** 버튼이 다시 보입니다.

**알려진 한계**

| 구분 | 내용 |
|---|---|
| 응답 시간 | 응답 시간은 네트워크와 OpenAI 상태에 따라 달라집니다. OpenAI가 혼잡하면 자동으로 한 번 다시 시도하고, 그래도 실패하면 오류 문구가 뜹니다. **다시 정리**를 누르거나 직접 적어 주세요. |
| OpenAI 제안 품질 | 메모에 적은 우선순위("먼저", "다음엔")가 충돌하면 가장 최근 메모를 따르도록 했습니다. OpenAI 제안의 품질은 아직 Evals로 평가하지 않았습니다. 규칙 기반 기능(`stub`)은 첫 Evals에서 20건 중 18건을 통과했습니다([PR #12](https://github.com/heon0109-k/ResearchTrail/pull/12)). 기존 할 일과 같은 뜻의 제안은 저장 버튼 없이 숨깁니다. |
| 브라우저 전용 개발 서버의 질문 범위 | 현재 열어 둔 PDF 한 편만 검색합니다. 한국어 질문은 OpenAI가 만든 영어 용어로도 검색합니다. 특히 영문 원문의 기술 용어를 한국어로 풀어 물으면 번역이나 검색어가 부정확해 근거를 놓칠 수 있습니다. 임베딩 기반 의미 검색과 이미지 PDF OCR은 지원하지 않습니다. 검색된 일부 구절에 근거가 없다는 안내는 논문 전체에 답이 없다는 뜻이 아닙니다. 인용 일치 검사도 답변 의미의 정확성을 보증하지 않습니다. |
| 키 보관 | 키는 서버 환경변수 또는 로컬 .env에 보관합니다. 브라우저에는 전송 동의와 켜짐 상태만 저장합니다. API 사용량은 서버 키 계정에 청구됩니다. |

단일 PDF 검색은 사용자 요청에 따른 로컬 실험이며, SPEC 4.2절의 범위 변경과 추가 검증 기준은 [변경안](docs/spikes/single_pdf_rag.md)과 [한국어 검색어 확장](docs/spikes/rag_query_expansion.md)으로 분리했습니다. 제품 명세의 팀 승인과 실제 OpenAI 의미 평가는 별도입니다.

**다음 계획:** OpenAI 제안 평가 기준을 정해 Evals로 측정합니다.


---

## 문서와 검증

**중간평가 산출물 위치**

| 평가 기준 | 파일 | 실행 명령 |
|---|---|---|
| 핵심 기능 구현 | `web/` (브라우저 앱), `src/researchtrail/` (다음 작업 정책) · AC 목록은 [SPEC 6절](docs/SPEC.md#6-수용-기준과-검증) | 위 [실행 방법](#2-실행-방법) |
| 실행 방법 문서 | 이 README 2·3절 (시나리오별 입력 예·기대 결과·관련 AC) | — |
| 골든 케이스 | [`tests/harness/golden_cases.yaml`](tests/harness/golden_cases.yaml) · 14건, 케이스마다 AC와 범주(normal 2·boundary 5·forbidden 7) | — |
| 테스트 하니스 | [`tests/test_policy_golden.py`](tests/test_policy_golden.py) · skip·xfail 없음 | `PYTHONPATH=src python3 -m unittest discover -s tests -p test_policy_golden.py -v` |
| 결함 주입 기록 | [`docs/prompts/delegation_policy.md`](docs/prompts/delegation_policy.md) · 검사 코드 [`evals/check_policy_mutations.py`](evals/check_policy_mutations.py) | `python3 -B evals/check_policy_mutations.py` |
| Evals 설계 | [`evals/EVAL_DESIGN.md`](evals/EVAL_DESIGN.md) | — |
| Evals 데이터셋 | [`evals/evalset.jsonl`](evals/evalset.jsonl) · 20건, 6개 범주 | — |
| Evals 러너·결과 | [`evals/run_evals.py`](evals/run_evals.py) → `evals/results/<실행 ID>.json`, `evals/results/history.csv` | `python3 evals/run_evals.py --check --target stub` / `--run --target stub --change "…"` |

- [Evals 설계·팀 검토 항목](evals/EVAL_DESIGN.md): 규칙 기반 후보 평가의 입력 20건, 합격선, 승인과 실행 절차는 설계서에서 확인합니다. 질문하기 실험은 이 평가 범위에서 제외합니다.
- [문제 정의·사용자 검증 계획 초안](docs/PROBLEM.md)
- [기능 명세와 AC](docs/SPEC.md)
- [인터뷰 프로토콜·기록·Job Story](docs/research/interview.md) · 실제 파일 위치: `docs/research/interview.md`
- [추가 설문 분석](docs/research/interview.md#additional-survey)
- [AI 귀속 검증 계획 초안](docs/spikes/next_action_attribution.md)

검사 명령 (Python 검사에는 `pip install pyyaml jsonschema` 필요):

```bash
python3 scripts/check_next_action_parser.py --offline
PYTHONPATH=src python3 -m unittest discover -s tests -p test_next_action_contract.py -v
PYTHONPATH=src python3 -m unittest discover -s tests -p test_state_contract.py -v
PYTHONPATH=src python3 -m unittest discover -s tests -p test_policy_golden.py -v
node tests/web_add_date.test.cjs
node tests/web_ai_stub.test.cjs
node tests/web_candidate_context.test.cjs
node tests/web_return_visit.test.cjs
node tests/web_resume_bubble_click.test.cjs
node tests/web_storage_failure.test.cjs
node tests/web_last_read.test.cjs
node tests/web_long_candidate.test.cjs
node tests/web_todo_consistency.test.cjs
node tests/web_record_history.test.cjs
node tests/web_timeline_visibility.test.cjs
node tests/web_unknown_state.test.cjs
node tests/web_missing_context.test.cjs
node tests/web_review_boundaries.test.cjs
node tests/web_sample_pdfs.test.cjs
node tests/web_paper_resources.test.cjs
node tests/web_highlight_stuck.test.cjs
node tests/web_highlight_simple.test.cjs
node tests/web_reading_records.test.cjs
node tests/web_resume_priority.test.cjs
node tests/web_tag_filter.test.cjs
node tests/web_link_persistence.test.cjs
node tests/web_ai_summary.test.cjs
node tests/web_openai_transport.test.cjs
python3 -B -m unittest discover -s tests -p test_openai_server.py -v
node tests/web_candidate_draft.test.cjs
node tests/web_candidate_rerun_recovery.test.cjs
node tests/web_character_target.test.cjs
node tests/web_chat_guard.test.cjs
node tests/web_chat_query_expansion.test.cjs
node tests/web_chat_retrieval.test.cjs
node tests/web_landing_reload.test.cjs
node tests/web_month_label_overlap.test.cjs
node tests/web_overview_headers.test.cjs
node tests/web_overview_pan.test.cjs
node tests/web_overview_zoom.test.cjs
node tests/web_paper_list.test.cjs
node tests/web_persistent_candidate.test.cjs
node tests/web_rag_config.test.cjs
node tests/web_reload_screen.test.cjs
node tests/web_reload_view.test.cjs
node tests/web_single_click_action.test.cjs
node tests/web_storage_conflict.test.cjs
node tests/web_tag_delete.test.cjs
node tests/web_timeline_controls.test.cjs
node tests/web_timeline_routes.test.cjs
node tests/web_title_search.test.cjs
node tests/web_visible_month.test.cjs
python3 -B evals/check_policy_mutations.py
```

숫자 기준과 새 의미 사례는 실행 전 팀 검토가 필요한 계획값입니다. 오프라인 검사 통과는 실제 모델 의미 정확도·사용자 효과·제품 완성을 뜻하지 않습니다.
