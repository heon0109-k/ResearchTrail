"""AC1/AC2/AC3 regression drafts. Human approval is still pending."""
import json
from pathlib import Path
import unittest
from jsonschema import Draft7Validator
from researchtrail.policy import validate_output


class ContractDraftTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        schema = Path(__file__).resolve().parents[1] / "src/researchtrail/schemas/next_action.schema.json"
        cls.validator = Draft7Validator(json.loads(schema.read_text()))

    def check_output(self, raw, note="표 2 확인"):
        return validate_output(raw, note, self.validator)

    def test_valid_span_requires_confirmation(self):
        result = self.check_output('{"action_text":"표 2 확인"}')
        self.assertEqual(result["next_action"], "human_confirmation")

    def test_null_requires_clarification(self):
        result = self.check_output('{"action_text":null}')
        self.assertEqual(result["next_action"], "clarification")
        self.assertFalse(result["repair_eligible"])

    def test_duplicate_json_key_requires_repair(self):
        result = self.check_output('{"action_text":null,"action_text":"표 2 확인"}')
        self.assertFalse(result["json_valid"])
        self.assertTrue(result["repair_eligible"])

    def test_invented_progress_needs_review(self):
        result = self.check_output('{"action_text":"표 2 확인","progress_text":"완료"}')
        self.assertEqual(result["next_action"], "human_review_or_clarification")

    def test_structure_does_not_prove_semantic_attribution(self):
        result = self.check_output('{"action_text":"표 2 확인","progress_text":"완료"}',
                                   "논문 읽기는 완료. 표 2 확인은 아직 시작하지 않았어.")
        self.assertTrue(result["policy_valid"])
        self.assertIsNone(result["human_semantic_review"]["verdict"])


if __name__ == "__main__":
    unittest.main()
