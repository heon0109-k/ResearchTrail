"""SPEC-derived draft criteria; team approval is pending."""
import json
from pathlib import Path
import unittest
import yaml
from jsonschema import Draft7Validator
from researchtrail.policy import validate_output

ROOT = Path(__file__).resolve().parents[1]
DATA = yaml.safe_load((ROOT / 'docs/research/policy_golden_cases.yaml').read_text())
CASES = DATA['cases']
IDS = [case['id'] for case in CASES]
# Fail collection rather than silently accepting removed or duplicate cases.
if len(IDS) != 14 or len(set(IDS)) != 14:
    raise ValueError('Expected 14 unique draft cases')
VALIDATOR = Draft7Validator(json.loads((ROOT / DATA['loader_rules']['validator']).read_text()))


class PolicyGoldenDraftTests(unittest.TestCase):
    def check_case(self, case):
        self.assertTrue(case['ac'])
        self.assertTrue(case['note'].startswith('SPEC '))
        inp = case['input']
        self.assertLessEqual(set(inp), {'memo', 'raw', 'status'})
        result = validate_output(inp['raw'], inp['memo'], VALIDATOR,
                                 inp.get('status', DATA['loader_rules']['default_status']))
        expectations = {key[7:]: value for key, value in case.items() if key.startswith('expect_')}
        required = {'next_action', 'normalized', 'optional_nulls', 'repair_eligible'}
        self.assertLessEqual(required, set(expectations))
        self.assertLessEqual(set(expectations), required | {'errors_include'})
        for key, expected in expectations.items():
            if key == 'errors_include':
                for reason in expected:
                    self.assertIn(reason, result['errors'], 'Missing rejection reason')
            else:
                self.assertEqual(result[key], expected, key)
        if case['expect_optional_nulls']:
            self.assertEqual(result['parsed'], json.loads(inp['raw']))


def make_test(case):
    def test(self):
        self.check_case(case)
    return test


for case in CASES:
    setattr(PolicyGoldenDraftTests, 'test_' + case['id'].replace('-', '_'), make_test(case))


if __name__ == '__main__':
    unittest.main()
