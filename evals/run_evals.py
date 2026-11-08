"""Offline Evals preparation and approved runs. No model/network calls; golden files are read-only."""
import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
from jsonschema import Draft7Validator
from researchtrail.policy import strict_json, validate_output

FIELDS = {'action_text', 'progress_text', 'blocker_text', 'deadline_text'}
OPTIONAL = FIELDS - {'action_text'}
TARGETS = ('stub', 'stored_model')
CATEGORIES = {'normal', 'conflict', 'clarify', 'out_of_scope', 'injection', 'hallucination'}
SCHEMA = ROOT / 'src/researchtrail/schemas/next_action.schema.json'
POLICY = ROOT / 'src/researchtrail/policy.py'
VALIDATOR = Draft7Validator(json.loads(SCHEMA.read_text()))


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def jsonl(path):
    return [strict_json(line) for line in Path(path).read_text().splitlines() if line.strip()]


def validate_expect(expect, query):
    require(isinstance(expect, dict), 'expectation must be an object')
    require(set(expect) == {'outcome', 'allowed_actions', 'required_fields', 'forbidden_fields', 'forbidden_values'}, 'unknown/missing expectation keys')
    require(expect['outcome'] in ('candidate', 'clarification'), 'unknown outcome')
    actions = expect['allowed_actions']
    require(isinstance(actions, list), 'allowed_actions must be a list')
    require(all(isinstance(x, str) and x.strip() and x in query for x in actions), 'allowed actions must be nonempty verbatim spans')
    require(bool(actions) == (expect['outcome'] == 'candidate'), 'outcome/actions conflict')
    required, forbidden, values = expect['required_fields'], expect['forbidden_fields'], expect['forbidden_values']
    require(isinstance(required, dict) and set(required) <= OPTIONAL, 'invalid required fields')
    require(isinstance(forbidden, list) and set(forbidden) <= OPTIONAL and len(set(forbidden)) == len(forbidden), 'invalid forbidden fields')
    require(not set(required).intersection(forbidden), 'required/forbidden conflict')
    require(isinstance(values, dict) and set(values) <= FIELDS, 'invalid forbidden_values')
    for key, spans in required.items():
        require(isinstance(spans, list) and bool(spans) and all(isinstance(x, str) and x.strip() and x in query for x in spans), 'required fields need allowed source spans')
    for key, spans in values.items():
        require(isinstance(spans, list) and bool(spans) and all(isinstance(x, str) and bool(x) for x in spans), 'invalid forbidden value list')
        require(not set(spans).intersection(required.get(key, actions if key == 'action_text' else [])), 'allowed/forbidden values conflict')
    if expect['outcome'] == 'clarification':
        require(not required, 'clarification must not require optional fields')


def load_cases(path):
    cases = jsonl(path)
    require(len(cases) >= 20, 'at least 20 cases required')
    ids = [c.get('id') for c in cases]
    require(all(isinstance(i, str) and i for i in ids) and len(set(ids)) == len(ids), 'missing/duplicate ids')
    require({c.get('category') for c in cases} == CATEGORIES, 'all six planned categories required')
    for c in cases:
        require(set(c) == {'id', 'category', 'query', 'expect', 'graders', 'note'}, 'unknown/missing case fields')
        require(isinstance(c['query'], str) and c['query'].strip(), 'empty query')
        require(c['graders'] == ['code'], 'only code grader is implemented; judge is disabled')
        require(isinstance(c['note'], str) and c['note'].startswith('AC'), 'AC reference required')
        require(set(c['expect']) == set(TARGETS), 'separate target expectations required')
        for target in TARGETS:
            if c['expect'][target] is not None:
                validate_expect(c['expect'][target], c['query'])
    return cases


def readiness(cases, decisions, target, dataset, design):
    reasons = []
    if any(c['expect'][target] is None for c in cases):
        reasons.append('selected target has expectations awaiting human review')
    if decisions.get('status') != 'approved' or decisions.get('target') != target:
        reasons.append('target/design approval pending')
    for key in ('reviewers', 'approved_at', 'rationale', 'dataset_role', 'golden_review_reference', 'runner_review_reference'):
        if not decisions.get(key):
            reasons.append('missing human decision: ' + key)
    if decisions.get('dataset_role') not in ('holdout', 'development'):
        reasons.append('dataset_role must be holdout or development')
    if decisions.get('dataset_role') == 'holdout' and decisions.get('unused_for_tuning_confirmed') is not True:
        reasons.append('holdout provenance not confirmed')
    thresholds = decisions.get('thresholds', {})
    for key in ('overall_min', 'clarification_min'):
        value = thresholds.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 1:
            reasons.append('human threshold missing/invalid: ' + key)
    if type(thresholds.get('critical_max')) is not int or thresholds.get('critical_max') != 0:
        reasons.append('human confirmation of absolute-rule limit 0 required')
    frozen = decisions.get('frozen_hashes', {})
    paths = {'dataset': dataset, 'design': design, 'grader': Path(__file__), 'adapter': ROOT / 'evals/adapters/stub.cjs', 'schema': SCHEMA, 'policy': POLICY}
    for key, path in paths.items():
        if frozen.get(key) != digest(path):
            reasons.append('reviewed hash missing/mismatched: ' + key)
    return reasons


def grade(case, output, target):
    """A transport/parse/grader error remains a failed case in the full denominator."""
    result = {'id': case['id'], 'category': case['category'], 'output': output,
              'checks': {}, 'errors': [], 'critical': False, 'pass': False}
    try:
        require(isinstance(output, dict) and output.get('status') == 'stop', 'missing/failed first output')
        raw = output['raw']
        require(isinstance(raw, str), 'raw output must be text')
        validation = validate_output(raw, case['query'], VALIDATOR)
        result['validation'] = validation
        common = validation['schema_valid'] is True and validation['policy_valid'] is True
        result['checks']['schema_and_source_spans'] = common
        if not common:
            result['critical'] = True
            result['errors'].append('invalid_schema_or_source_span')
            return result
        value = validation['normalized']
        if target == 'stub':
            source = output.get('source')
            source_ok = isinstance(source, str) and source in case['query'] and (value['action_text'] is None or value['action_text'] in source)
            result['checks']['source_preserved'] = source_ok
            result['critical'] |= not source_ok
        e = case['expect'][target]
        action = value['action_text']
        result['checks']['outcome'] = (action is None) == (e['outcome'] == 'clarification')
        result['checks']['allowed_action'] = action is None if e['outcome'] == 'clarification' else action in e['allowed_actions']
        for key, spans in e['required_fields'].items():
            result['checks']['required:' + key] = value.get(key) in spans
        for key in e['forbidden_fields']:
            ok = key not in value
            result['checks']['forbidden_field:' + key] = ok
            result['critical'] |= not ok
        for key, spans in e['forbidden_values'].items():
            ok = value.get(key) not in spans
            result['checks']['forbidden_value:' + key] = ok
            result['critical'] |= not ok
        if e['outcome'] == 'clarification' and action is not None:
            result['critical'] = True
        result['pass'] = all(result['checks'].values())
    except Exception as exc:
        result['errors'].append(type(exc).__name__ + ': ' + str(exc))
    return result


def aggregate(cases, results, target, thresholds):
    def rate(rows, minimum):
        total = len(rows)
        passed = sum(r['pass'] for r in rows)
        value = passed / total if total else None
        return {'passed': passed, 'total': total, 'value': value, 'target': minimum,
                'met': value >= minimum if value is not None and minimum is not None else None}
    clarify_ids = {c['id'] for c in cases if c['expect'][target]['outcome'] == 'clarification'}
    critical = sum(r['critical'] for r in results)
    return {'overall': rate(results, thresholds['overall_min']),
            'clarification': rate([r for r in results if r['id'] in clarify_ids], thresholds['clarification_min']),
            'critical': {'count': critical, 'total': len(results), 'target': thresholds['critical_max'], 'met': critical <= thresholds['critical_max']},
            'errors': {'count': sum(bool(r['errors']) for r in results), 'total': len(results)},
            'categories': {cat: rate([r for r in results if r['category'] == cat], None) for cat in sorted(CATEGORIES)}}


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument('--check', action='store_true', help='validate drafts without invoking the product')
    modes.add_argument('--run', action='store_true', help='requires reviewed expectations, decisions and hashes')
    parser.add_argument('--target', choices=TARGETS, default='stub')
    parser.add_argument('--dataset', type=Path, default=ROOT / 'evals/evalset.jsonl')
    parser.add_argument('--decisions', type=Path, default=ROOT / 'evals/review_decisions.json')
    parser.add_argument('--outputs', type=Path, help='JSONL first model outputs; no model API is implemented')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'evals/results')
    parser.add_argument('--change', default='')
    args = parser.parse_args()
    design = ROOT / 'evals/EVAL_DESIGN.md'
    cases = load_cases(args.dataset)
    decisions = strict_json(args.decisions.read_text())
    reasons = readiness(cases, decisions, args.target, args.dataset, design)
    hashes = {key: digest(path) for key, path in {'dataset': args.dataset, 'design': design, 'grader': Path(__file__), 'adapter': ROOT / 'evals/adapters/stub.cjs', 'schema': SCHEMA, 'policy': POLICY}.items()}
    if args.check:
        print(json.dumps({'case_count': len(cases), 'target': args.target, 'ready': not reasons,
                          'pending': reasons, 'current_hashes': hashes}, ensure_ascii=False, indent=2))
        return 0
    require(not reasons, 'Official run blocked: ' + '; '.join(reasons))
    require(bool(args.change.strip()), '--change is required')
    require(any(c['expect'][args.target]['outcome'] == 'clarification' for c in cases), 'clarification examples required')
    model_metadata = None
    if args.target == 'stub':
        require(args.outputs is None, '--outputs is only for stored_model')
        run = subprocess.run(['node', str(ROOT / 'evals/adapters/stub.cjs')], input=json.dumps([c['query'] for c in cases]), capture_output=True, text=True, timeout=60)
        require(run.returncode == 0, 'stub adapter failed')
        outputs = strict_json(run.stdout)
        require(len(outputs) == len(cases), 'adapter output count mismatch')
    else:
        require(args.outputs is not None, 'stored_model requires --outputs')
        rows = jsonl(args.outputs)
        ids = [r['id'] for r in rows]
        require(len(set(ids)) == len(ids), 'duplicate stored output ids')
        require(set(ids) <= {c['id'] for c in cases}, 'unknown stored output id')
        by_id = {r['id']: r for r in rows}
        outputs = []
        for c in cases:
            row = by_id.get(c['id'], {})
            if type(row.get('attempt_index')) is not int or row.get('attempt_index') != 0 or row.get('query_sha256') != hashlib.sha256(c['query'].encode()).hexdigest():
                row = {'status': 'error', 'error': 'missing or unmatched first output'}
            outputs.append(row)
        model_metadata = {'file_hash': digest(args.outputs), 'model_metadata': decisions.get('model_metadata')}
        require(isinstance(model_metadata['model_metadata'], dict) and all(model_metadata['model_metadata'].get(k) for k in ('model', 'prompt_hash', 'schema_hash', 'collection_run_id')), 'reviewed model provenance required')
        require(model_metadata['model_metadata']['schema_hash'] == digest(SCHEMA), 'stored output schema version mismatch')
    results = [grade(c, o, args.target) for c, o in zip(cases, outputs)]
    metrics = aggregate(cases, results, args.target, decisions['thresholds'])
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '-' + uuid4().hex[:8]
    report = {'run_id': run_id, 'target': args.target, 'dataset_role': decisions['dataset_role'],
              'commit': git('rev-parse', 'HEAD'), 'dirty_status': git('status', '--short'),
              'change': args.change, 'versions': hashes, 'schema_hash': digest(SCHEMA),
              'product_hash': digest(ROOT / 'web/js/ai-stub.js') if args.target == 'stub' else None,
              'decision_hash': digest(args.decisions), 'decisions': decisions,
              'judge': {'enabled': False, 'version': None}, 'model': model_metadata,
              'live_calls': 0, 'golden_status': 'team_review_in_progress_not_inferred',
              'dataset_snapshot': cases, 'metrics': metrics, 'cases': results,
              'quality_gate_met': all(metrics[k]['met'] is True for k in ('overall', 'clarification', 'critical')),
              'scope': 'candidate output only; not full AC1-AC7, model adoption, UI/storage or user-effect acceptance'}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    lock = args.output_dir / '.evals.lock'
    with lock.open('x'):
        try:
            with (args.output_dir / (run_id + '.json')).open('x') as stream:
                json.dump(report, stream, ensure_ascii=False, indent=2)
            history = args.output_dir / 'history.csv'
            exists = history.exists() and history.stat().st_size > 0
            with history.open('a', newline='') as stream:
                writer = csv.writer(stream)
                if not exists:
                    writer.writerow(['run_id', 'commit', 'target', 'dataset_role', 'dataset_hash', 'grader_hash', 'adapter_hash', 'schema_hash', 'policy_hash', 'design_hash', 'decision_hash', 'change', 'passed', 'total', 'critical', 'errors', 'quality_gate_met'])
                writer.writerow([run_id, report['commit'], args.target, decisions['dataset_role'], hashes['dataset'], hashes['grader'], hashes['adapter'], hashes['schema'], hashes['policy'], hashes['design'], report['decision_hash'], args.change, metrics['overall']['passed'], len(cases), metrics['critical']['count'], metrics['errors']['count'], report['quality_gate_met']])
            failures = [r for r in results if not r['pass']]
            lines = ['# Error analysis: ' + run_id, '', 'Actual failures: ' + str(len(failures)) + '. Up to ten examples; no invented failures.', '']
            for r in failures[:10]:
                lines += ['- ' + r['id'] + ' (' + r['category'] + '): ' + ', '.join([k for k, v in r['checks'].items() if not v] + r['errors']), '  - Human cause / improvement: pending']
            lines += ['', 'Category failure counts (not causal classifications):']
            lines += ['- ' + cat + ': ' + str(sum(r['category'] == cat for r in failures)) for cat in sorted(CATEGORIES)]
            with (args.output_dir / (run_id + '-analysis.md')).open('x') as stream:
                stream.write('\n'.join(lines) + '\n')
        finally:
            lock.unlink()
    for r in results:
        print(r['id'], 'PASS' if r['pass'] else 'FAIL', ','.join(r['checks']), ';'.join(r['errors']))
    print(json.dumps({'run_id': run_id, 'metrics': metrics}, ensure_ascii=False))
    return 0 if report['quality_gate_met'] else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(2)
