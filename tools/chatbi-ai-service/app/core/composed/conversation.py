from __future__ import annotations

from typing import Any

from app.core.composed.analysis_pipeline import run_analysis_pipeline
from app.core.composed.router import route_request


def run_conversation(case_input: dict[str, Any]) -> dict[str, Any]:
  thread_seed = dict(case_input.get("threadSeed") or {})
  object_registry = case_input.get("objectRegistry") or {"objects": []}
  analysis_context = case_input.get("analysisContext") or {}
  turns = list(case_input.get("turns") or [])

  thread_state = {
    "threadId": thread_seed.get("threadId"),
    "docId": thread_seed.get("docId"),
    "docType": thread_seed.get("docType"),
    "activeSectionId": thread_seed.get("activeSectionId"),
    "activePageId": thread_seed.get("activePageId"),
    "selectedObjectIds": list(thread_seed.get("selectedObjectIds") or []),
    "lastResolvedObjectId": thread_seed.get("lastResolvedObjectId"),
    "templateVariables": thread_seed.get("templateVariables") or {},
  }

  actual_turns: list[dict[str, Any]] = []
  for index, turn in enumerate(turns, start=1):
    router_result = route_request(
      {
        "thread": thread_state,
        "objectRegistry": object_registry,
        "userText": str(turn.get("userText") or "").strip(),
      }
    )
    resolved_ids = list(router_result.get("resolvedObjectIds") or [])
    if resolved_ids:
      thread_state["selectedObjectIds"] = resolved_ids
      thread_state["lastResolvedObjectId"] = resolved_ids[0]
    actual_turn = {
      "turnIndex": index,
      "userText": turn.get("userText"),
      "intent": router_result.get("intent"),
      "scene": router_result.get("scene"),
      "resolvedObjectIds": resolved_ids,
      "needsClarification": router_result.get("needsClarification"),
    }

    if router_result.get("scene") == "analysis_planner" and analysis_context:
      actual_turn["analysis"] = run_analysis_pipeline(
        {
          "userQuestion": str(turn.get("userText") or "").strip(),
          "routerContext": thread_state,
          "objectRegistry": object_registry,
          "plannerInput": analysis_context.get("plannerInput") or {},
          "executorFixtures": analysis_context.get("executorFixtures") or {},
        }
      )

    actual_turns.append(actual_turn)

  return {
    "turns": actual_turns,
    "finalThread": thread_state,
  }
