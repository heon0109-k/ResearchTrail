# Evals 러너 기계 검증 기록

2026-11-08. 아래는 기계 실행 결과이며 사람 승인·제품 평가 점수가 아니다. 원래 evalset 20건은 제품에 실행하지 않았다. 임시 합성 fixture만 사용했고 종료 후 제거했다. 공식 results JSON·history.csv·베이스라인은 만들지 않았다.

실행 명령:

```sh
python3 -B evals/self_test.py
python3 -B evals/run_evals.py --check --target stub
python3 -B evals/run_evals.py --check --target stored_model
PYTHONPATH=src python3 -B -m unittest discover -s tests -p 'test_*.py' -q
node --check evals/adapters/stub.cjs
```

사용한 Python 환경에는 jsonschema·PyYAML이 설치돼 있다. self-test는 25개 검사 모두 통과, 기존 Python 검사는 25개 통과했다. draft 검사에서는 20건을 읽고 ready=false와 미확정 항목을 표시했다. 미승인 --run이 제품 호출·결과 생성 전에 거부되는 것도 확인했다. 문법·git diff --check 통과.

| 검사 | 통과 근거 |
|---|---|
| 정상 fixture | 실제 채점기의 공통·기대 조건을 모두 통과 |
| 없는 행동 | 원문 구절 검사 실패 및 critical 기록 |
| 재질문 입력에 행동 | null 기대를 위반해 critical 기록 |
| 정상 null | 재질문 조건을 충족하며 오류로 오인하지 않음 |
| 깨진 JSON | 파싱 실패를 통과로 세지 않음 |
| 중복 JSON 키 | 기존 strict_json에서 거부 |
| 추가 속성 | 기존 스키마에서 거부 |
| 출력 누락 | 실패·오류로 유지 |
| 시간 초과 응답 | 실패·오류로 유지 |
| 출처 변조 | 원문 source 검사를 위반해 critical 기록 |
| 금지 선택 필드 | forbidden_fields 위반 검출 |
| 필수 선택 필드 누락 | required_fields 조건 실패 |
| 금지 값 | forbidden_values 위반 검출 |
| 미지원 기대 키 | 기대 조건 검증에서 거부 |
| 오류 분모 | 성공 1·누락 1을 1/2로 계산하고 오류 1건 유지 |
| 범주 임의 합격선 방지 | 범주별 target·met은 미설정으로 유지 |
| 승인 전 차단 | 미승인 실행은 코드 2, 결과 폴더 미생성 |
| 임시 fixture 승인 경로 | synthetic 표기가 있는 임시 결정 파일로 준비 경로만 검증 |
| 러너 전체 경로 | 임시 승인 fixture의 실행·채점·기록 완료 |
| 실제 stub 어댑터 | 별도 fixture 20건을 aiSuggest로 실행, 20/20 검사 확인 |
| 결과·이력·분석 | 임시 결과에 버전 해시·live_calls=0, history·analysis 생성 |
| 미지원 judge | 로더에서 거부하여 채점 누락 방지 |
| 중복 사례 ID | 로더에서 거부 |
| 저장된 모델 출력 | 누락 1·복구 응답 1을 제외하지 않고 18/20·오류 2건으로 기록 |
| 검토 후 데이터 변경 | 입력 파일 변경으로 해시 불일치·ready=false 확인 |

기계 검증에서 사용한 승인 표기는 임시 합성 fixture의 조건 분기 확인용이며 실제 팀원의 이름·승인·모델 결과가 아니다. 팀이 입력에 없는 행동·재질문 오답·금지 상태·JSON 오류·누락 응답을 직접 주입해 검토한 기록과 수용 판단은 아직 없다. 골든 케이스와 테스트 기대값은 변경하지 않았다.

현재 검증하지 않은 것: 실제 모델 수집·모델 정확도·LLM judge 일치율·사용자 효과·서버 저장·다중 과업 접근 통제. 제품 평가셋을 실행한 것처럼 이 25개를 보고하지 않는다.
