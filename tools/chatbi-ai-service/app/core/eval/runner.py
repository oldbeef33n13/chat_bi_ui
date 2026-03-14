from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from app.core.dispatch import execute_scene
from app.core.eval.scoring import score_eval_case
from app.core.settings import settings


def eval_root() -> Path:
  return Path(__file__).resolve().parents[3] / "evals"


def load_eval_cases(
  scene: str | None = None,
  case_id: str | None = None,
  tags: list[str] | None = None,
) -> list[dict[str, Any]]:
  root = eval_root()
  if case_id:
    cases = _load_case_by_id(root, case_id)
  elif scene:
    cases = _load_cases_from_dir(root / scene)
  else:
    cases = []
    for scene_dir in sorted(path for path in root.iterdir() if path.is_dir()):
      cases.extend(_load_cases_from_dir(scene_dir))
  if tags:
    tag_filter = {item.strip().lower() for item in tags if item and item.strip()}
    cases = [case for case in cases if _case_matches_tags(case, tag_filter)]
  return sorted(cases, key=lambda item: (item["scene"], item["id"]))


def run_eval(
  *,
  scene: str | None = None,
  case_id: str | None = None,
  tags: list[str] | None = None,
  prompt_version: str | None = None,
) -> dict[str, Any]:
  cases = load_eval_cases(scene=scene, case_id=case_id, tags=tags)
  if not cases:
    raise SystemExit("no eval cases found")

  results: list[dict[str, Any]] = []
  for case in cases:
    started_at = time.perf_counter()
    execution, provider, actual_prompt_version = execute_scene(case["scene"], case["input"], prompt_version)
    latency_ms = round((time.perf_counter() - started_at) * 1000)
    scoring = score_eval_case(case, execution.response)
    passed = scoring["total"] >= scoring["minimumPassScore"]
    results.append(
      {
        "caseId": case["id"],
        "scene": case["scene"],
        "title": case["title"],
        "provider": provider,
        "promptVersion": actual_prompt_version,
        "latencyMs": latency_ms,
        "result": execution.response,
        "score": scoring,
        "passed": passed,
        "fallbackUsed": execution.meta.fallback_used,
        "providerAttempted": execution.meta.provider_attempted,
        "providerSucceeded": execution.meta.provider_succeeded,
        "providerOutcome": execution.meta.outcome,
        "partialFallback": execution.meta.partial_fallback,
        "errorType": execution.meta.error_type,
        "errorMessage": execution.meta.error_message,
      }
    )

  return _build_summary(results)


def run_eval_compare(
  *,
  scene: str | None = None,
  case_id: str | None = None,
  tags: list[str] | None = None,
  baseline_prompt_version: str,
  candidate_prompt_version: str,
) -> dict[str, Any]:
  baseline = run_eval(scene=scene, case_id=case_id, tags=tags, prompt_version=baseline_prompt_version)
  candidate = run_eval(scene=scene, case_id=case_id, tags=tags, prompt_version=candidate_prompt_version)
  baseline_results = {item["caseId"]: item for item in baseline["results"]}
  candidate_results = {item["caseId"]: item for item in candidate["results"]}

  compared_results: list[dict[str, Any]] = []
  for case_id_key in sorted(candidate_results):
    base = baseline_results[case_id_key]
    cand = candidate_results[case_id_key]
    compared_results.append(
      {
        "caseId": case_id_key,
        "scene": cand["scene"],
        "title": cand["title"],
        "baseline": {
          "promptVersion": baseline_prompt_version,
          "passed": base["passed"],
          "score": base["score"]["total"],
          "providerSucceeded": base["providerSucceeded"],
          "fallbackUsed": base["fallbackUsed"],
        },
        "candidate": {
          "promptVersion": candidate_prompt_version,
          "passed": cand["passed"],
          "score": cand["score"]["total"],
          "providerSucceeded": cand["providerSucceeded"],
          "fallbackUsed": cand["fallbackUsed"],
        },
        "delta": {
          "score": round(cand["score"]["total"] - base["score"]["total"], 4),
          "passChanged": cand["passed"] != base["passed"],
          "providerSuccessChanged": cand["providerSucceeded"] != base["providerSucceeded"],
        },
      }
    )

  return {
    "mode": "compare",
    "provider": candidate["provider"],
    "model": candidate["model"],
    "scene": scene or "all",
    "caseCount": candidate["caseCount"],
    "baselineVersion": baseline_prompt_version,
    "candidateVersion": candidate_prompt_version,
    "baselineSummary": _summary_snapshot(baseline),
    "candidateSummary": _summary_snapshot(candidate),
    "delta": {
      "passCount": candidate["passCount"] - baseline["passCount"],
      "passRate": round(candidate["passRate"] - baseline["passRate"], 4),
      "avgScore": round(candidate["avgScore"] - baseline["avgScore"], 4),
      "providerSuccessCount": candidate["providerSuccessCount"] - baseline["providerSuccessCount"],
      "fallbackCount": candidate["fallbackCount"] - baseline["fallbackCount"],
    },
    "results": compared_results,
  }


def _load_case_by_id(root: Path, case_id: str) -> list[dict[str, Any]]:
  for scene_dir in sorted(path for path in root.iterdir() if path.is_dir()):
    for file_path in sorted(scene_dir.glob("*.json")):
      payload = json.loads(file_path.read_text(encoding="utf-8"))
      if payload.get("id") == case_id:
        return [payload]
  raise SystemExit(f"eval case not found: {case_id}")


def _load_cases_from_dir(scene_dir: Path) -> list[dict[str, Any]]:
  if not scene_dir.exists():
    raise SystemExit(f"eval scene not found: {scene_dir.name}")
  return [json.loads(file_path.read_text(encoding="utf-8")) for file_path in sorted(scene_dir.glob("*.json"))]


def _case_matches_tags(case: dict[str, Any], tag_filter: set[str]) -> bool:
  if not tag_filter:
    return True
  case_tags = {str(item).strip().lower() for item in case.get("tags", []) if str(item).strip()}
  return bool(case_tags & tag_filter)


def _build_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
  scene_names = sorted({item["scene"] for item in results})
  scenes: list[dict[str, Any]] = []
  for scene_name in scene_names:
    scene_results = [item for item in results if item["scene"] == scene_name]
    scenes.append(_aggregate_scene(scene_name, scene_results))

  providers = sorted({item["provider"] for item in results})
  prompt_versions = sorted({item["promptVersion"] for item in results})
  pass_count = sum(1 for item in results if item["passed"])
  fallback_count = sum(1 for item in results if item["fallbackUsed"])
  provider_attempt_count = sum(1 for item in results if item["providerAttempted"])
  provider_success_count = sum(1 for item in results if item["providerSucceeded"])
  avg_latency_ms = round(sum(item["latencyMs"] for item in results) / len(results), 2)
  avg_score = round(sum(item["score"]["total"] for item in results) / len(results), 4)
  outcome_breakdown: dict[str, int] = {}
  for item in results:
    outcome_breakdown[item["providerOutcome"]] = outcome_breakdown.get(item["providerOutcome"], 0) + 1

  return {
    "provider": providers[0] if len(providers) == 1 else "mixed",
    "model": settings.openai_model if settings.resolved_provider == "openai_compatible" else None,
    "promptVersion": prompt_versions[0] if len(prompt_versions) == 1 else "mixed",
    "caseCount": len(results),
    "passCount": pass_count,
    "passRate": round(pass_count / len(results), 4),
    "fallbackCount": fallback_count,
    "providerAttemptCount": provider_attempt_count,
    "providerSuccessCount": provider_success_count,
    "avgLatencyMs": avg_latency_ms,
    "avgScore": avg_score,
    "providerOutcomeBreakdown": outcome_breakdown,
    "scenes": scenes,
    "results": results,
  }


def _summary_snapshot(summary: dict[str, Any]) -> dict[str, Any]:
  return {
    "promptVersion": summary["promptVersion"],
    "caseCount": summary["caseCount"],
    "passCount": summary["passCount"],
    "passRate": summary["passRate"],
    "fallbackCount": summary["fallbackCount"],
    "providerSuccessCount": summary["providerSuccessCount"],
    "avgScore": summary["avgScore"],
    "avgLatencyMs": summary["avgLatencyMs"],
  }


def _aggregate_scene(scene_name: str, results: list[dict[str, Any]]) -> dict[str, Any]:
  pass_count = sum(1 for item in results if item["passed"])
  fallback_count = sum(1 for item in results if item["fallbackUsed"])
  provider_attempt_count = sum(1 for item in results if item["providerAttempted"])
  provider_success_count = sum(1 for item in results if item["providerSucceeded"])
  avg_latency_ms = round(sum(item["latencyMs"] for item in results) / len(results), 2)
  avg_score = round(sum(item["score"]["total"] for item in results) / len(results), 4)
  outcome_breakdown: dict[str, int] = {}
  for item in results:
    outcome_breakdown[item["providerOutcome"]] = outcome_breakdown.get(item["providerOutcome"], 0) + 1
  return {
    "scene": scene_name,
    "caseCount": len(results),
    "passCount": pass_count,
    "passRate": round(pass_count / len(results), 4),
    "fallbackCount": fallback_count,
    "providerAttemptCount": provider_attempt_count,
    "providerSuccessCount": provider_success_count,
    "avgLatencyMs": avg_latency_ms,
    "avgScore": avg_score,
    "providerOutcomeBreakdown": outcome_breakdown,
  }
