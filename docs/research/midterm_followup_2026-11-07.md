# 중간평가 지적과 현재 저장소 대조

2026-11-07. 교수 평가는 2026-10-14 발표일 기준이다. 그 뒤 보강된 현재 파일과 구분해 확인했다. 이번 수정은 실행 전 기준·추가 근거·코드 시작을 제공하며 교수 평가 충족이나 제품 완성을 선언하지 않는다.

| 평가 항목 | 현재 상태와 이번 보완 | 남은 일 |
|---|---|---|
| 1-1 인터뷰 | 기존 10개 로그 외 추가 설문 2건을 익명 요약해 research/survey_2026-11-05.md에 연결 | 학적·전공·기간·중복 확인, P06 면담일·시작 시각 확인. 추측으로 보충하지 않음 |
| 1-2 문제 근거 | 재탐색·수월한 재개·원문 위치 부담을 구분. 두 응답을 자동 지지로 집계하지 않음 | 최근 재개 사건의 지연과 원인을 후속 질문으로 확인 |
| 1-3 반증·성공 | PROBLEM.md 5절에 문제 조사와 제품 실험을 분리하고 표본·성공선·기각선·시간 지표 초안 작성 | 8명 문제 조사, 6명 제품 실험, 각 합격선은 통계적 근거·모집 확인 없는 계획 초안. 실행 전 팀 검토·확정 필요 |
| 2-1 근거 역추적 | 기존 evidence를 보존하고 추가 설문의 응답·문항별 요약을 따로 작성 | Document.title·ResearchRecord.follows의 직접 근거 보강은 추가 응답 필요 |
| 2-2 범위 | 사용자 확인에 따라 primary_situation과 agreed_job_text를 문헌 과업 재개로 통일. 과거 Job 문장은 출처 보존 | 원문 인터뷰를 바꾸지 않고 팀 합의 이력을 검토 |
| 2-3 어휘·타입 | 읽기·작업 상태 표시 어휘 초안과 원문 보존을 SPEC 7.2에 기록 | 닫힌 enum은 AGENTS의 상태 원문 보존 규칙과 함께 별도 계약 검토. 아직 강제하지 않음 |
| 3-1 AC 판정 | SPEC 7.3에 AC3 4/4·AC6 4/4, 대응 합성 사례 초안을 작성 | 사람이 사례·기대값 승인 후 제품 통합 테스트. 기존 golden_cases.yaml은 자리표시자 상태 |
| 3-2 범위·인터페이스 | 현재 SPEC에는 비포함 범위와 입출력 정의가 이미 있음 | HTML 시연과 제품 계약의 차이를 계속 추적 |
| 3-3 스파이크 | spikes/2026-11-07_next_action_attribution.md에 20건·18/20·중대 오류 0건·호출 20초/총 40초·최대 2회 초안 | 사례 동결·사람 검토·실제 모델 호출 승인·의미 판정 미실행 |
| 3-4 개발 착수 | 현재 AGENTS는 상세화돼 있음. 앱 web/ 편입, 정책 검사 policy.py 분리, 현재 코드의 오프라인 결과 원본 기록 | 과거 48/48 결과는 소급 복원 불가. 영속 서버 저장·접근 통제·과업별 제품 API는 미구현 |

## 구현한 것과 시연 경계

기존 HTML 앱을 web/에 편입했다. 첫 화면, 타임라인, 읽기·메모, 예시 응답 후보, 브라우저 저장을 포함한다. 바탕화면 파일은 수정하지 않았다. 추가 시 오늘 날짜와 저장 문구 제거를 저장소 버전에 반영했다. 브라우저에서 시작하기 → 논문 추가 → 날짜 2026-11-07 확인 → 합성 논문 등록 → 새로고침 후 복원을 확인했다.

web/js/ai-stub.js는 규칙 기반 시연이며 Python 정책 모듈과 서버로 연결되지 않는다. PDF·캡처·그래프·검색 시연은 기존 앱에서 가져온 기능으로, SPEC의 필수 완료 범위를 확대했다는 뜻이 아니다. 화면에서는 논문 중심 상태를 사용하므로 ResearchTask와 ResearchRecord의 전체 계약을 구현했다고 주장하지 않는다. 제품 API·사용자 확인 원출력 감사 이력·재시도/동시성·서버 영속 저장·접근 제어 연결이 후속 구현이다.

## 검사 결과

- 정책 검사 분리 전·후 오프라인 48/48 통과, live 호출 0회. 최종 원본은 ../../evals/results/next_action_parser/20261107T092900433090Z-offline-ebe84708/offline.json이다.
- 새 Python 회귀 검사 5개 실행 통과. 후보 정상 분기, null 재질문, 중복 JSON 키 거부, 없는 상태 차단, 의미 귀속 한계 유지가 각각 확인됐다. 팀 승인 전 초안이므로 제품 완료 기준으로 사용하지 않는다.
- tests/web_add_date_draft.cjs에서 버튼·좌표 유래 추가 모두 오늘 날짜, 선택 태그 보존을 확인했다. 승인 전 회귀 초안이다.
- web/js 전체 문법 검사 통과. 저장소 HTML의 상대 파일 참조가 모두 존재한다.
- 실제 모델 평가, AC4~AC6 서버 통합, 제품 사용성 시간 측정, PDF 외부 다운로드·모바일 검증은 미실행이다.

## 실행

저장소 루트에서 `python3 -m http.server 5500 --directory web` 실행 후 http://127.0.0.1:5500/ 에 접속한다. 기록은 주소·브라우저별로 분리되므로 바탕화면 앱의 이전 기록을 자동 이전하지 않는다.

`PYTHONPATH=src python3 -m unittest discover -s tests -p test_next_action_contract.py -v`

`node tests/web_add_date_draft.cjs`

`python3 scripts/check_next_action_parser.py --offline`

Python 검사에는 PyYAML·jsonschema가 필요하다. 실제 모델 실험은 별도 명시적 요청 전 수행하지 않는다.

## 오프라인 검사별 통과 근거

원본 offline.json과 러너의 각 assertion에 대응한다. 의미상 추출 성공을 뜻하지 않는다.

| 검사 | 통과한 이유 |
|---|---|
| `contract_load_meta_validation_property_match` | 프롬프트와 스키마 필드·메타 계약 일치 |
| `runtime_example_normal` | 정상 예시의 구조·원문 구절 검사가 통과 |
| `runtime_example_insufficient` | 정보 부족 예시의 구조·정책 검사가 통과 |
| `missing_action` | 필수 행동 키 누락을 스키마에서 거부 |
| `empty_action` | 빈 행동을 스키마에서 거부 |
| `numeric_action` | 숫자 행동을 스키마에서 거부 |
| `extra_intent` | 미정의 필드를 스키마에서 거부 |
| `numeric_deadline` | 숫자 기한을 스키마에서 거부 |
| `null_clarification` | null 행동을 clarification으로 분기 |
| `whitespace` | 공백뿐인 값을 정책에서 거부 |
| `null_with_deadline` | null 행동과 추가 필드 조합 차단 |
| `literal_null` | 문자열 null 차단 |
| `invented_progress` | 원문에 없는 진행 상태 차단 |
| `optional_null` | 선택 null을 표준 출력에서 제거 |
| `wrong_attribution` | 부분 문자열 검사를 통과해도 사람의 의미 판정이 미검증으로 유지됨 |
| `malformed_json` | 깨진 JSON을 형식 오류로 분류 |
| `duplicate_key` | 중복 JSON 키 거부 |
| `non_json_constant` | NaN 등 비표준 JSON 상수 거부 |
| `markers_missing` | 마커 누락·중복·순서·줄 경계 오류를 거부하는 대응 조건 충족 |
| `markers_duplicate` | 마커 누락·중복·순서·줄 경계 오류를 거부하는 대응 조건 충족 |
| `markers_duplicate_end` | 마커 누락·중복·순서·줄 경계 오류를 거부하는 대응 조건 충족 |
| `markers_reversed` | 마커 누락·중복·순서·줄 경계 오류를 거부하는 대응 조건 충족 |
| `markers_inline` | 마커 누락·중복·순서·줄 경계 오류를 거부하는 대응 조건 충족 |
| `repair_once` | 형식 오류 뒤 복구 1회로 종료 |
| `truncation_repair` | 잘린 출력에 형식 복구 적용 |
| `schema_repair` | 스키마 오류에 형식 복구 적용 |
| `repair_limit` | 반복 오류에도 두 번 넘게 호출하지 않음 |
| `call_budget` | 호출 예산 초과 차단 |
| `token_budget` | 출력 토큰 예산 초과 차단 |
| `null_no_retry` | null 행동에 재호출 없이 재질문 |
| `refusal_no_retry` | 거부 뒤 재호출 없이 종료 |
| `policy_no_retry` | 정책 오류 뒤 재호출 없이 검토 요청 |
| `auth_no_retry` | 인증 실패 뒤 재호출 없이 종료 |
| `filter_no_retry` | 필터 중단 뒤 재호출 없이 종료 |
| `transport_no_retry` | 통신 오류 뒤 재호출 없이 종료 |
| `envelope_no_retry` | 응답 포맷 오류 뒤 재호출 없이 종료 |
| `time_budget` | 시간 예산 만료 뒤 호출 차단 |
| `missing_credential_blocked` | 자격 증명 없는 live 설정 차단 |
| `custom_endpoint_blocked` | 사용자 정의 외부 엔드포인트 차단 |
| `unreviewed_cases_blocked` | 미검토 사례의 live 실행 차단 |
| `request_isolation_normal` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_insufficient` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_ambiguous` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_unsupported` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_date` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_completion` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_multiple` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |
| `request_isolation_injection` | 해당 사례 요청이 프롬프트·스키마·현재 메모 한 건만 포함 |


## 후속 사건 반영

F01의 원문 조건 재탐색(약 10분)과 F02의 PDF 주석을 통한 원활한 재개(약 30초)를 설문 분석과 PROBLEM.md 5절에 반영했다. 참가자 연결 미확인으로 인원수는 유지했다. 원문 상세 정보 검색과 과업 맥락 복원은 구분하며, 두 시간을 앱 전후 절감으로 계산하지 않는다. 이 추가는 문서 분석이며 앱 실험 결과가 아니다.
