#!/usr/bin/env python3
"""Isolated NextAction baseline. Offline by default; never saves domain objects."""

import argparse
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import re
import shlex
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from uuid import uuid4

try:
    import yaml
    from jsonschema import Draft7Validator
except ImportError as exc:
    raise SystemExit("BLOCKED: requires installed PyYAML and jsonschema; no dependencies installed.") from exc

ROOT = Path(__file__).resolve().parents[1]
PROMPT = ROOT / "src/researchtrail/prompts/parse_query.md"
SCHEMA = ROOT / "src/researchtrail/schemas/next_action.schema.json"
ONTOLOGY = ROOT / "docs/ontology.yaml"
ENDPOINT = "https://api.openai.com/v1/chat/completions"
MODELS = ("gpt-4o-mini-2024-07-18",)
SCOPE = ("This experiment only records proposed tasks; it does not perform research, "
         "send mail, set reminders, or save established NextAction objects.")
REVIEW = {"verdict": None, "reason": "Human semantic review not performed."}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def dumps(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)


def strict_json(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            require(key not in result, "Duplicate JSON property: " + key)
            result[key] = value
        return result

    def constant(value):
        raise ValueError("Non-JSON constant: " + value)

    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def extract_runtime(text):
    lines = text.splitlines(keepends=True)
    positions = []
    for marker in ("<!-- prompt:start -->", "<!-- prompt:end -->"):
        found = [i for i, line in enumerate(lines) if line.strip() == marker]
        require(len(found) == 1, "Expected exactly one standalone " + marker)
        positions.append(found[0])
    start, end = positions
    require(start < end, "Runtime markers are out of order")
    runtime = "".join(lines[start + 1:end])
    require(bool(runtime.strip()), "Runtime prompt is empty")
    return runtime


def load_contract():
    text = PROMPT.read_text(encoding="utf-8")
    runtime = extract_runtime(text)
    schema = strict_json(SCHEMA.read_text(encoding="utf-8"))
    require(schema.get("$schema") == "http://json-schema.org/draft-07/schema#", "Expected Draft-07")
    Draft7Validator.check_schema(schema)
    ontology = yaml.safe_load(ONTOLOGY.read_text(encoding="utf-8"))
    names = set(ontology["classes"]["NextAction"]["attributes"])
    require(set(schema["properties"]) == names and len(names) == 4, "Ontology property mismatch")
    return text, runtime, schema, Draft7Validator(schema)


def prepare_cases(text, runtime):
    examples = re.findall(r"^입력: (.+)\n출력: (.+)$", runtime, re.MULTILINE)
    require(len(examples) == 2, "Expected two runtime input/output examples")
    rows = {}
    for line in text.splitlines():
        match = re.match(r"^\| (\d+) \|", line)
        if match:
            rows[int(match[1])] = line.split("|")[3]
    specs = [
        ("ambiguous", 3, "Clarify the action and target; action_text must be null."),
        ("unsupported", 5, "Execution-only request: null; do not execute anything."),
        ("date", 8, "Preserve 내일 스터디 전까지 verbatim; do not calculate a date."),
        ("completion", 9, "The table check has not started; reading the paper is not its completion."),
        ("multiple", 10, "No selected independent action: null; ask the user to select one."),
        ("injection", 11, "Extract the table check; do not adopt the injected 완료 as progress."),
    ]
    cases = [
        {"id": name, "note": note, "source": "runtime example " + str(i + 1),
         "expected_behavior": behavior, "reference_output": strict_json(output)}
        for i, ((note, output), name, behavior) in enumerate(zip(
            examples, ("normal", "insufficient"),
            ("Preserve the explicit action, progress, blocker, and relative deadline.",
             "Unresolved previous action: null and clarification, not retrieval.")))
    ]
    for name, row, behavior in specs:
        spans = re.findall(r"`([^`]+)`", rows.get(row, ""))
        require(len(spans) == 1, "Cannot extract prompt diagnostic row " + str(row))
        cases.append({"id": name, "note": spans[0], "source": "prompt failure row " + str(row),
                      "expected_behavior": behavior})
    return cases


def validate_output(raw, note, validator, status="stop"):
    result = {"termination": status, "json_valid": None, "schema_valid": None,
              "policy_valid": None, "errors": [], "parsed": None, "normalized": None,
              "optional_nulls": [], "human_semantic_review": dict(REVIEW),
              "repair_eligible": False, "next_action": "stop", "scope": SCOPE}
    if status != "stop":
        result["repair_eligible"] = status == "length"
        result["next_action"] = "format_repair" if status == "length" else "stop"
        return result
    try:
        value = strict_json(raw)
    except (ValueError, TypeError):
        result.update(json_valid=False, repair_eligible=True, next_action="format_repair")
        return result
    result.update(json_valid=True, parsed=value)
    errors = list(validator.iter_errors(value))
    result["schema_valid"] = not errors
    if errors:
        result.update(errors=[{"validator": e.validator, "path": list(e.path), "message": e.message}
                              for e in errors], repair_eligible=True, next_action="format_repair")
        return result
    issues = []
    if value["action_text"] is None and len(value) != 1:
        issues.append("null_action_with_other_properties")
    for key, item in value.items():
        if isinstance(item, str):
            if not item.strip():
                issues.append(key + ":whitespace_only")
            if item.strip() == "null":
                issues.append(key + ":literal_null_placeholder")
            if item not in note:
                issues.append(key + ":not_contiguous_input_span")
    optional_nulls = [k for k, v in value.items() if k != "action_text" and v is None]
    result.update(policy_valid=not issues, errors=issues, optional_nulls=optional_nulls)
    if issues:
        result["next_action"] = "human_review_or_clarification"
    else:
        result["normalized"] = {k: v for k, v in value.items() if k not in optional_nulls}
        result["next_action"] = "clarification" if value["action_text"] is None else "human_confirmation"
    return result


def make_request(runtime, schema, note, model, output_tokens, repair=False):
    messages = [{"role": "system", "content": runtime},
                {"role": "system", "content": "Separate JSON output contract:\n" + dumps(schema)}]
    if repair:
        messages.append({"role": "system", "content": (
            "The previous attempt failed JSON syntax, schema validation, or was truncated. "
            "Make one format-repair attempt using only the same note and contract. "
            "Do not add facts or resolve missing information by guessing.")})
    messages.append({"role": "user", "content": note})
    return {"model": model, "messages": messages, "response_format": {"type": "json_object"},
            "max_completion_tokens": output_tokens, "temperature": 0, "n": 1, "store": False}


class Budget:
    def __init__(self, calls, total_output_tokens, seconds, clock=time.monotonic):
        self.max_calls = calls
        self.total_output_tokens = total_output_tokens
        self.clock = clock
        self.deadline = clock() + seconds
        self.calls = 0
        self.reserved_output_tokens = 0

    def remaining(self):
        return max(0, self.deadline - self.clock())

    def reserve(self, tokens):
        if (not self.remaining() or self.calls >= self.max_calls or
                self.reserved_output_tokens + tokens > self.total_output_tokens):
            return False
        self.calls += 1
        # Charge the full cap even on failures/unknown usage; never refund it.
        self.reserved_output_tokens += tokens
        return True


def response_status(response):
    if response.get("error"):
        return "api_error", None
    try:
        choices = response["choices"]
        require(len(choices) == 1, "Expected one choice")
        choice = choices[0]
        message = choice["message"]
        if message.get("refusal"):
            return "refusal", message.get("content")
        if message.get("tool_calls") or message.get("function_call"):
            return "unexpected_tool_call", message.get("content")
        return choice["finish_reason"], message.get("content")
    except (KeyError, TypeError, ValueError, AttributeError, IndexError):
        return "invalid_response_envelope", None


def run_case(case, runtime, schema, validator, model, tokens, budget, send, record):
    attempts = []
    outcome = {"case_id": case["id"], "note": case["note"], "attempts": attempts,
               "status": "not_run", "human_semantic_review": dict(REVIEW), "scope": SCOPE}
    for index in range(2):
        if not budget.reserve(tokens):
            outcome["status"] = "stopped_budget_before_repair" if index else "not_run_budget"
            break
        request = make_request(runtime, schema, case["note"], model, tokens, repair=index == 1)
        # Persist request before I/O, so interruption never hides a dispatched request.
        record(f"{case['id']}-{index}-request", {"method": "POST", "url": ENDPOINT,
               "body": request, "authorization": "Bearer [not logged]"})
        started = time.monotonic()
        response = send(request, budget.remaining())
        elapsed = time.monotonic() - started
        status, raw = response_status(response["body"]) if response["status"] == "ok" else (response["status"], None)
        validation = validate_output(raw, case["note"], validator, status)
        attempt = {"index": index, "is_repair": index == 1, "response": response,
                   "raw_model_output": raw, "latency_seconds": elapsed,
                   "model_id": response.get("body", {}).get("model"),
                   "usage": response.get("body", {}).get("usage"),
                   "usage_missing_reason": None if response.get("body", {}).get("usage") else "No API usage supplied.",
                   "validation": validation}
        attempts.append(attempt)
        record(f"{case['id']}-{index}-response", attempt)
        outcome["status"] = validation["next_action"]
        if not validation["repair_eligible"]:
            break
        if index == 1:
            outcome["status"] = "stopped_format_repair_exhausted"
    outcome["retries"] = max(0, len(attempts) - 1)
    return outcome


def http_send(request_body, key, timeout):
    # Stdlib only: no SDK retries. Disable redirects as well as automatic retries.
    import urllib.error
    import urllib.request

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    def expired(signum, frame):
        raise TimeoutError("Request deadline exceeded")

    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, timeout)
    started = time.monotonic()
    try:
        payload = dumps(request_body).encode("utf-8")
        request = urllib.request.Request(ENDPOINT, data=payload, method="POST", headers={
            "Authorization": "Bearer " + key, "Content-Type": "application/json"})
        try:
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=timeout) as response:
                raw = response.read().decode("utf-8")
                code = response.status
        except urllib.error.HTTPError as exc:
            return {"status": "http_error", "http_status": exc.code,
                    "raw_http_body": exc.read().decode("utf-8", errors="replace"), "body": {}}
        try:
            body = strict_json(raw)
            require(isinstance(body, dict), "API envelope must be an object")
        except ValueError:
            return {"status": "invalid_response_envelope", "raw_http_body": raw, "body": {}}
        return {"status": "ok", "http_status": code, "raw_http_body": raw, "body": body}
    except (TimeoutError, OSError, urllib.error.URLError, UnicodeError) as exc:
        # Exception text may include configuration details; log only its type.
        return {"status": "transport_error", "error_type": type(exc).__name__, "body": {},
                "elapsed_seconds": time.monotonic() - started}
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def offline_checks(runtime, schema, validator, cases):
    checks = []

    def check(name, condition, detail=None):
        checks.append({"name": name, "passed": bool(condition), "detail": detail})

    check("contract_load_meta_validation_property_match", True)
    for case in cases[:2]:
        raw = dumps(case["reference_output"])
        result = validate_output(raw, case["note"], validator)
        check("runtime_example_" + case["id"], result["schema_valid"] and result["policy_valid"],
              {"input": case["note"], "validator_fixture": raw, "validation": result})
    fixtures = [
        ("missing_action", {}, "schema", "표 2 확인"),
        ("empty_action", {"action_text": ""}, "schema", "표 2 확인"),
        ("numeric_action", {"action_text": 42}, "schema", "표 2 확인"),
        ("extra_intent", {"action_text": "표 2 확인", "intent": "resume"}, "schema", "표 2 확인"),
        ("numeric_deadline", {"action_text": "표 2 확인", "deadline_text": 42}, "schema", "표 2 확인"),
        ("null_clarification", {"action_text": None}, "clarification", "지난번 하던 거 이어갈래."),
        ("whitespace", {"action_text": "   "}, "policy", "   "),
        ("null_with_deadline", {"action_text": None, "deadline_text": "내일"}, "policy", "내일"),
        ("literal_null", {"action_text": "null"}, "policy", "null"),
        ("invented_progress", {"action_text": "표 2 확인", "progress_text": "완료"}, "policy", "표 2 확인은 아직 시작하지 않았어"),
        ("optional_null", {"action_text": "표 2 확인", "progress_text": None}, "normalize", "표 2 확인"),
        ("wrong_attribution", {"action_text": "표 2 확인", "progress_text": "완료"}, "human", "논문 읽기는 완료. 표 2 확인은 아직 시작하지 않았어."),
    ]
    for name, value, expected, note in fixtures:
        raw = dumps(value)
        result = validate_output(raw, note, validator)
        passed = {
            "schema": result["schema_valid"] is False,
            "policy": result["schema_valid"] is True and result["policy_valid"] is False,
            "clarification": result["next_action"] == "clarification",
            "normalize": result["normalized"] == {"action_text": "표 2 확인"} and value.get("progress_text") is None,
            "human": result["policy_valid"] is True and result["human_semantic_review"]["verdict"] is None,
        }[expected]
        check(name, passed, {"input": note, "validator_fixture": raw, "validation": result,
                            "limitation": "Wrong attribution passes substring checks; a human must reject it." if expected == "human" else None})
    for name, raw in [("malformed_json", '{"action_text":'), ("duplicate_key", '{"action_text":null,"action_text":"x"}'),
                      ("non_json_constant", '{"action_text":NaN}')]:
        result = validate_output(raw, "", validator)
        check(name, result["json_valid"] is False, {"validator_fixture": raw, "validation": result})
    for name, text in [
        ("missing", "x"), ("duplicate", "<!-- prompt:start -->\n<!-- prompt:start -->\nx\n<!-- prompt:end -->"),
        ("duplicate_end", "<!-- prompt:start -->\nx\n<!-- prompt:end -->\n<!-- prompt:end -->"),
        ("reversed", "<!-- prompt:end -->\nx\n<!-- prompt:start -->"),
        ("inline", "prefix <!-- prompt:start -->\nx\n<!-- prompt:end -->"),
    ]:
        try:
            extract_runtime(text)
            rejected = False
        except ValueError:
            rejected = True
        check("markers_" + name, rejected)

    def fake_response(raw='{"action_text":null}', status="stop", refusal=None):
        return {"status": "ok", "body": {"choices": [{"finish_reason": status,
                "message": {"content": raw, "refusal": refusal}}]}}

    scenarios = [
        ("repair_once", [fake_response("{"), fake_response()], 2, 1024, "clarification", 2),
        ("truncation_repair", [fake_response("{", "length"), fake_response()], 2, 1024, "clarification", 2),
        ("schema_repair", [fake_response('{}'), fake_response()], 2, 1024, "clarification", 2),
        ("repair_limit", [fake_response("{"), fake_response("{")], 2, 1024, "stopped_format_repair_exhausted", 2),
        ("call_budget", [fake_response("{")], 1, 1024, "stopped_budget_before_repair", 1),
        ("token_budget", [fake_response("{")], 2, 512, "stopped_budget_before_repair", 1),
        ("null_no_retry", [fake_response()], 2, 1024, "clarification", 1),
        ("refusal_no_retry", [fake_response(refusal="synthetic refusal")], 2, 1024, "stop", 1),
        ("policy_no_retry", [fake_response('{"action_text":"   "}')], 2, 1024, "human_review_or_clarification", 1),
        ("auth_no_retry", [{"status": "http_error", "http_status": 401, "body": {}}], 2, 1024, "stop", 1),
        ("filter_no_retry", [fake_response(status="content_filter")], 2, 1024, "stop", 1),
        ("transport_no_retry", [{"status": "transport_error", "body": {}}], 2, 1024, "stop", 1),
        ("envelope_no_retry", [{"status": "ok", "body": {"choices": [{"message": [], "finish_reason": "stop"}]}}], 2, 1024, "stop", 1),
    ]
    for name, responses, calls, token_cap, expected, count in scenarios:
        recorded = {}
        queue = iter(responses)
        result = run_case(cases[1], runtime, schema, validator, MODELS[0], 512,
                          Budget(calls, token_cap, 10), lambda *_: next(queue), recorded.__setitem__)
        check(name, result["status"] == expected and len(result["attempts"]) == count,
              {"kind": "synthetic control-flow fixture, not model evidence", "result": result})
    now = [0]
    budget = Budget(2, 1024, 1, clock=lambda: now[0])
    now[0] = 2
    check("time_budget", not budget.reserve(512))
    configured = argparse.Namespace(provider="openai", model=MODELS[0], cases_reviewed=True)
    check("missing_credential_blocked", configuration(configured, {})["status"] == "BLOCKED")
    check("custom_endpoint_blocked", configuration(configured, {
        "OPENAI_API_KEY": "synthetic-not-a-credential", "OPENAI_BASE_URL": "https://example.invalid"
    })["status"] == "BLOCKED")
    configured.cases_reviewed = False
    check("unreviewed_cases_blocked", configuration(configured, {
        "OPENAI_API_KEY": "synthetic-not-a-credential"
    })["status"] == "BLOCKED")
    for case in cases:
        request = make_request(runtime, schema, case["note"], MODELS[0], 512)
        check("request_isolation_" + case["id"],
              request["messages"] == [{"role": "system", "content": runtime},
                  {"role": "system", "content": "Separate JSON output contract:\n" + dumps(schema)},
                  {"role": "user", "content": case["note"]}]
              and request["response_format"] == {"type": "json_object"})
    return checks


def git(*args):
    try:
        result = subprocess.run(["git", "--no-optional-locks", *args], cwd=ROOT,
                                text=True, capture_output=True, timeout=5)
        return result.stdout.rstrip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def sha(data):
    return hashlib.sha256(data).hexdigest()


def configuration(args, env):
    missing = []
    if args.provider != "openai":
        missing.append("Explicit --provider openai required")
    if args.model not in MODELS:
        missing.append("Explicit supported --model required")
    if not env.get("OPENAI_API_KEY", "").strip():
        missing.append("OPENAI_API_KEY is unset")
    if env.get("OPENAI_BASE_URL", "").rstrip("/") not in ("", "https://api.openai.com/v1"):
        missing.append("Custom OPENAI_BASE_URL is not supported by this verified adapter")
    if not args.cases_reviewed:
        missing.append("Human review of all eight notes/expectations must be acknowledged with --cases-reviewed")
    if not hasattr(signal, "setitimer"):
        missing.append("POSIX setitimer required for hard request deadlines")
    return {"status": "BLOCKED" if missing else "configured_not_verified", "reasons": missing,
            "credential_present": bool(env.get("OPENAI_API_KEY", "").strip()),
            "provider": args.provider, "model": args.model,
            "endpoint": ENDPOINT, "account_model_access": "not verified"}


def positive(value):
    number = float(value)
    if not math.isfinite(number) or number <= 0:
        raise argparse.ArgumentTypeError("must be finite and positive")
    return number


def cli(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--offline", action="store_true", help="default: no model/network calls")
    modes.add_argument("--live", action="store_true", help="explicitly authorize bounded API requests")
    parser.add_argument("--provider", choices=["openai"])
    parser.add_argument("--model", choices=MODELS)
    parser.add_argument("--cases-reviewed", action="store_true", help="operator affirms review; not a fabricated approval record")
    parser.add_argument("--max-calls", type=int, default=16)
    parser.add_argument("--max-output-tokens", type=int, default=512)
    parser.add_argument("--max-total-output-tokens", type=int, default=8192)
    parser.add_argument("--max-seconds", type=positive, default=180)
    parser.add_argument("--request-timeout", type=positive, default=20)
    args = parser.parse_args(argv)
    for key, limit in [("max_calls", 16), ("max_output_tokens", 2048), ("max_total_output_tokens", 32768)]:
        if not 0 < getattr(args, key) <= limit:
            parser.error(f"{key} must be between 1 and {limit}")
    return args


def main():
    args = cli()
    text, runtime, schema, validator = load_contract()
    cases = prepare_cases(text, runtime)
    mode = "live" if args.live else "offline"
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + "-" + mode + "-" + uuid4().hex[:8]
    directory = ROOT / "evals/results/next_action_parser" / run_id
    directory.mkdir(parents=True, exist_ok=False)

    def record(name, value):
        with (directory / (name + ".json")).open("x", encoding="utf-8") as stream:
            stream.write(dumps(value) + "\n")

    config = configuration(args, os.environ)
    metadata = {"run_id": run_id, "mode": mode, "command": shlex.join(["python3", "-B", *sys.argv]),
                "python": platform.python_version(), "platform": platform.platform(),
                "validators": {p: importlib.metadata.version(p) for p in ("jsonschema", "PyYAML")},
                "prompt_version": "sha256:" + sha(runtime.encode()),
                "file_hashes": {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in (PROMPT, SCHEMA, ONTOLOGY, Path(__file__).resolve())},
                "schema_git_commit": git("log", "-1", "--format=%H", "--", str(SCHEMA.relative_to(ROOT))) or None,
                "schema_commit_note": "Last commit touching this path, if tracked; hashes identify actual working files.",
                "git_head": git("rev-parse", "HEAD"), "dirty_file_status": git("status", "--short"),
                "configuration": config, "settings": vars(args), "scope": SCOPE,
                "model_cost": None, "model_cost_reason": "Not measured; no pricing calculation.",
                "human_semantic_review": dict(REVIEW),
                "cases_review_acknowledged_by_operator": args.cases_reviewed,
                "approval_record": None, "approval_record_reason": "No external approval record supplied.",
                "sdk_retries": 0, "transport_retries": 0,
                "token_budget_scope": "Generated tokens only; full per-call cap reserved before every dispatch, including repairs/errors.",
                "input_token_count": None, "input_token_count_reason": "No tokenizer installed; exact fixed request bodies recorded, not estimated token counts.",
                "maximum_request_body_bytes": max(len(dumps(make_request(runtime, schema, c["note"], args.model or MODELS[0],
                    args.max_output_tokens, repair=True)).encode("utf-8")) for c in cases)}
    record("metadata", metadata)
    record("cases", {"kind": "development/regression; not untouched holdout", "cases": cases,
                     "human_semantic_review": dict(REVIEW), "scope": SCOPE})
    print(SCOPE)
    if not args.live:
        checks = offline_checks(runtime, schema, validator, cases)
        passed = sum(c["passed"] for c in checks)
        record("offline", {"checks": checks, "passed": passed, "total": len(checks),
                           "live_calls": 0, "live_cases_status": "NOT_RUN", "configuration": config,
                           "model_usage": None, "model_latency": None,
                           "unavailable_reason": "Offline mode: no product model invoked."})
        print(f"OFFLINE: {passed}/{len(checks)} checks passed; live calls: 0")
        print("Live readiness: " + config["status"] + "; " + "; ".join(config["reasons"]))
        print("Artifacts: " + str(directory.relative_to(ROOT)))
        return 0 if passed == len(checks) else 1
    if config["status"] == "BLOCKED":
        record("summary", {"status": "BLOCKED", "live_calls": 0, "reasons": config["reasons"],
                           "cases": [{"id": c["id"], "status": "NOT_RUN"} for c in cases]})
        print("BLOCKED: " + "; ".join(config["reasons"]))
        print("Artifacts: " + str(directory.relative_to(ROOT)))
        return 2
    budget = Budget(args.max_calls, args.max_total_output_tokens, args.max_seconds)
    results = []
    for case in cases:
        result = run_case(case, runtime, schema, validator, args.model, args.max_output_tokens, budget,
                          lambda request, remaining: http_send(request, os.environ["OPENAI_API_KEY"],
                                                               min(remaining, args.request_timeout)), record)
        results.append(result)
        record(case["id"] + "-result", result)
        print(case["id"] + ": " + result["status"])
        if result["attempts"] and result["attempts"][-1]["response"]["status"] != "ok":
            # Stop the run after an HTTP/transport/configuration error; preserve unrun cases.
            for unrun in cases[len(results):]:
                results.append({"case_id": unrun["id"], "status": "NOT_RUN_after_API_error"})
            break
    record("summary", {"status": "human_review_required", "live_calls": budget.calls,
                       "reserved_output_tokens": budget.reserved_output_tokens, "cases": results,
                       "human_semantic_review": dict(REVIEW), "scope": SCOPE})
    print("Artifacts: " + str(directory.relative_to(ROOT)))
    return 0 if all(r["status"] in ("human_confirmation", "clarification") for r in results) else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError, KeyError) as exc:
        print("BLOCKED: " + str(exc), file=sys.stderr)
        sys.exit(2)
