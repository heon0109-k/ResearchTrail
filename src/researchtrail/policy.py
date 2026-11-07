"""NextAction structure and span checks. Semantic attribution still needs human review."""

import json

SCOPE = ("This experiment only records proposed tasks; it does not perform research, "
         "send mail, set reminders, or save established NextAction objects.")
REVIEW = {"verdict": None, "reason": "Human semantic review not performed."}


def require(condition, message):
    if not condition:
        raise ValueError(message)


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
