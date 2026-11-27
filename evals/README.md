# ResearchTrail Evals

사용자 결정(2026-11-08)에 따라 현재 규칙 기반 MVP를 먼저 평가하고 실제 AI 평가는 후속 단계로 분리한다. 현재 stub 정답 20건과 합격선(전체 20/20·후보 없음 10/10·중대 오류 및 실행 오류 0건)은 사용자 확인을 반영했다. 실행 준비 상태는 설계서 6절을 참조한다.

현재 골든 케이스는 그대로 둔다. [20건 정답·보완사항](CASE_REVIEW.md)과 설계서의 합격선을 확인한다. [설계서](EVAL_DESIGN.md)와 [사람 결정 항목](review_decisions.json)을 검토한다.

- `evalset.jsonl`: 합성 입력 20건. stub 기대값 20건은 사용자 답변 반영(후보 10건·후보 없음 10건), 모델 20건은 미확정 null. 아직 제품에 실행하지 않음.
- `run_evals.py`: draft 검사, 승인 후 실제 stub 실행 또는 저장된 최초 모델 출력 채점. 네트워크 호출 없음.
- `adapters/stub.cjs`: 현재 앱의 aiSuggest를 실행. 사례 ID별 정답을 반환하지 않음. Node.js 필요.
- `judge_prompt.md`: 미사용 이유. judge 호출이나 가짜 사람 라벨 없음.
- `self_test.py`: 별도 임시 합성 자료로 러너의 오류 검출을 확인. 평가셋은 실행하지 않음.

Python 3, PyYAML, jsonschema와 Node.js가 필요하다. 저장소 루트에서:

```sh
python3 evals/run_evals.py --check --target stub
python3 -B evals/self_test.py
```

--check는 제품을 실행하거나 결과를 저장하지 않는다. ready=false는 팀 결정·라벨·검토 기록이 남았다는 뜻이다. self-test 통과도 사람 승인이나 제품 품질 점수가 아니다.

사람 검토·기대값·합격선·해시 확정 후에만:

```sh
python3 evals/run_evals.py --run --target stub --change "실제 변경 내용"
```

`--live`는 지원하지 않는다. 모델 평가 자료가 필요하면 별도 승인된 수집 절차를 먼저 마련한다. 스파이크와 새 자료를 공유할 경우에도 같은 결과를 독립 실험 두 건으로 세지 않는다. 공식 실행 결과는 아직 없다.
