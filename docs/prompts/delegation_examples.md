# 위임 프롬프트와 검증 기록

## 예시 1. 재방문 안내의 이어 읽기

**직접 요청 발췌**

> 이어 읽기 버그랑 테스트, PDF 보안 설정, README랑 인터뷰 링크까지 고치고 5500에서 먼저 확인할 수 있게 해줘. 커밋이랑 PR은 아직 하지 마

**검토 의견을 전달한 추가 제약**

> 1번은 타임라인 쪽 클릭 처리만 고치기. `closeDetailPanel`의 동작 자체를 바꾸면 패널 닫기 등 다른 흐름이 같이 바뀔 수 있어요.

**검증 기록 · 2026-11-10**

- 새 탭으로 다시 접속해 안내 말풍선의 **이어 읽기**를 한 번 눌렀다. 수정 전에는 타임라인에 남았고, 수정 후에는 읽기 화면이 유지됐다. 읽기 화면을 새로고침한 뒤 같은 논문과 저장한 다음 할 일을 확인했다.
- [클릭 회귀 테스트](../../tests/web_resume_bubble_click.test.cjs)는 수정 전 실패하고 수정 후 통과했다. 타임라인의 빈 곳을 누르면 상세 패널이 닫히는 기존 동작도 확인한다.
- 브라우저에서 예시 PDF 표시, 업로드한 PDF의 링크 자동 탐색, 선택하거나 직접 추가한 링크의 새로고침 후 유지를 확인했다.

## 예시 2. 정책 골든 케이스 경로 정리

**검토 의견을 받아 전달한 요청**

> `tests/harness/golden_cases.yaml`은 지금 제목 한 줄뿐이에요. 실제 골든 14건(`docs/research/policy_golden_cases.yaml`)을 이 경로로 옮기거나 연결해 주세요.
>
> 이름만 있는 `tests/test_<function>_golden.py`는 실제 테스트(`test_policy_golden.py`)로 바꾸거나 정리해 주세요.

**검증 기록 · 2026-11-10**

- 이동 전후의 SHA-256이 같아 14건의 입력·기대값이 그대로 유지됐다. [정책 테스트](../../tests/test_policy_golden.py)는 [표준 경로의 데이터](../../tests/harness/golden_cases.yaml)를 읽으며, 14건이 개별 수집돼 모두 통과했다. 건너뛴 사례는 0건이다.
- 복사본의 정책 코드에 결함을 하나씩 넣었다. null 응답을 확인 요청으로 잘못 분류하면 `NA-CLARIFY-01`, 원문 구절 검사를 끄면 `NA-STRUCT-07·10`, 중복 JSON 키를 허용하면 `NA-STRUCT-13`이 실패했다. 복사본의 코드를 원복한 뒤 14건이 다시 통과했다.
- 고정 응답에 대한 정책 검사 결과다. 사례와 기대값은 팀 검토 전 초안이며, 사람의 수용 판정은 검토 후 기록한다.

재현 명령

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p test_policy_golden.py -v
node tests/web_resume_bubble_click.test.cjs
```
