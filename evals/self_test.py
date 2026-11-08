"""Runner verification on temporary synthetic fixtures, never on evalset.jsonl."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('rt_evals', HERE / 'run_evals.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


def expect(outcome='candidate'):
    return {'outcome': outcome, 'allowed_actions': ['자료 Z 확인하기'] if outcome == 'candidate' else [],
            'required_fields': {}, 'forbidden_fields': [], 'forbidden_values': {}}


def case(e=None):
    return {'id': 'synthetic', 'category': 'normal', 'query': '자료 Z 확인하기',
            'expect': {'stub': e or expect(), 'stored_model': e or expect()}, 'graders': ['code'], 'note': 'AC1 synthetic runner fixture'}


def output(value):
    return {'raw': json.dumps(value, ensure_ascii=False), 'status': 'stop', 'source': '자료 Z 확인하기'}


checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)


def rejected(fn):
    try:
        fn()
    except (ValueError, TypeError):
        return True
    return False


normal = case()
good = r.grade(normal, output({'action_text': '자료 Z 확인하기'}), 'stub')
check('correct_fixture_passes_all_checks', good['pass'])
wrong = r.grade(normal, output({'action_text': '다른 작업'}), 'stub')
check('invented_action_fails_source_and_counts_critical', not wrong['pass'] and wrong['critical'])
clarify = case(expect('clarification'))
check('invented_action_for_clarification_is_critical', r.grade(clarify, output({'action_text': '자료 Z 확인하기'}), 'stub')['critical'])
check('valid_null_is_not_an_error', r.grade(clarify, output({'action_text': None}), 'stub')['pass'])
for raw in ('broken', '{"action_text":"자료 Z 확인하기","action_text":null}', '{"action_text":"자료 Z 확인하기","intent":"new"}'):
    check('bad_json_duplicate_or_extra_property:' + raw[:20], not r.grade(normal, {'raw': raw, 'status': 'stop'}, 'stored_model')['pass'])
check('missing_output_is_failed_not_skipped', not r.grade(normal, {}, 'stub')['pass'])
check('timeout_is_failed_not_skipped', not r.grade(normal, {'status': 'timeout'}, 'stub')['pass'])
check('bad_source_is_critical', r.grade(normal, {**output({'action_text': '자료 Z 확인하기'}), 'source': 'invented'}, 'stub')['critical'])
e = expect()
e['forbidden_fields'] = ['progress_text']
c = case(e)
c['query'] += '. 완료'
check('forbidden_optional_field_detected', r.grade(c, output({'action_text': '자료 Z 확인하기', 'progress_text': '완료'}), 'stored_model')['critical'])
e = expect()
e['required_fields'] = {'deadline_text': ['내일']}
c = case(e)
c['query'] += '. 내일'
check('required_field_missing_fails', not r.grade(c, output({'action_text': '자료 Z 확인하기'}), 'stored_model')['pass'])
e = expect()
e['forbidden_values'] = {'progress_text': ['완료']}
c = case(e)
c['query'] += '. 완료'
check('forbidden_value_detected', r.grade(c, output({'action_text': '자료 Z 확인하기', 'progress_text': '완료'}), 'stored_model')['critical'])
check('unknown_expect_key_rejected', rejected(lambda: r.validate_expect({**expect(), 'typo': True}, normal['query'])))
metrics = r.aggregate([normal, clarify], [good, r.grade(clarify, {}, 'stub')], 'stub', {'overall_min': 1, 'clarification_min': 1, 'critical_max': 0})
check('error_kept_in_denominator', metrics['overall']['passed'] == 1 and metrics['overall']['total'] == 2 and metrics['errors']['count'] == 1)
check('category_scores_have_no_invented_threshold', all(row['target'] is None and row['met'] is None for row in metrics['categories'].values()))

with tempfile.TemporaryDirectory(prefix='researchtrail-evals-selftest-') as tmp:
    temp = Path(tmp)
    dataset, decisions, results = temp / 'fixture.jsonl', temp / 'decisions.json', temp / 'results'
    cases = []
    for i in range(20):
        q = '정할 수 없음' if i == 0 else '자료 ' + str(i) + ' 확인하기'
        e = expect('clarification' if i == 0 else 'candidate')
        e['allowed_actions'] = [] if i == 0 else [q]
        cases.append({'id': str(i), 'category': sorted(r.CATEGORIES)[i % 6], 'query': q,
                      'expect': {'stub': e, 'stored_model': None}, 'graders': ['code'], 'note': 'AC1 synthetic self-test only'})
    dataset.write_text('\n'.join(json.dumps(c, ensure_ascii=False) for c in cases) + '\n')
    decisions.write_text('{}')
    command = [sys.executable, '-B', str(HERE / 'run_evals.py'), '--dataset', str(dataset), '--decisions', str(decisions), '--output-dir', str(results)]
    blocked = subprocess.run(command + ['--run', '--change', 'synthetic self-test'], capture_output=True, text=True)
    check('unapproved_run_blocked_before_results', blocked.returncode == 2 and not results.exists())
    d = {'status': 'approved', 'target': 'stub', 'reviewers': ['SYNTHETIC SELF-TEST; NOT HUMAN APPROVAL'],
         'approved_at': 'synthetic fixture only', 'rationale': 'temporary runner verification; not an evaluation',
         'dataset_role': 'development', 'golden_review_reference': 'synthetic fixture, no golden acceptance',
         'runner_review_reference': 'synthetic fixture, no human acceptance',
         'thresholds': {'overall_min': 1, 'clarification_min': 1, 'critical_max': 0},
         'frozen_hashes': {'dataset': r.digest(dataset), 'design': r.digest(HERE / 'EVAL_DESIGN.md'),
                           'grader': r.digest(HERE / 'run_evals.py'), 'adapter': r.digest(HERE / 'adapters/stub.cjs'),
                           'schema': r.digest(r.SCHEMA), 'policy': r.digest(r.POLICY)}}
    decisions.write_text(json.dumps(d))
    ready = subprocess.run(command + ['--check'], capture_output=True, text=True)
    check('reviewed_synthetic_fixture_ready', ready.returncode == 0 and json.loads(ready.stdout)['ready'])
    done = subprocess.run(command + ['--run', '--change', 'synthetic runner verification only'], capture_output=True, text=True)
    check('temporary_end_to_end_run_succeeds', done.returncode == 0)
    reports = list(results.glob('*.json'))
    report = json.loads(reports[0].read_text())
    check('real_adapter_executes_twenty_fixture_queries', report['metrics']['overall']['passed'] == 20 and report['metrics']['overall']['total'] == 20)
    check('history_analysis_versions_and_no_calls_recorded', (results / 'history.csv').exists() and list(results.glob('*-analysis.md')) and report['versions']['dataset'] == r.digest(dataset) and report['live_calls'] == 0)
    corrupt = copy.deepcopy(cases)
    corrupt[0]['graders'] = ['judge']
    bad = temp / 'bad.jsonl'
    bad.write_text('\n'.join(json.dumps(c) for c in corrupt))
    check('unsupported_grader_rejected', rejected(lambda: r.load_cases(bad)))
    bad.write_text('\n'.join(json.dumps(c) for c in [*cases[:-1], cases[0]]))
    check('duplicate_case_id_rejected', rejected(lambda: r.load_cases(bad)))
    # Stored-model runs must retain a missing output and reject repaired/replayed input.
    model_cases = copy.deepcopy(cases)
    for row in model_cases:
        row['expect']['stored_model'] = row['expect']['stub']
    model_dataset = temp / 'model_fixture.jsonl'
    model_dataset.write_text('\n'.join(json.dumps(row) for row in model_cases))
    outputs = temp / 'outputs.jsonl'
    model_rows = []
    import hashlib
    for row in model_cases[:-1]:
        action = None if row['expect']['stored_model']['outcome'] == 'clarification' else row['query']
        model_rows.append({'id': row['id'], 'raw': json.dumps({'action_text': action}), 'status': 'stop',
                           'attempt_index': 0, 'query_sha256': hashlib.sha256(row['query'].encode()).hexdigest()})
    model_rows[1]['attempt_index'] = 1
    outputs.write_text('\n'.join(json.dumps(row) for row in model_rows))
    md = copy.deepcopy(d)
    md['target'] = 'stored_model'
    md['model_metadata'] = {'model': 'SYNTHETIC NO MODEL CALLED', 'prompt_hash': 'synthetic fixture',
                            'schema_hash': r.digest(r.SCHEMA), 'collection_run_id': 'synthetic fixture'}
    md['frozen_hashes']['dataset'] = r.digest(model_dataset)
    model_decisions = temp / 'model_decisions.json'
    model_decisions.write_text(json.dumps(md))
    model_dir = temp / 'model_results'
    model_run = subprocess.run([sys.executable, '-B', str(HERE / 'run_evals.py'), '--run', '--target', 'stored_model',
                                '--dataset', str(model_dataset), '--decisions', str(model_decisions),
                                '--output-dir', str(model_dir), '--outputs', str(outputs), '--change', 'synthetic importer check'],
                               capture_output=True, text=True)
    model_report = json.loads(next(model_dir.glob('*.json')).read_text())
    check('stored_missing_and_repair_outputs_remain_failures', model_run.returncode == 1 and model_report['metrics']['overall']['passed'] == 18 and model_report['metrics']['overall']['total'] == 20 and model_report['metrics']['errors']['count'] == 2)
    dataset.write_text(dataset.read_text() + '\n')
    stale = subprocess.run(command + ['--check'], capture_output=True, text=True)
    check('changed_dataset_invalidates_review', not json.loads(stale.stdout)['ready'])

for name in checks:
    print('PASS:', name)
print('CHECKS:', len(checks), '; temporary fixtures removed; real evalset never executed; no human approval recorded.')
