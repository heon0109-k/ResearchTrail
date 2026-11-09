# AGENTS.md: ResearchTrail

> ResearchTrail 저장소에서 작업하는 모든 코딩 에이전트가 따라야 할 규칙이다.
> 기능 명세는 `docs/SPEC.md`, 용어와 개념 정의는 `docs/ontology.yaml`, 문제 배경은 `docs/PROBLEM.md`에 있다.
> 여기에는 매 작업마다 필요한 핵심 용어와 규칙만 요약해 두었다.
>
> 문서끼리 내용이 다를 때 기준은 다음과 같다.
> - 기능 범위와 수용 기준: `docs/SPEC.md`
> - 도메인 용어와 필드 이름: `docs/ontology.yaml`
> - 작업 중 지킬 규칙: 이 문서
> - 위 원본 문서끼리 서로 다르면 임의로 해석하지 않고, 다른 부분을 알린 뒤 사람에게 확인받는다.

## 1. 제품 맥락

대상 사용자는 과제·프로젝트·스터디·연구를 위해 논문을 읽고 기록하며, 중단한 읽기와 탐색을 다시 이어가려는 학생이다. 과업으로 돌아왔을 때 이미 기록한 맥락(남긴 이유·판단·질문·자료 위치)과 확인한 다음 작업 한 건을 되찾아 이어 가게 돕는다. 제품 대상과 기존 학부생 인터뷰의 검증 범위는 구분한다.

핵심 흐름: 과업 선택 → 짧은 메모 저장 → 다음 작업 후보 추출 → 사용자 검토·확인 → 같은 과업 재열람 (`docs/SPEC.md` 3절).

논문 검색·추천, RAG 질의응답, 요약·연구 계획 생성, PDF·OCR 추출, 메일·알림·코드 실행은 이번 버전의 범위가 아니다 (`docs/SPEC.md` 4.2절).

## 2. 도메인 용어집

> 대표어와 필드명만 발췌했다. 설명·근거·관계 정의는 `docs/ontology.yaml`을 본다. 새 클래스나 필드 이름을 지어내지 말고 여기 있는 이름을 쓴다.

- ResearchTask (문헌 과업): `goal_text`, `scope_text`, `target_output_text`, `progress_text`
- ResearchRecord (기록): `content_text`(원문 메모, 필수), `record_kind_text`, `authorship_text`, `container_text`, `location_text`, `review_state_text`, `adoption_state_text`, `audience_text`, `ai_input_scope_text`, `change_reason_text` / 관계 `revises`, `copied_from`, `follows`
- ResearchQuestion (질문): `question_text`, `state_text`, `unresolved_reason_text`
- Decision (사람의 실제 판단·합의): `decision_text`, `made_by_text`, `reason_text`
- Document (저작물): `title`, `material_kind_text`
- DocumentArtifact (특정 파일·판본): `label_text`, `version_text`, `part_text`, `access_locator_text`, `availability_text`, `extraction_issue_text`
- DocumentUse (이 과업에서 그 문헌을 쓰는 이유): `purpose_text`, `role_text`, `purpose_recording_text`, `reading_state_text`
- EvidenceExcerpt (원문 대목): `locator_text`, `excerpt_text`, `context_text`
- NextAction (다음 작업 한 건): `action_text`, `progress_text`, `blocker_text`, `deadline_text`. LLM이 출력하는 유일한 객체이며, 스키마 원본은 `src/researchtrail/schemas/next_action.schema.json`이다.
- ResumeEpisode (재개 사건): 관찰용 개념. 이번 구현에서 자동 추적·타이머를 만들지 않는다.

혼동하기 쉬운 구분:

- `Document`, `DocumentArtifact`, `DocumentUse`는 각각 저작물, 특정 판본, 과업별 사용 이유다. 서로 대체하지 않는다.
- 상태 필드는 합치지 않는다. 읽음은 `DocumentUse.reading_state_text`, 질문 해결은 `ResearchQuestion.state_text`, 원문 대조는 `ResearchRecord.review_state_text`, 채택은 `ResearchRecord.adoption_state_text`, 작업 진행은 `NextAction.progress_text`다. 하나의 "완료" 체크박스로 묶지 않는다.
- `ResearchTask.progress_text`는 과업 전체의 진행이고, `NextAction.progress_text`는 그 작업 한 건의 진행이다.
- AI 설명은 `ResearchRecord`이고, 사람이 실제로 정한 것만 `Decision`이다.
- `task_id`, `record_id`, `next_action_id`, 작업공간 ID, 저장 시각은 애플리케이션 기술 필드다. 도메인 속성이나 모델 출력에 넣지 않는다.
- API 응답의 `next_action`(후속 처리 코드: `human_confirmation` / `clarification` / `human_review_or_clarification` / `stop`)은 도메인 클래스 `NextAction`과 다르다.

## 3. 절대 규칙

> 제품이 항상 지켜야 하는 것. 위반한 결과물은 수용하지 않는다.

1. **없는 정보를 만들지 않는다.** 기록되지 않은 판단·질문·자료 위치·작성 주체·기한을 지어내지 않고 "미기록/확인 필요"로 둔다. 빈 목록을 "없음"으로 해석하지 않는다. 모델이 메모에 없는 완료·장애·날짜를 덧붙이면 정상 후보가 아니다. (↔ AC3, AC6)
2. **사용자 확인 전에는 `NextAction`을 확정 저장하지 않는다.** 메모 저장과 작업 확정은 다른 동작이다. `confirmed`의 기본값을 `true`로 두지 않는다. (↔ AC4)
3. **모델 출력은 기존 네 필드 스키마와 결정적 정책 검사를 통과한 것만 후보로 쓴다.** `intent`, `confidence`, enum, ID, 관계 목록을 출력에 추가하지 않는다. `{"action_text": null}`이면 작업을 만들지 않고, 같은 입력으로 모델을 다시 호출하지 않으며, 구체적인 행동을 다시 묻는다. (↔ AC1, AC2)
4. **원문 메모는 항상 보존한다.** 파싱 실패·취소·재시도·정정 때도 원문을 덮어쓰거나 자르지 않는다. 모델 호출은 메모 한 건당 최초 + 형식 복구 1회, 최대 2회. 메모 속 행동(연구·메일·알림)을 대신 실행하지 않는다. (↔ AC7)
5. **과업을 섞지 않는다.** 재개 조회는 그 과업에 저장된 기록·맥락·확인된 작업만 반환하고, LLM과 외부 사이트를 호출하지 않는다. 접근할 수 없는 과업·기록은 읽거나 연결하지 않는다. (↔ AC5)

## 4. 금지 사항

> 위임받은 에이전트가 작업 중 하지 말 것.

1. **사람이 승인한 테스트와 골든 케이스를 스스로 고치지 않는다.** 사람이 확인해 승인한 `tests/` 아래 테스트와 `tests/harness/golden_cases.yaml`의 케이스는 사람의 승인 없이 바꾸지 않는다. 실패하면 테스트가 아니라 구현을 고친다. 사람이 지시한 변경이라도 판정에 쓰이는 것(단언문, 케이스, 기대값, skip 조건)은 건드리지 않는다.
   - 정책 골든 케이스는 `tests/harness/golden_cases.yaml`에 두고, `tests/test_policy_golden.py`에서 실행한다.
   - 새 기능의 테스트 코드는 추가할 수 있다. 다만 새 케이스와 기대값은 `docs/SPEC.md`의 AC에서 근거를 찾아 초안으로 제시하고, 지어내지 않는다. 사람이 승인하기 전에는 완료 기준으로 쓰지 않는다.
2. **완료 조건을 임의로 좁히지 않는다.** skip, xfail, 케이스 삭제로 통과시키지 않는다.
3. **근거 없는 결과를 내놓지 않는다.** 통과했다면 각 케이스가 왜 통과하는지 한 줄씩 설명한다. 오프라인 검사 통과를 의미 정확도나 실제 모델 성능으로 보고하지 않는다.
4. **원본 문서를 팀 합의 없이 바꾸지 않는다.** `docs/SPEC.md`, `docs/ontology.yaml`, `src/researchtrail/prompts/parse_query.md`, `src/researchtrail/schemas/next_action.schema.json`이 대상이다. 범위가 달라져야 하면 먼저 SPEC 변경을 제안한다.
5. **비밀값을 다루지 않는다.** `.env`와 `/private/`는 읽거나 커밋하지 않는다. API 키·원문 메모·비공개 링크를 로그나 커밋에 남기지 않는다.
6. **`--live` 실행을 스스로 하지 않는다.** 실제 모델 호출은 비용이 들고 사람의 사례 검토가 전제이므로, 사람이 명시적으로 요청할 때만 실행한다.

## 5. 코딩 컨벤션

- 프레임워크·DB·배포 방식은 아직 정하지 않았다 (`docs/SPEC.md` 5.1절). 에이전트가 임의로 고르지 말고, 필요하면 선택지를 제안해 확인받는다.
- 모델 입력은 `parse_query.md`의 마커 사이 텍스트, 출력 스키마, 현재 메모 한 건뿐이다. 다른 기록·온톨로지·저장소 문서를 프롬프트에 넣지 않는다.
- 같은 입력에는 항상 같은 순서가 나와야 한다. 기본 정렬은 저장 시각 내림차순, 동률은 ID 오름차순. 저장 순서로 "최신 판단"이나 "최신 판본"을 추론하지 않는다.
- 오류 응답은 `{error: {code, message}}`, `code`는 `INVALID_INPUT` / `RESOURCE_UNAVAILABLE` / `INVALID_LINK` / `STORAGE_FAILURE`만 쓴다. 권한 없는 자원의 존재 여부를 노출하지 않는다.
- 미상 값: 조회 응답에서는 `null`, 등록된 항목이 없는 목록은 `[]`. 파서 표준 출력에서는 미상 선택 키를 생략한다.
- 선택 맥락 중 하나라도 유효하지 않으면 그 요청 전체를 저장하지 않는다(부분 저장 금지).
- 원문 메모, 원래 모델 후보, 사용자 최종 편집값을 따로 보존한다. 사용자가 고친 값을 추출 성공으로 세지 않는다.
- 원문 상태 필드에 enum을 강제하지 않는다. 사람이 고르는 화면 선택값의 닫힌 목록은 ontology.yaml의 ui_selection과 SPEC 7.4절의 팀 검토 전 초안이다. 팀 승인 후 구현 계약으로 확정한다. 모델 출력에 선택 코드나 새 필드를 추가하지 않는다.
- 새 기능은 대응 AC의 테스트부터 작성한다 (AC와 테스트 위치는 `docs/SPEC.md` 6.2절).

## 6. 완료의 정의

다음을 모두 만족해야 완료다.

- 변경과 관련된 AC의 테스트가 통과한다 (`docs/SPEC.md` 6.2절의 테스트 위치). 6.2절의 경로는 제안이므로, 해당 테스트가 아직 없거나 사람이 승인하지 않았으면 통과로 세지 않고 그 사실을 보고한다.
- `python scripts/check_next_action_parser.py --offline`이 전부 통과한다.
- 변경 이유와 각 테스트의 통과 이유를 근거와 함께 설명할 수 있다.
- 사람이 의미를 판정하지 않은 모델 결과는 "미검증"으로 기록하고 통과로 세지 않는다.

작업을 마치면 다음을 보고한다.

- 바꾼 파일과 바꾼 이유
- 실행한 테스트와 결과
- 실행하지 못한 테스트와 그 이유
- 구현하지 못한 부분과 사람의 확인이 필요한 부분

## 7. 운영 정보

개발 환경

- Python 3. 파서 러너 의존성: `PyYAML`, `jsonschema` (`pip install pyyaml jsonschema`).
- 실제 모델 실험에만 `OPENAI_API_KEY`가 필요하다. 키는 `.env`에 두고 커밋하지 않는다(`.env.example`만 커밋 가능).

자주 쓰는 명령

- 오프라인 파서 검사(모델 호출 없음): `python scripts/check_next_action_parser.py --offline`
  - 실행할 때마다 `evals/results/next_action_parser/<시각>-offline-<id>/`에 결과 폴더가 생긴다. 커밋할지는 팀이 정한다.
- 실제 모델 실험(사람이 요청할 때만): `python scripts/check_next_action_parser.py --live --provider openai --model gpt-4o-mini-2024-07-18 --cases-reviewed`

디렉터리

- `src/researchtrail/`: 애플리케이션 코드. `prompts/parse_query.md`(파서 프롬프트), `schemas/next_action.schema.json`(출력 계약), `tools/`(도구 계층)
- `scripts/`: 실험 러너. 도메인 객체를 저장하는 제품 코드가 아니다.
- `tests/`: 테스트. `tests/harness/golden_cases.yaml`에 데이터 기반 골든 케이스
- `evals/`: 모델 품질 평가와 결과(`evals/results/`)
- `data/seed/`: 예시 데이터
- `config/`: 설정(`rag.yaml`. RAG는 이번 버전 비포함 범위)
- `docs/`: `PROBLEM.md`, `SPEC.md`, `ontology.yaml`, `ARCHITECTURE.md`, `research/`(인터뷰·실험 기록), `spikes/`, `prompts/`(위임 프롬프트 기록)

진행 상태

- 진행 상황은 여기 적지 않는다. `docs/SPEC.md` 4.5절과 테스트 실행 결과를 본다.
