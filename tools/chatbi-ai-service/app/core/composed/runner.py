from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.core.composed.analysis_pipeline import run_analysis_pipeline
from app.core.composed.conversation import run_conversation
from app.core.composed.router import route_request


SUPPORTED_FLOW_TYPES = {"router", "analysis_pipeline", "multi_source", "conversation"}


def composed_eval_root() -> Path:
  return Path(__file__).resolve().parents[3] / "evals" / "composed"


def load_composed_cases(flow_type: str | None = None, case_id: str | None = None, tags: list[str] | None = None) -> list[dict[str, Any]]:
  root = composed_eval_root()
  if case_id:
    cases = _load_case_by_id(root, case_id)
  elif flow_type:
    if flow_type not in SUPPORTED_FLOW_TYPES:
      raise SystemExit(f"unsupported composed flow type: {flow_type}")
    cases = _load_cases_from_dir(root / flow_type)
  else:
    cases = []
    for flow_dir in sorted(path for path in root.iterdir() if path.is_dir() and path.name in SUPPORTED_FLOW_TYPES):
      cases.extend(_load_cases_from_dir(flow_dir))
  if tags:
    tag_filter = {item.strip().lower() for item in tags if item and item.strip()}
    cases = [case for case in cases if _case_matches_tags(case, tag_filter)]
  return sorted(cases, key=lambda item: (item["flowType"], item["id"]))


def run_composed_eval(*, flow_type: str | None = None, case_id: str | None = None, tags: list[str] | None = None) -> dict[str, Any]:
  cases = load_composed_cases(flow_type=flow_type, case_id=case_id, tags=tags)
  if not cases:
    raise SystemExit("no composed eval cases found")

  results: list[dict[str, Any]] = []
  for case in cases:
    started_at = time.perf_counter()
    actual = _execute_case(case)
    latency_ms = round((time.perf_counter() - started_at) * 1000)
    scoring = _score_composed_case(case, actual)
    passed = scoring["total"] >= scoring["minimumPassScore"]
    results.append(
      {
        "caseId": case["id"],
        "flowType": case["flowType"],
        "title": case["title"],
        "latencyMs": latency_ms,
        "result": actual,
        "score": scoring,
        "passed": passed,
      }
    )
  return _build_summary(results)


def _execute_case(case: dict[str, Any]) -> dict[str, Any]:
  flow_type = case["flowType"]
  payload = case["input"]
  if flow_type == "router":
    return {"router": route_request(payload)}
  if flow_type == "analysis_pipeline":
    return run_analysis_pipeline(payload)
  if flow_type == "multi_source":
    return run_analysis_pipeline(payload)
  if flow_type == "conversation":
    return run_conversation(payload)
  raise SystemExit(f"unsupported composed flow type: {flow_type}")


def _score_composed_case(case: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
  flow_type = case["flowType"]
  expect = case.get("expect", {})
  weights = case.get("score", {}).get("weights", {})
  failures: list[str] = []
  dimension_scores = {
    "router": 1.0,
    "planning": 1.0,
    "execution": 1.0,
    "summary": 1.0,
    "memory": 1.0,
    "scene_switch": 1.0,
  }

  if flow_type == "router":
    router_score, router_failures = _score_router(expect.get("router") or {}, actual.get("router") or {})
    dimension_scores["router"] = router_score
    failures.extend(router_failures)
  elif flow_type in {"analysis_pipeline", "multi_source"}:
    router_score, router_failures = _score_router(expect.get("router") or {}, actual.get("router") or {})
    plan_score, plan_failures = _score_plan(expect.get("plan") or {}, actual.get("plan") or {})
    execution_score, execution_failures = _score_execution(expect.get("execution") or {}, actual.get("execution") or {})
    summary_score, summary_failures = _score_summary(expect.get("summary") or {}, actual.get("summary") or {})
    dimension_scores["router"] = router_score
    dimension_scores["planning"] = plan_score
    dimension_scores["execution"] = execution_score
    dimension_scores["summary"] = summary_score
    failures.extend(router_failures + plan_failures + execution_failures + summary_failures)
  elif flow_type == "conversation":
    router_score, memory_score, scene_switch_score, conversation_failures = _score_conversation(expect.get("turns") or [], actual.get("turns") or [])
    dimension_scores["router"] = router_score
    dimension_scores["memory"] = memory_score
    dimension_scores["scene_switch"] = scene_switch_score
    failures.extend(conversation_failures)

  total_weight = sum(float(weights.get(name, 0)) for name in dimension_scores)
  total_score = 0.0 if total_weight <= 0 else sum(dimension_scores[name] * float(weights.get(name, 0)) for name in dimension_scores) / total_weight
  return {
    "router": round(dimension_scores["router"], 4),
    "planning": round(dimension_scores["planning"], 4),
    "execution": round(dimension_scores["execution"], 4),
    "summary": round(dimension_scores["summary"], 4),
    "memory": round(dimension_scores["memory"], 4),
    "scene_switch": round(dimension_scores["scene_switch"], 4),
    "total": round(total_score, 4),
    "minimumPassScore": float(case.get("score", {}).get("minimumPassScore", 0)),
    "failures": sorted(set(failures)),
  }


def _score_router(expect_router: dict[str, Any], actual_router: dict[str, Any]) -> tuple[float, list[str]]:
  scores: list[float] = []
  failures: list[str] = []
  if "intent" in expect_router:
    match = actual_router.get("intent") == expect_router["intent"]
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("wrong_intent")
  if "scene" in expect_router:
    match = actual_router.get("scene") == expect_router["scene"]
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("wrong_scene")
  if "resolvedObjectIds" in expect_router:
    actual_ids = set(actual_router.get("resolvedObjectIds") or [])
    expected_ids = set(expect_router["resolvedObjectIds"])
    scores.append(_ratio(sum(1 for item in expected_ids if item in actual_ids), len(expected_ids)))
    if not expected_ids.issubset(actual_ids):
      failures.append("wrong_object_resolution")
  if "needsClarification" in expect_router:
    match = bool(actual_router.get("needsClarification")) == bool(expect_router["needsClarification"])
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("wrong_clarification_state")
  return _average(scores), failures


def _score_plan(expect_plan: dict[str, Any], actual_plan: dict[str, Any]) -> tuple[float, list[str]]:
  scores: list[float] = []
  failures: list[str] = []
  actual_mode = actual_plan.get("analysisMode")
  if "analysisMode" in expect_plan:
    match = actual_mode == expect_plan["analysisMode"]
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("wrong_analysis_mode")
  if "analysisModeIn" in expect_plan:
    allowed_modes = set(expect_plan["analysisModeIn"])
    match = actual_mode in allowed_modes
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("wrong_analysis_mode")

  actual_sources = {item.get("sourceId") for item in actual_plan.get("sources") or [] if item.get("sourceId")}
  required_sources = set(expect_plan.get("mustUseSources") or [])
  if required_sources:
    scores.append(_ratio(sum(1 for item in required_sources if item in actual_sources), len(required_sources)))
    if not required_sources.issubset(actual_sources):
      failures.append("missing_source")

  actual_ops = [item.get("op") for item in actual_plan.get("steps") or [] if item.get("op")]
  actual_op_set = set(actual_ops)
  required_ops = set(expect_plan.get("mustContainOps") or [])
  if required_ops:
    scores.append(_ratio(sum(1 for item in required_ops if item in actual_op_set), len(required_ops)))
    if not required_ops.issubset(actual_op_set):
      failures.append("missing_operator")

  forbidden_ops = set(expect_plan.get("mustNotContainOps") or [])
  if forbidden_ops:
    match = actual_op_set.isdisjoint(forbidden_ops)
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("forbidden_operator")

  if expect_plan.get("mustNotContainUnsafeJoin"):
    join_steps = [step for step in actual_plan.get("steps") or [] if step.get("op") == "join_sources"]
    if not join_steps:
      scores.append(1.0)
    else:
      allowed_join_keys = set(expect_plan.get("allowedJoinKeys") or [])
      safe = True
      for step in join_steps:
        params = step.get("params") or {}
        left_key = set(params.get("leftKey") or [])
        right_key = set(params.get("rightKey") or [])
        if not left_key or not right_key or not left_key.issubset(allowed_join_keys) or not right_key.issubset(allowed_join_keys):
          safe = False
      scores.append(1.0 if safe else 0.0)
      if not safe:
        failures.append("unsafe_join")
  return _average(scores), failures


def _score_execution(expect_execution: dict[str, Any], actual_execution: dict[str, Any]) -> tuple[float, list[str]]:
  scores: list[float] = []
  failures: list[str] = []
  if "status" in expect_execution:
    match = actual_execution.get("status") == expect_execution["status"]
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("wrong_execution_status")
  if "mustHaveTables" in expect_execution:
    actual_tables = {item.get("name") for item in actual_execution.get("resultTables") or [] if item.get("name")}
    expected_tables = set(expect_execution["mustHaveTables"])
    scores.append(_ratio(sum(1 for item in expected_tables if item in actual_tables), len(expected_tables)))
    if not expected_tables.issubset(actual_tables):
      failures.append("missing_result_table")
  if "mustExposeStats" in expect_execution:
    actual_stats = set((actual_execution.get("stats") or {}).keys())
    expected_stats = set(expect_execution["mustExposeStats"])
    scores.append(_ratio(sum(1 for item in expected_stats if item in actual_stats), len(expected_stats)))
    if not expected_stats.issubset(actual_stats):
      failures.append("missing_execution_stat")
  return _average(scores), failures


def _score_summary(expect_summary: dict[str, Any], actual_summary: dict[str, Any]) -> tuple[float, list[str]]:
  scores: list[float] = []
  failures: list[str] = []
  if "mustHaveFields" in expect_summary:
    fields = expect_summary["mustHaveFields"]
    scores.append(_ratio(sum(1 for field in fields if actual_summary.get(field)), len(fields)))
    if any(not actual_summary.get(field) for field in fields):
      failures.append("missing_summary_field")
  if "mustMentionAny" in expect_summary:
    text = _collect_text(actual_summary)
    expected_tokens = expect_summary["mustMentionAny"]
    match = any(token in text for token in expected_tokens)
    scores.append(1.0 if match else 0.0)
    if not match:
      failures.append("missing_summary_keyword")
  return _average(scores), failures


def _score_conversation(expect_turns: list[dict[str, Any]], actual_turns: list[dict[str, Any]]) -> tuple[float, float, float, list[str]]:
  failures: list[str] = []
  if not expect_turns:
    return 1.0, 1.0, 1.0, failures

  router_scores: list[float] = []
  memory_scores: list[float] = []
  expected_scene_sequence: list[str] = []
  actual_scene_sequence: list[str] = []

  for index, expected_turn in enumerate(expect_turns):
    actual_turn = actual_turns[index] if index < len(actual_turns) else {}
    turn_router_score, turn_failures = _score_router(expected_turn, actual_turn)
    router_scores.append(turn_router_score)
    failures.extend(f"{failure}_turn_{index + 1}" for failure in turn_failures)

    expected_ids = list(expected_turn.get("resolvedObjectIds") or [])
    actual_ids = list(actual_turn.get("resolvedObjectIds") or [])
    if expected_ids:
      memory_scores.append(1.0 if expected_ids == actual_ids else 0.0)
      if expected_ids != actual_ids:
        failures.append(f"memory_resolution_mismatch_turn_{index + 1}")

    if expected_turn.get("scene"):
      expected_scene_sequence.append(expected_turn["scene"])
      actual_scene_sequence.append(actual_turn.get("scene"))

  scene_switch_score = 1.0 if expected_scene_sequence == actual_scene_sequence else 0.0
  if expected_scene_sequence != actual_scene_sequence:
    failures.append("wrong_scene_sequence")

  return _average(router_scores), _average(memory_scores), scene_switch_score, failures


def _collect_text(payload: dict[str, Any]) -> str:
  values: list[str] = []
  for key in ("headline", "conclusion", "summary"):
    value = payload.get(key)
    if value:
      values.append(str(value))
  for key in ("evidence", "advice", "insights"):
    value = payload.get(key)
    if isinstance(value, list):
      values.extend(str(item) for item in value if item)
  return " ".join(values)


def _average(scores: list[float]) -> float:
  if not scores:
    return 1.0
  return sum(scores) / len(scores)


def _ratio(hit_count: int, total_count: int) -> float:
  if total_count <= 0:
    return 1.0
  return hit_count / total_count


def _load_case_by_id(root: Path, case_id: str) -> list[dict[str, Any]]:
  for flow_dir in sorted(path for path in root.iterdir() if path.is_dir()):
    for file_path in sorted(flow_dir.glob("*.json")):
      payload = json.loads(file_path.read_text(encoding="utf-8"))
      if payload.get("id") == case_id:
        if payload.get("flowType") not in SUPPORTED_FLOW_TYPES:
          raise SystemExit(f"unsupported composed flow type for case: {payload.get('flowType')}")
        return [payload]
  raise SystemExit(f"composed eval case not found: {case_id}")


def _load_cases_from_dir(flow_dir: Path) -> list[dict[str, Any]]:
  if not flow_dir.exists():
    raise SystemExit(f"composed flow not found: {flow_dir.name}")
  return [json.loads(file_path.read_text(encoding="utf-8")) for file_path in sorted(flow_dir.glob("*.json"))]


def _case_matches_tags(case: dict[str, Any], tag_filter: set[str]) -> bool:
  if not tag_filter:
    return True
  case_tags = {str(item).strip().lower() for item in case.get("tags", []) if str(item).strip()}
  return bool(case_tags & tag_filter)


def _build_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
  flow_names = sorted({item["flowType"] for item in results})
  flows: list[dict[str, Any]] = []
  for flow_name in flow_names:
    flow_results = [item for item in results if item["flowType"] == flow_name]
    pass_count = sum(1 for item in flow_results if item["passed"])
    avg_latency_ms = round(sum(item["latencyMs"] for item in flow_results) / len(flow_results), 2)
    avg_score = round(sum(item["score"]["total"] for item in flow_results) / len(flow_results), 4)
    flows.append(
      {
        "flowType": flow_name,
        "caseCount": len(flow_results),
        "passCount": pass_count,
        "passRate": round(pass_count / len(flow_results), 4),
        "avgLatencyMs": avg_latency_ms,
        "avgScore": avg_score,
      }
    )
  pass_count = sum(1 for item in results if item["passed"])
  return {
    "mode": "composed",
    "supportedFlowTypes": sorted(SUPPORTED_FLOW_TYPES),
    "caseCount": len(results),
    "passCount": pass_count,
    "passRate": round(pass_count / len(results), 4),
    "avgLatencyMs": round(sum(item["latencyMs"] for item in results) / len(results), 2),
    "avgScore": round(sum(item["score"]["total"] for item in results) / len(results), 4),
    "flows": flows,
    "results": results,
  }
