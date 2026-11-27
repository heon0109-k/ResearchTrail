# ‘이 브라우저에만 저장’ 화면의 변경 전 기준

기준 커밋은 `0d9d5340bec110e24ac0eb26d6b42082dad2b109`이다. 편집 전에 보관한 이 커밋의 `web/` 사본에서 브라우저 로컬 모드의 원래 렌더 함수를 실행했다. 논문 두 편 ‘합성 논문 A’와 ‘합성 논문 B’, 태그 한 개, 방향 있는 연결 ‘합성 연결’ 한 건을 사용했다. A에는 ‘합성 저장 이유’와 ‘합성 다음 작업’이 있다.

**자료 형식은 DOM 및 소스 스냅샷이다.** JSON은 다섯 화면에서 원래 함수가 각 요소의 `innerHTML`에 대입한 문자열을 그대로 담고 있다. 공통 레이아웃과 기본 버튼은 기준 커밋의 HTML 템플릿에서 확인했다. 페이지가 두 장인 PDF.js 문서 대역으로 리더 도구 막대를 생성했다. 브라우저가 계산하는 최종 배치, 글꼴, 실제 PDF 페이지 그림, 클릭 후 동작은 픽셀 캡처나 브라우저 테스트에서 별도로 확인해야 한다. [화면별 원본 마크업](research/product_workspace_baseline_dom.json)

| 화면 | 진입과 표시 영역 | 원래 컨트롤에서 확인할 문구와 구조 |
| --- | --- | --- |
| 타임라인 | 사이드바 `#vCard`를 누르면 `renderAll`이 `renderCards`와 `renderMinimap`을 호출한다. `.work .viewport #scroller > #canvas`에 카드와 연결선을 두고 아래 `#fcard`에 날짜 이동 도구를 둔다. | ‘타임라인’, ‘+ 논문 추가’, ‘이유 보기’, ‘1주’, ‘1달’, ‘전체’. A 카드 `.card[data-id="ref-a"]`의 접근 가능한 이름은 ‘합성 논문 A · 읽는 중 · 2026-10-01 · 이어 읽을 논문’이다. `g.lk[data-id="ref-link"]`에 ‘합성 연결’이 있다. |
| 연결 그래프 | `#vDot`에서 `renderDots`를 실행한다. `#dotwrap > svg#dotsvg` 안의 `g#vp`에 연결과 두 논문을 그린다. | ‘연결 그래프’, ‘그래프 보는 법’, ‘배치 다시 계산’. 두 `g.dn[role="button"]`의 이름은 논문 제목이다. `g.de[data-id="ref-link"] text.dlab`은 ‘합성 연결’을 표시한다. |
| 논문 목록 | `#vList`에서 `renderPaperList`가 `#paperList`를 구성하고 `renderPaperListRows`가 상태 버튼과 표 본문을 채운다. 제목 버튼 `[data-list-paper]`가 해당 논문의 리더를 연다. | ‘논문 제목 검색’, ‘논문 정렬’, ‘최근에 연 순’, ‘오래전에 연 순’, ‘최근 추가한 순’, ‘제목순’. 표의 열은 ‘논문 제목’, ‘읽기 상태’, ‘다음 할 일’이다. 상태 버튼에는 ‘전체 2’, ‘읽는 중 1’, ‘읽을 것 1’, ‘다 읽음 0’이 표시됐다. |
| 논문 상세 | 타임라인 카드 또는 그래프 논문을 선택하면 `onPick → select → renderPanel`을 거쳐 `.work > aside#panel > #pin`에 상세 내용이 들어간다. | `#pEdit`의 접근 가능한 이름은 ‘논문 수정’, `#pState`는 ‘읽은 정도’, `#pRead`의 문구는 ‘이어 읽기’다. ‘코드·데이터셋 추가’와 ‘이동 경로 추가’ 버튼, B로 향하는 연결이 있다. |
| PDF 리더 | 상세의 `#pRead` 또는 목록의 논문 제목에서 `openReader → renderReader`로 들어간다. 상단 `.rdbar` 아래에 `#rdsrc`, 너비 조절기 `#rdResize`, 오른쪽 `aside#rdnotes`가 있다. | 상단 ‘← 타임라인’, ‘PDF 다운로드’. 원문의 `#pvPrev`, `#pvNext`, `#pvCap`은 ‘이전 쪽’, ‘다음 쪽’, ‘영역 캡처’다. 오른쪽 `[data-rtab]`은 ‘기록’, ‘질문하기’이며 ‘+ 메모 추가’, ‘바로 메모’, ‘저장’, ‘변경 기록 보기’, ‘다 읽었어요’가 있다. 휴대폰 `[data-mtab]` 탭은 ‘PDF’, ‘기록’, ‘질문하기’다. |

## 원본 확인

아래 SHA-256은 보관한 사본과 Git 객체의 내용이 바이트 단위로 일치하는지 확인한 파일의 해시다. 줄 번호는 기준 커밋에 해당한다.

| 파일 | 확인할 위치 | SHA-256 |
| --- | --- | --- |
| `web/views/main.html` | 공통 사이드바와 작업 영역, 38·139·180·210행 | `e2f6a2479ed84c906a74dc97ed5cf412740f33967b2fe7b084c94867b4a7ce24` |
| `web/js/frame.js` | 화면 전환과 항목 선택, 80·132행 | `d4e9a50e17c2e8da082f33732bd5da4f4ef29becd825a71470b9f54c7dd346d3` |
| `web/js/timeline.js` | 카드와 미니맵, 168·435행 | `cef6839b2c79ddff6ac295dbc03cd9fc5dc7253fe0231ae770e22f68fbb63bdc` |
| `web/js/graph.js` | 연결 그래프, 12행 | `f95f55885aa9dd4037e773f9b7e306aa37002bfa5f02855308c8737968b138b8` |
| `web/js/paper-list.js` | 표 본문, 필터, 제목으로 리더 열기, 28·50·82행 | `de2f390b2bfa9414e916536bea8fee3cc4140d5bb58abce27e8a71c0616a343a` |
| `web/js/panel.js` | 상세 패널과 읽기 버튼, 227·346행 | `b3b2309894788055614cbee889bf6d991a9261aa9ab5afb5acf3353d90809f52` |
| `web/views/reader.html` | 리더 상단, 휴대폰 탭, PDF와 기록 패널 | `f839856cca23784d37121764059dd71e5ff93781c77a8e64fecd3e213a6f6991` |
| `web/js/reader.js` | 리더 진입, 본문 배치, 기록 패널, 49·105·256행 | `7c284f79fb08947ebde946a3c1929ad14d8ee3ff05e7568c681e79b504dd147b` |
| `web/js/pdf-viewer.js` | 원문의 페이지 이동, 확대, 캡처, 59행 | `7fa1cbb597457960a85df9aec60c6a484f1a0e1412be962b810ee33d43b3e116` |
| `web/js/records-compact.js` | `rcCompose`의 바로 메모 입력창 | `6cd639dcbbef4a80ae35cdcce32b7c8338df859ef232073e98608399c70a90aa` |

Git 작업 트리를 바꾸지 않고 기준 파일을 확인할 수 있다.

```bash
ref=0d9d5340bec110e24ac0eb26d6b42082dad2b109
git show "${ref}:web/js/paper-list.js" | sed -n '50,83p'
git show "${ref}:web/js/paper-list.js" | sha256sum
python - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('docs/research/product_workspace_baseline_dom.json').read_text())
for view, regions in data['captures'].items():
    print(view, ', '.join(regions))
PY
```

## 데스크톱·휴대폰의 로그인 전후 비교

같은 프로젝트, 날짜, 태그 두 개, 논문 두 편, 연결 이유, 합성 PDF 파일과 첫 쪽을 양쪽에 넣는다. 왼쪽은 위 기준 커밋의 **이 브라우저에만 저장**, 오른쪽은 현재 빌드에서 Google PKCE 콜백을 거쳐 연 **계정에 저장**이다. 별도 Chromium 컨텍스트를 쓰며 인증과 계정 API는 로컬 응답 대역으로 처리한다. 외부 글꼴 요청은 차단하고 같은 시스템 글꼴로 렌더한다. 그래프는 두 화면에서 같은 난수 시드로 배치를 시작해 움직임이 멈춘 뒤 촬영한다.

| 화면 | 1440 × 900 데스크톱 | 390 × 844 휴대폰 |
|---|---|---|
| 타임라인 | 사이드바, 가로 카드, 도구 막대 | 아래 탐색 탭, 날짜순 세로 카드 |
| 그래프 | 그래프 버튼을 눌러 연 노드와 연결 | 아래 그래프 탭과 노드 |
| 논문 목록 | 목록 버튼, 필터, 논문 행 | 아래 목록 탭, 필터, 같은 논문 행 |
| 상세 | 같은 타임라인 카드에서 연 패널, 읽은 정도, 읽기 버튼 | 같은 세로 카드를 터치해 연 상세 패널 |
| 리더 | 같은 PDF 첫 쪽, 쪽 조작, 기록과 질문 탭 | PDF 탭을 선택한 리더와 모바일 탭 |

소스 비교에서 원본 기본 화면의 요소 ID는 모두 유지됐고, 본문에 날짜 미기록 논문 영역 한 개가 추가됐다. 리더 템플릿, 데스크톱과 하단 탐색을 정의하는 CSS, 그래프·목록·상세·리더·PDF·읽기 기록·질문 CSS는 기준과 바이트 단위로 일치했다. 모바일 타임라인 함수도 같은 세로 카드 요소를 사용하며 계정에 저장된 원래 읽기 상태를 표시한다. 타임라인과 계정 CSS에는 변경이 있다. 실제 글자 폭, 패널 위치, 모바일 탭 가시성과 조작 범위는 아래 렌더 비교에서 확인한다.

Ubuntu에서 저장소 루트를 열고 실행한다.

```bash
npm ci
npx --no-install playwright-core install --with-deps chromium
unset CHROMIUM_EXECUTABLE_PATH
SUPABASE_URL=http://localhost SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture npm run build
node scripts/compare-product-workspace.mjs /tmp/rt-product-visual
xdg-open /tmp/rt-product-visual/index.html
```

결과는 화면별 좌우 원본 PNG 20개, 비교용 HTML, 공통 컨트롤의 레이블·가시성·프레임 내 좌표를 기록한 `geometry.json`이다. 비교용 HTML의 각 쌍 아래에는 가시성이나 레이블이 다르거나 경계가 2 CSS px보다 많이 이동한 컨트롤을 표시한다. 추가된 컨트롤과 그래프 선, PDF 내용 등은 나란히 표시된 이미지로 확인한다. 이 환경에서는 Chromium이 시작 중 Crashpad 소켓에서 거부되어 PNG·화면 좌표를 측정할 수 없었다. `node scripts/compare-product-workspace.mjs --source-only /tmp/rt-product-visual`의 소스 비교는 실행했다.

브라우저 없이 양쪽 렌더 함수를 실행한 [데스크톱·휴대폰의 화면별 컨트롤 및 문구 비교](research/product_workspace_paired_markup.md)도 있다. `node scripts/compare-product-markup.mjs`로 합성 계정 행 변환과 화면별 마크업 생성을 재현할 수 있다.
