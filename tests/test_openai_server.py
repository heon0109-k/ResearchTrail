"""Draft migration regressions for user-requested server-side OpenAI integration."""
import importlib.util
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location(
    "serve_openai", Path(__file__).resolve().parents[1] / "scripts/serve_openai.py"
)
server_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server_module)


class Reply:
    def __init__(self, data):
        self.data = json.dumps(data).encode()

    def read(self, *_args):
        return self.data

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass


class OpenAIServerTests(unittest.TestCase):
    def setUp(self):
        self.server = server_module.OpenAIServer(("127.0.0.1", 0), "test-key-only")
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, body=None, origin=None):
        headers = {"Content-Type": "application/json"}
        if origin:
            headers["Origin"] = origin
        request = Request(self.base + path, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        with urlopen(request) as reply:
            return json.load(reply)

    def body(self, properties):
        return {
            "contents": [{"parts": [{"text": "Test prompt"}]}],
            "generationConfig": {"responseSchema": {
                "type": "OBJECT", "properties": properties, "required": list(properties),
            }},
        }

    def test_all_three_ai_tasks_use_luna_with_server_key_and_strict_output(self):
        payloads = [
            ({"done": {"type": "ARRAY", "items": {"type": "STRING"}},
              "open": {"type": "ARRAY", "items": {"type": "STRING"}},
              "next": {"type": "STRING"}}, {"done": [], "open": [], "next": "읽기"}),
            ({"answer": {"type": "STRING"}, "found": {"type": "BOOLEAN"}},
             {"answer": "본문 답변", "found": True}),
            ({"terms": {"type": "ARRAY", "items": {"type": "STRING"}}},
             {"terms": ["vocabulary"]}),
        ]
        for properties, output in payloads:
            with self.subTest(output=output):
                response = {"status": "completed", "output": [{"content": [
                    {"type": "output_text", "text": json.dumps(output)},
                ]}]}
                with patch.object(server_module, "urlopen", return_value=Reply(response)) as send:
                    result = self.request("/api/openai/models/gpt-6-luna:generateContent",
                                          self.body(properties))
                request = send.call_args.args[0]
                body = json.loads(request.data)
                self.assertEqual(request.full_url, "https://api.openai.com/v1/responses")
                self.assertEqual(request.get_header("Authorization"), "Bearer test-key-only")
                self.assertEqual(body["model"], "gpt-6-luna")
                self.assertEqual(body["reasoning"], {"effort": "none"})
                self.assertFalse(body["store"])
                schema = body["text"]["format"]
                self.assertTrue(schema["strict"])
                self.assertFalse(schema["schema"]["additionalProperties"])
                self.assertEqual(set(schema["schema"]["required"]), set(properties))
                self.assertEqual(json.loads(result["candidates"][0]["content"]["parts"][0]["text"]), output)
                self.assertNotIn("test-key-only", json.dumps(result))

    def test_request_effort_values_are_forwarded_and_unknown_values_rejected(self):
        body = self.body({"answer": {"type": "STRING"}})
        for effort in ("none", "low", "medium", "high", "xhigh", "max"):
            body["generationConfig"]["reasoningEffort"] = effort
            upstream = server_module.response_request(body, server_module.MODEL)
            self.assertEqual(upstream["reasoning"], {"effort": effort})
        body["generationConfig"]["reasoningEffort"] = "auto"
        with self.assertRaises(ValueError):
            server_module.response_request(body, server_module.MODEL)

    def test_status_exposes_model_but_never_credentials(self):
        with patch.object(server_module, "urlopen") as send:
            result = self.request("/api/openai/models/gpt-6-luna")
        self.assertEqual(result, {"configured": True, "model": "gpt-6-luna"})
        send.assert_not_called()

    def test_foreign_origin_and_invalid_requests_never_call_provider(self):
        for path, body, origin, status in [
            ("/api/openai/models/gpt-6-luna:generateContent", self.body({}), "https://foreign.test", 403),
            ("/api/openai/models/gpt-6-luna:generateContent", {}, None, 400),
            ("/api/unknown", {}, None, 404),
        ]:
            with self.subTest(status=status), patch.object(server_module, "urlopen") as send:
                with self.assertRaises(HTTPError) as error:
                    self.request(path, body, origin)
                self.assertEqual(error.exception.code, status)
                send.assert_not_called()

    def test_upstream_error_is_sanitized(self):
        error = HTTPError("https://api.openai.com/v1/responses", 401,
                          "test-key-only must not be exposed", {}, None)
        with patch.object(server_module, "urlopen", side_effect=error):
            with self.assertRaises(HTTPError) as reply:
                self.request("/api/openai/models/gpt-6-luna:generateContent",
                             self.body({"answer": {"type": "STRING"}}))
            body = reply.exception.read().decode()
        self.assertNotIn("test-key-only", body)
        self.assertEqual(reply.exception.code, 401)

    def test_refusal_and_incomplete_responses_are_not_normal_answers(self):
        refusal = server_module.response_envelope({
            "status": "completed", "output": [{"content": [{"type": "refusal"}]}],
        })
        self.assertEqual(refusal["candidates"][0]["finishReason"], "SAFETY")
        with self.assertRaises(ValueError):
            server_module.response_envelope({"status": "incomplete", "output": []})


if __name__ == "__main__":
    unittest.main()
