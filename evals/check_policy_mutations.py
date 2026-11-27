"""Verify existing policy golden tests on disposable copies; never edit golden criteria."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
FILES = ['tests/test_policy_golden.py', 'tests/harness/golden_cases.yaml',
         'src/researchtrail/policy.py', 'src/researchtrail/schemas/next_action.schema.json']
MUTATIONS = [
    ('null_to_confirmation',
     '"clarification" if value["action_text"] is None else "human_confirmation"',
     '"human_confirmation"', ['test_NA_CLARIFY_01']),
    ('skip_source_span_check', 'if item not in note:', 'if False and item not in note:',
     ['test_NA_STRUCT_07', 'test_NA_STRUCT_10']),
    ('accept_duplicate_json_keys', 'require(key not in result, "Duplicate JSON property: " + key)',
     'require(True, "Duplicate JSON property: " + key)', ['test_NA_STRUCT_13']),
]


def main():
    runs = []
    with tempfile.TemporaryDirectory(prefix='researchtrail-policy-mutation-') as temp:
        tmp = Path(temp)
        for name in FILES:
            dst = tmp / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, dst)
        policy = tmp / 'src/researchtrail/policy.py'
        original = policy.read_text()
        env = os.environ.copy()
        env['PYTHONDONTWRITEBYTECODE'] = '1'
        env['PYTHONPATH'] = str(tmp / 'src')

        def execute(name):
            command = [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_policy_golden.py', '-v']
            p = subprocess.run(command, cwd=tmp, env=env, capture_output=True, text=True, timeout=30)
            return {'name': name, 'exit_code': p.returncode, 'output': p.stdout + p.stderr}

        baseline = execute('unchanged_copy')
        assert baseline['exit_code'] == 0 and 'Ran 14 tests' in baseline['output'], baseline
        runs.append(baseline)
        for name, before, after, expected in MUTATIONS:
            assert original.count(before) == 1, 'policy changed; review mutation anchor: ' + name
            try:
                policy.write_text(original.replace(before, after, 1))
                result = execute(name)
                result['expected_failing_tests'] = expected
                result['detected'] = result['exit_code'] != 0 and all('FAIL: ' + test in result['output'] for test in expected)
                assert result['detected'], result
                runs.append(result)
            finally:
                policy.write_text(original)
        restored = execute('restored_copy')
        assert restored['exit_code'] == 0 and 'Ran 14 tests' in restored['output'], restored
        runs.append(restored)
    print(json.dumps({'scope': 'machine verification only; not human acceptance', 'golden_files_modified': False,
                      'live_calls': 0, 'runs': runs}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
