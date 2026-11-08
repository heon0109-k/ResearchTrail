"""State selection contract drafts based on SPEC AC3/AC6; human review pending."""
import json
from pathlib import Path
import subprocess
import unittest

import yaml
from jsonschema import Draft7Validator
from researchtrail.policy import validate_output

ROOT = Path(__file__).resolve().parents[1]


class StateContractDraftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ontology = yaml.safe_load((ROOT / 'docs/ontology.yaml').read_text())
        cls.schema = json.loads((ROOT / 'src/researchtrail/schemas/next_action.schema.json').read_text())

    def selection(self, class_name, field_name):
        return self.ontology['classes'][class_name]['attributes'][field_name]['ui_selection']

    def test_reading_values_match_existing_app(self):
        script = """
const fs = require('node:fs'), vm = require('node:vm');
const c = {localStorage:{getItem:()=>null}, document:{getElementById:()=>null}};
vm.createContext(c);
vm.runInContext(fs.readFileSync('web/js/core.js','utf8'),c);
console.log(JSON.stringify(Object.fromEntries(Object.entries(c.STATES).map(([k,v])=>[k,v.t]))));
"""
        actual = json.loads(subprocess.check_output(['node', '-e', script], cwd=ROOT, text=True))
        self.assertEqual(actual, self.selection('DocumentUse', 'reading_state_text')['allowed_values'])

    def test_next_action_selection_has_its_own_values(self):
        self.assertEqual(self.selection('NextAction', 'progress_text')['allowed_values'],
                         {'not_started': '미착수', 'in_progress': '진행 중', 'completed': '완료'})

    def test_record_review_selection_has_its_own_values(self):
        self.assertEqual(self.selection('ResearchRecord', 'review_state_text')['allowed_values'],
                         {'unreviewed': '미검토', 'reviewed': '검토함'})

    def test_missing_selection_has_no_assumed_state(self):
        for class_name, field_name in [('DocumentUse', 'reading_state_text'),
                                       ('NextAction', 'progress_text'),
                                       ('ResearchRecord', 'review_state_text')]:
            with self.subTest(field=field_name):
                selection = self.selection(class_name, field_name)
                self.assertIsNone(selection['default'])
                self.assertTrue(selection['nullable'])
                self.assertEqual(selection['unknown_label'], '미기록/확인 필요')

    def test_model_schema_stays_open_and_has_four_fields(self):
        self.assertEqual(set(self.schema['properties']),
                         {'action_text', 'progress_text', 'blocker_text', 'deadline_text'})
        self.assertNotIn('enum', self.schema['properties']['progress_text'])
        Draft7Validator(self.schema).validate({'action_text': '표 2 확인', 'progress_text': '아직 시작하지 않았어'})

    def test_policy_preserves_original_progress_expression(self):
        value = {'action_text': '표 2 확인', 'progress_text': '아직 시작하지 않았어'}
        result = validate_output(json.dumps(value, ensure_ascii=False),
                                 '표 2 확인은 아직 시작하지 않았어', Draft7Validator(self.schema))
        self.assertEqual(result['normalized'], value)
        self.assertEqual(result['next_action'], 'human_confirmation')


if __name__ == '__main__':
    unittest.main()
