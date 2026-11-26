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

`SUPABASE_URL`과 `SUPABASE_PUBLISHABLE_KEY`를 모두 비워 두면 기존 브라우저 데모를 사용할 수 있습니다. 두 변수를 설정하면 빌드가 공개 프로젝트 URL과 게시용 키만 `dist/js/browser-config.js`에 기록합니다. 설정은 빌드 시점에 적용됩니다. 로컬 Supabase 설정은 `supabase/config.toml`에 있으며 데모 실행에 Supabase 서버나 로그인이 필요하지 않습니다.

`npm run test:build`로 빌드 결과와 공개 설정을 검사합니다. 빌드 후 `npx playwright-core install chromium`으로 테스트용 브라우저를 준비한 뒤 `npm run test:pdf`를 실행하면 예시 논문이 읽기 화면에 렌더링되는지 확인할 수 있습니다.

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
| 저장 위치 | 기록은 **이 브라우저의 이 주소**에만 저장됩니다. 다른 브라우저, 다른 포트, 시크릿 창에서는 보이지 않습니다. 서버 저장은 없습니다. |
| 메모 이력 | 현재 메모 입력칸과 별도로 버전을 누적합니다. 편집을 마치거나 후보를 요청하면 버전을 보관하며, 키 입력 하나하나를 별도 버전으로 쌓지는 않습니다. |
| 이전 데이터 | 이력 기능 적용 전 이미 덮어쓴 내용은 복구할 수 없습니다. 현재 남아 있는 메모·다음 할 일부터 보관하며, 알 수 없는 최초 후보는 미기록으로 표시합니다. |
| 미구현 | 연구 기록의 서버 저장·조회 API, 계정, 팀 공유, 외부 논문 검색·추천, 외부 노트 동기화 |
| 하이라이트 메모·질문 복사 | 문장·영역 캡처 아래 메모 한 칸을 사용합니다. 카드 오른쪽 위 작은 복사 아이콘(**AI에게 물어볼 질문 복사**)은 논문 제목·쪽수·선택한 내용·현재 메모를 질문 텍스트로 복사합니다. AI에 직접 전송하지 않으며, 캡처 이미지는 챗봇에 함께 첨부해야 합니다. 기존 분류·막힌 이유·질문 데이터는 삭제하지 않습니다. |
| 시연용 부가 기능 | PDF 읽기·캡처·연결 그래프·내용 찾기는 화면에서 쓸 수 있지만 이번 MVP의 검증 대상은 아닙니다. |
| 데이터 | 개인 정보나 비공개 연구 내용은 입력하지 마세요. |


### 6. AI 기능 (실험)

AI 정리와 질문하기는 **실험 단계**입니다. 서버에 설정한 OpenAI 키를 함께 사용하며, 켜지 않으면 위 시나리오처럼 규칙 기반으로 동작합니다. 기본 모델은 `gpt-6-luna`입니다. 서버의 `OPENAI_MODEL`로 선택합니다.

**켜는 법**

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
| 질문 범위 | 현재 열어 둔 PDF 한 편만 검색합니다. 한국어 질문은 OpenAI가 만든 영어 용어로도 검색합니다. 특히 영문 원문의 기술 용어를 한국어로 풀어 물으면 번역이나 검색어가 부정확해 근거를 놓칠 수 있습니다. 임베딩 기반 의미 검색과 이미지 PDF OCR은 지원하지 않습니다. 검색된 일부 구절에 근거가 없다는 안내는 논문 전체에 답이 없다는 뜻이 아닙니다. 인용 일치 검사도 답변 의미의 정확성을 보증하지 않습니다. |
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
