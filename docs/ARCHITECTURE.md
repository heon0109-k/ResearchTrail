# ARCHITECTURE.md: ResearchTrail

> 무엇을 만드는지는 `docs/SPEC.md`, 용어는 `docs/ontology.yaml`, 작업 규칙은 `AGENTS.md`에 있다. 이 문서는 그걸 어떻게 조립할지 적는다. 원본 문서와 내용이 다르면 원본을 따르고 이 문서를 고친다.
> 아직 정하지 않은 항목은 `(미정)`, 아직 저장소에 없는 파일은 `(미생성)`으로 표시했다.

## 1. 데이터 흐름

과업 선택 → 메모 저장(`ResearchRecord`) → 외부 처리 동의 → 다음 작업 파싱(LLM, 최대 2회) → 스키마·정책 검사 → 사용자 확인 → `NextAction` 저장 → 재개 조회(LLM 호출 없음)

- LLM은 파싱 단계에서만 쓴다. 나머지 순서는 코드가 정한다.
- 메모 저장과 작업 확정은 별개다. 파싱이 실패하거나 사용자가 취소해도 메모는 남는다. (SPEC 3절)

## 2. 구성 요소

| 파일 | 하는 일 | 출처 | 상태 |
|---|---|---|---|
| `src/researchtrail/prompts/parse_query.md` | 파서 프롬프트. 마커 사이 텍스트만 LLM에 보냄 | 강의 3 산출물 | 있음 |
| `src/researchtrail/schemas/next_action.schema.json` | `NextAction` 후보 네 필드 출력 스키마 | 강의 3 산출물 | 있음 |
| `scripts/check_next_action_parser.py` | 파서 실험 러너. 오프라인 48개 검사. 제품 코드 아님 | 강의 3 실험 | 있음 |
| `src/researchtrail/parser.py` (미생성) | 메모 한 건으로 LLM 호출, 형식 복구 1회, 시간 제한 | 강의 6 구현 대상 (SPEC 5.3, AC7) | 만들 예정 |
| `src/researchtrail/policy.py` | 스키마 검사 뒤 정책 검사, 후속 처리 코드 계산 | 강의 6 구현 대상 (SPEC 5.3, AC1) | 구조·원문 구절 검사 구현, 의미 판정은 미검증 |
| `src/researchtrail/store.py` (미생성) | 과업·기록·맥락·확정 작업 저장, 과업별 조회 | 강의 6 구현 대상 (SPEC 5.1~5.5, AC4~AC6) | 만들 예정 |
| API | SPEC 5.1절 경로 여섯 개 | SPEC 5.1 | 프레임워크 (미정) |
| 화면 | 메모 입력, 후보 확인, 재개 화면·기록 이력 | SPEC 3.1 | 브라우저 시연 구현. 서버 연동 미구현 |

`parser.py`, `policy.py`, `store.py`의 이름과 나누는 단위는 프레임워크가 정해지면 바뀔 수 있다. 러너의 검사 코드를 가져다 쓸지도 (미정).

## 3. 도구

### 3.1 LLM에 주는 도구: 없음

LLM에는 도구(function calling)를 주지 않는다. LLM이 받는 건 프롬프트, 스키마, 메모 한 건이고, 내놓는 건 `NextAction` 후보 JSON 하나다. (SPEC 5.3, AGENTS.md 5절)

이유:

- LLM이 다른 기록을 조회할 수 있으면 과업이 섞일 수 있다. (절대 규칙 5)
- LLM이 직접 저장하면 "사용자 확인 전에는 저장하지 않는다"를 LLM 판단에 맡기게 된다. (절대 규칙 2)
- 메일, 알림 같은 행동은 대신 하지 않으니 외부 도구도 필요 없다. (SPEC 4.2)

도구를 추가하게 되면 위 규칙과 부딪히지 않는지 보고 SPEC부터 바꾼다.

### 3.2 코드가 부르는 함수

LLM 도구는 아니지만 강의 6 원칙(읽기·쓰기 구분, 쓰기 전 사용자 확인)은 똑같이 적용한다. 타입은 온톨로지 클래스 이름을 쓴다.

| 함수 | 시그니처 | 하는 일 | 부작용 |
|---|---|---|---|
| `create_task` | `(goal_text, scope_text?, target_output_text?, progress_text?) -> ResearchTask` | 새 과업을 만든다 | 쓰기 |
| `save_record` | `(task_id, record: ResearchRecord, context?, revises_record_id?) -> record_id, context_refs` | 원문 메모와 사용자가 넣은 맥락을 저장한다. 하나라도 잘못되면 전체 저장 안 함 | 쓰기 |
| `parse_next_action` | `(task_id, record_id, external_processing_confirmed) -> candidate, next_action, attempt_count` | 메모 한 건에서 `NextAction` 후보를 뽑고 검사한다 | LLM 호출, 저장 없음 |
| `prepare_next_action_draft` | `(task_id, *, action_text, progress_text?, blocker_text?, deadline_text?) -> NextAction` 후보 | 확인 화면에 보여 줄 후보를 만든다 (SPEC 5.3) | 없음 |
| `confirm_next_action` | `(task_id, source_record_id, reviewed_action: NextAction, confirmed, links?) -> NextAction` | 사용자가 확인한 작업을 저장한다 | 쓰기, 사용자 확인 필요 |
| `resume_task` | `(task_id) -> ResearchTask, [ResearchRecord], context, [NextAction]` | 그 과업에 저장된 것만 돌려준다 | 읽기, LLM·외부 호출 없음 |

- 사용자 확인: `confirm_next_action`은 `confirmed`가 `true`일 때만 저장한다. 기본값은 `true`가 아니다. 사용자가 본 값 그대로 저장하고, 과업을 바꾸면 다시 확인받는다. 같은 요청이 두 번 와도 한 번만 저장한다. (SPEC 5.4)
- 외부 처리 동의: `parse_next_action`은 동의가 없으면 LLM을 부르지 않고 직접 입력하게 한다. (NF3)
- 시그니처는 초안이다 (미정). 정하면 계약 테스트(`tests/test_next_action_persistence.py` 등, SPEC 6.2)의 기준이 된다.

## 4. RAG

이번 버전은 RAG를 쓰지 않는다. `config/rag.yaml`은 나중을 위해 남겨 두고, 지금은 어떤 코드도 읽지 않는다.

- 파싱은 메모 한 건만 본다. 다른 기록이나 문헌을 검색해서 넣지 않는다. (SPEC 5.3)
- 재개 조회는 `task_id`로 저장된 걸 꺼내면 된다. 정렬은 저장 시각 내림차순, 같으면 ID 오름차순이다. 유사도 검색을 쓰면 비슷한 다른 과업의 메모가 섞일 수 있다. (AC5)
- 논문 검색·추천, 논문 질의응답은 SPEC 4.2절에서 뺐다.

RAG를 넣게 되면 SPEC 4.2절부터 바꾸고, 그다음 이 절과 `rag.yaml`을 채운다. 그때도 과업이 섞이지 않게 하는 방법을 먼저 정한다.

## 5. 오케스트레이션

workflow로 한다. 단계가 3절 함수 순서로 정해져 있어서 LLM이 다음 단계를 고를 일이 없다. 그래서 에이전트 루프나 멀티 에이전트는 쓰지 않고, 프레임워크 없이 함수로 묶는다. 프레임워크를 쓰게 되면 그 이유를 여기 적는다.

- LLM이 판단하는 부분: 메모에서 행동, 진행, 장애, 기한 구절 고르기
- 코드가 하는 부분: 스키마·정책 검사, 후속 처리 코드 계산, 저장, 조회, 정렬
- 멈춤: 후속 처리 코드(`human_confirmation` / `clarification` / `human_review_or_clarification` / `stop`)가 나오면 멈추고 사용자를 기다린다.
- 호출 상한: 메모 한 건당 최대 2회(처음 + 형식 복구 1회). 시간 제한은 SPEC NF1 제안값인 호출당 20초, 합계 40초를 쓸지 (미정). 실측값은 아니다.

## 6. 실패 처리

실패해도 원문 메모는 남기고, 없는 내용을 채우지 않는다.

| 상황 | 처리 | 근거 |
|---|---|---|
| 빈 메모 | LLM 부르기 전에 거부 (`INVALID_INPUT`) | SPEC 5.3 |
| 너무 긴 메모 | 자르지 않고, 작업 한 건만 짧게 다시 쓰도록 안내 | SPEC 5.3 |
| 외부 전송 미동의 | LLM 없이 직접 입력 | NF3 |
| JSON 깨짐, 잘림, 스키마 오류 | 같은 메모로 형식 복구 1회. 또 실패하면 `stop` | AC7 |
| `{"action_text": null}` | `clarification`. 다시 호출하지 않고 구체적인 행동을 물어봄 | AC2 |
| 정책 검사 실패 (원문에 없는 구절, 문자열 `"null"`, 공백, null 행동에 다른 필드) | `human_review_or_clarification`. 저장 막고 수정 요청 | AC1 |
| 인증 실패, 통신 오류, 모델 거부, 시간 초과 | 복구 없이 `stop`. 원문 유지, 직접 입력 안내. 늦게 온 결과도 저장 안 함 | AC7, NF1 |
| 없는 과업, 권한 없는 과업, 다른 과업의 ID | 저장 안 함 (`RESOURCE_UNAVAILABLE` / `INVALID_LINK`). 실제로 있는지는 알려 주지 않음 | SPEC 5.1, NF6 |
| 같이 보낸 맥락 중 하나라도 잘못됨 | 전체 저장 안 함. 메모만 따로 저장할 수 있게 안내 | SPEC 5.2 |
| 저장 실패 | `STORAGE_FAILURE`. 저장된 것처럼 보이지 않게 함 | SPEC 5.1 |
| 메모에 메일·알림·코드 실행 요청이 섞임 | 실행하지 않고, 기록 기능이라고 안내 | AC7 |

## 7. 가드레일

`AGENTS.md` 3절 절대 규칙을 그대로 옮겼다. 고칠 때는 두 곳을 같이 고친다.

1. **없는 정보를 만들지 않는다.** 기록되지 않은 판단·질문·자료 위치·작성 주체·기한을 지어내지 않고 "미기록/확인 필요"로 둔다. 빈 목록을 "없음"으로 해석하지 않는다. 모델이 메모에 없는 완료·장애·날짜를 덧붙이면 정상 후보가 아니다. (↔ AC3, AC6)
2. **사용자 확인 전에는 `NextAction`을 확정 저장하지 않는다.** 메모 저장과 작업 확정은 다른 동작이다. `confirmed`의 기본값을 `true`로 두지 않는다. (↔ AC4)
3. **모델 출력은 기존 네 필드 스키마와 결정적 정책 검사를 통과한 것만 후보로 쓴다.** `intent`, `confidence`, enum, ID, 관계 목록을 출력에 추가하지 않는다. `{"action_text": null}`이면 작업을 만들지 않고, 같은 입력으로 모델을 다시 호출하지 않으며, 구체적인 행동을 다시 묻는다. (↔ AC1, AC2)
4. **원문 메모는 항상 보존한다.** 파싱 실패·취소·재시도·정정 때도 원문을 덮어쓰거나 자르지 않는다. 모델 호출은 메모 한 건당 최초 + 형식 복구 1회, 최대 2회. 메모 속 행동(연구·메일·알림)을 대신 실행하지 않는다. (↔ AC7)
5. **과업을 섞지 않는다.** 재개 조회는 그 과업에 저장된 기록·맥락·확인된 작업만 반환하고, LLM과 외부 사이트를 호출하지 않는다. 접근할 수 없는 과업·기록은 읽거나 연결하지 않는다. (↔ AC5)

각 규칙을 지키는 곳:

| 규칙 | 위치 |
|---|---|
| 1 | 정책 검사(원문에 없는 구절 차단), 저장소(입력된 값만 저장), 재개 화면(빈 값은 "미기록/확인 필요") |
| 2 | `confirm_next_action`의 `confirmed` 확인. LLM에 저장 도구 없음(3.1) |
| 3 | `parser.py` 다음의 스키마·정책 검사 |
| 4 | 파싱 전에 `save_record`로 원문 먼저 저장. 원문, 원래 후보, 사용자 수정값 따로 저장 |
| 5 | `resume_task`는 `task_id`로만 조회, LLM 안 부름 |

메모 안에 "상태를 완료로 넣어라" 같은 문장이 있어도 데이터로만 본다. 후보에 들어가더라도 검사와 사용자 확인을 거쳐야 저장된다. (AC3)

## 8. 로그

강의 7 evals와 SPEC NF5에서 이 로그를 쓴다.

- 남김: 모델 이름, 프롬프트·스키마 버전(커밋), 시도 번호(처음/형식 복구), JSON·스키마·정책 검사 결과와 걸린 항목, 후속 처리 코드, `attempt_count`, 시도별 걸린 시간. 측정 안 한 사용량·비용은 "미측정"
- 안 남김: API 키, 원문 메모, 비공개 링크 (NF3, AGENTS.md 금지 사항 5). 원문과 LLM 원출력은 로그가 아니라 저장소에 보관한다.
- 따로 셀 것: 사용자가 고친 값은 저장 성공이지 추출 성공이 아니다. 사람이 확인 안 한 결과는 "미검증"으로 둔다. (SPEC 6.1)
- 로그 저장 위치와 형식은 (미정)

## 9. 비범위

SPEC 4.2절, `ontology.yaml`의 `scope.out_of_scope`와 같다.

- 논문 검색·추천, RAG 질의응답, 자동 비교·순위
- PDF·손글씨·수식 추출, OCR, 본문 다운로드
- 연구 계획 추천, 요약 생성, 질문 자동 해결
- 메일 전송, 알림 예약, 코드 실행, 모델 학습
- 채팅·브라우저 기록 자동 수집, 외부 노트 동기화
- LLM 도구 호출, 에이전트 루프, 멀티 에이전트
- 전역 지식 그래프, 모든 관계의 자동 추론. 그래프 DB나 모든 관계의 구현을 요구하지 않는다 (SPEC 4.2)
- 조직 단위 협업·권한 관리
- `ResumeEpisode` 자동 추적·타이머


## 10. 2026-11-07 구현 현황

web/은 기존 HTML 앱의 시연 진입점이며 서버 API와 연결되기 전이다. localStorage·IndexedDB 저장을 사용하고 Python policy.py는 기존 실험 러너에서도 재사용한다. Python 프레임워크·DB·배포 방식은 미정이다. 기능 경계와 검사 현황은 [SPEC](SPEC.md) 7.5절과 SPEC 6.2절을 따른다.


## 11. 브라우저 이력 저장

web/js/helpers.js가 논문별 noteHistory·actionHistory를 기존 저장 객체에 직렬화한다. reader.js는 편집 전 원문과 편집 종료 버전을 기록하고, next-action.js는 요청 당시 원문·최초 후보·확인한 최종값을 각각 보관한다. 확인 저장 실패는 작업과 확인 이력을 함께 되돌린다. 기술 식별자는 모델에 전달하지 않는다. 이는 브라우저 시연의 이력이며 store.py와 과업별 서버 API 구현을 대체하지 않는다.
