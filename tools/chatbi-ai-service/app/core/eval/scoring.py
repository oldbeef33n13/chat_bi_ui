from __future__ import annotations

from typing import Any


def score_eval_case(case: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
  expect = case.get("expect", {})
  weights = case.get("score", {}).get("weights", {})
  failures: list[str] = []

  structure = _score_structure(case["scene"], result)
  semantic, semantic_failures = _score_semantic(case["scene"], expect, result)
  expression = _score_expression(case["scene"], result)
  failures.extend(semantic_failures)

  if result.get("source") == "rule" and not expect.get("allowFallback", False):
    failures.append("fallback_not_allowed")

  dimension_scores = {
    "structure": structure,
    "semantic": semantic,
    "expression": expression,
  }
  total_weight = sum(float(weights.get(name, 0)) for name in dimension_scores)
  total_score = 0.0 if total_weight <= 0 else sum(dimension_scores[name] * float(weights.get(name, 0)) for name in dimension_scores) / total_weight

  return {
    "structure": round(structure, 4),
    "semantic": round(semantic, 4),
    "expression": round(expression, 4),
    "total": round(total_score, 4),
    "minimumPassScore": float(case.get("score", {}).get("minimumPassScore", 0)),
    "failures": sorted(set(failures)),
  }


def _score_structure(scene: str, result: dict[str, Any]) -> float:
  checks: list[bool] = []
  if scene == "command_plan":
    plan = result.get("plan") or {}
    checks.extend([bool(plan), bool(plan.get("targets")), bool(plan.get("commands"))])
  elif scene == "chart_recommend":
    checks.extend([bool(result.get("chartType")), bool(result.get("bindings")), bool(result.get("reasons"))])
  elif scene == "chart_ask":
    checks.extend([bool(result.get("answer")), bool(result.get("suggestions"))])
  elif scene == "data_guide":
    checks.extend([bool(result.get("summary")), bool(result.get("parameterGuide")), bool(result.get("fieldGuide"))])
  elif scene == "story_summary":
    checks.extend([bool(result.get("headline")), bool(result.get("conclusion")), bool(result.get("evidence")), bool(result.get("advice"))])
  return _ratio(sum(1 for item in checks if item), len(checks))


def _score_semantic(scene: str, expect: dict[str, Any], result: dict[str, Any]) -> tuple[float, list[str]]:
  scores: list[float] = []
  failures: list[str] = []

  if scene == "command_plan":
    plan = result.get("plan") or {}
    command_types = {item.get("type") for item in plan.get("commands", []) if isinstance(item, dict)}
    targets = set(plan.get("targets") or [])
    prop_keys = {
      key
      for item in plan.get("commands", [])
      if isinstance(item, dict)
      for key in (item.get("props") or {}).keys()
    }
    expected_types = expect.get("mustHaveCommandTypes") or []
    expected_targets = expect.get("mustTargetIds") or []
    expected_props = expect.get("shouldContainProps") or []
    scores.append(_set_coverage(expected_types, command_types))
    scores.append(_set_coverage(expected_targets, targets))
    scores.append(_set_coverage(expected_props, prop_keys))
    if expected_types and not set(expected_types).issubset(command_types):
      failures.append("missing_command_type")
    if expected_targets and not set(expected_targets).issubset(targets):
      failures.append("missing_target")
    if expected_props and not set(expected_props).issubset(prop_keys):
      failures.append("missing_props")

  elif scene == "chart_recommend":
    chart_type = _normalize_chart_type(result.get("chartType"))
    actual_roles = {item.get("role") for item in result.get("bindings", []) if isinstance(item, dict)}
    expected_types = [_normalize_chart_type(item) for item in (expect.get("chartTypeIn") or [])]
    expected_roles = expect.get("mustHaveRoles") or []
    scores.append(1.0 if not expected_types or chart_type in expected_types else 0.0)
    scores.append(_set_coverage(expected_roles, actual_roles))
    if expected_types and chart_type not in expected_types:
      failures.append("wrong_chart_type")
    if expected_roles and not set(expected_roles).issubset(actual_roles):
      failures.append("missing_binding_role")

  elif scene == "chart_ask":
    text = _collect_text(result)
    if expect.get("mustMentionAny"):
      scores.append(1.0 if _contains_any(text, expect["mustMentionAny"]) else 0.0)
      if not _contains_any(text, expect["mustMentionAny"]):
        failures.append("missing_expected_phrase")
    if expect.get("mustHaveSuggestions"):
      has_suggestions = bool(result.get("suggestions"))
      scores.append(1.0 if has_suggestions else 0.0)
      if not has_suggestions:
        failures.append("missing_suggestions")
    if expect.get("mustHavePlan"):
      has_plan = bool(result.get("plan"))
      scores.append(1.0 if has_plan else 0.0)
      if not has_plan:
        failures.append("missing_plan")

  elif scene == "data_guide":
    recommended = set(result.get("recommendedCharts") or [])
    actual_roles = {item.get("role") for item in result.get("fieldGuide", []) if isinstance(item, dict)}
    expected_charts = expect.get("mustHaveRecommendedCharts") or []
    expected_roles = expect.get("mustHaveFieldRoles") or []
    scores.append(_set_coverage(expected_charts, recommended))
    scores.append(_set_coverage(expected_roles, actual_roles))
    if expected_charts and not set(expected_charts).issubset(recommended):
      failures.append("missing_recommended_chart")
    if expected_roles and not set(expected_roles).issubset(actual_roles):
      failures.append("missing_field_role")

  elif scene == "story_summary":
    required_fields = expect.get("mustHaveFields") or []
    text = _collect_text(result)
    scores.append(_ratio(sum(1 for field in required_fields if result.get(field)), len(required_fields)))
    if required_fields and any(not result.get(field) for field in required_fields):
      failures.append("missing_summary_field")
    if expect.get("mustMentionAny"):
      scores.append(1.0 if _contains_any(text, expect["mustMentionAny"]) else 0.0)
      if not _contains_any(text, expect["mustMentionAny"]):
        failures.append("missing_expected_phrase")

  if not scores:
    return 1.0, failures
  return sum(scores) / len(scores), failures


def _score_expression(scene: str, result: dict[str, Any]) -> float:
  if scene == "story_summary":
    checks = [
      len(str(result.get("headline") or "").strip()) >= 4,
      len(str(result.get("conclusion") or "").strip()) >= 8,
      bool(result.get("evidence")),
      bool(result.get("advice")),
    ]
    return _ratio(sum(1 for item in checks if item), len(checks))
  if scene == "chart_ask":
    checks = [
      len(str(result.get("answer") or "").strip()) >= 6,
      bool(result.get("suggestions")),
    ]
    return _ratio(sum(1 for item in checks if item), len(checks))
  if scene == "data_guide":
    checks = [
      len(str(result.get("summary") or "").strip()) >= 8,
      bool(result.get("insights")),
    ]
    return _ratio(sum(1 for item in checks if item), len(checks))
  if scene == "chart_recommend":
    return 1.0 if result.get("reasons") else 0.5
  if scene == "command_plan":
    return 1.0 if result.get("reasoning") else 0.5
  return 1.0


def _set_coverage(expected_values: list[str], actual_values: set[str]) -> float:
  if not expected_values:
    return 1.0
  return _ratio(sum(1 for item in expected_values if item in actual_values), len(expected_values))


def _contains_any(text: str, phrases: list[str]) -> bool:
  lowered = text.lower()
  return any(str(phrase).lower() in lowered for phrase in phrases)


def _collect_text(result: dict[str, Any]) -> str:
  values: list[str] = []
  for key in ("answer", "planSummary", "headline", "conclusion", "summary"):
    value = result.get(key)
    if value:
      values.append(str(value))
  for key in ("suggestions", "evidence", "advice", "insights", "reasons"):
    value = result.get(key)
    if isinstance(value, list):
      values.extend(str(item) for item in value if item)
  return " ".join(values)


def _ratio(hit_count: int, total_count: int) -> float:
  if total_count <= 0:
    return 1.0
  return hit_count / total_count


def _normalize_chart_type(value: Any) -> str:
  lowered = str(value or "").strip().lower()
  aliases = {
    "groupedbar": "bar",
    "clusteredbar": "bar",
    "stackedbar": "bar",
    "column": "bar",
    "groupedcolumn": "bar",
    "area": "line",
    "stackedarea": "line",
    "donut": "pie",
    "doughnut": "pie",
  }
  return aliases.get(lowered, lowered)
