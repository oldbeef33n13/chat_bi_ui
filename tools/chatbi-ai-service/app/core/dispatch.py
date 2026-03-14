from __future__ import annotations

from typing import Any

from app.core.container import container
from app.core.settings import settings
from app.core.execution import SceneExecution
from app.models import ChartAskRequest, ChartRecommendRequest, CommandPlanRequest, DataGuideRequest, StorySummaryRequest


SCENES = [
  "command_plan",
  "chart_recommend",
  "chart_ask",
  "data_guide",
  "story_summary",
]


def build_capabilities_payload() -> dict[str, Any]:
  return {
    "provider": settings.resolved_provider,
    "model": settings.openai_model if settings.resolved_provider == "openai_compatible" else None,
    "surfaces": SCENES,
    "mode": "hybrid" if settings.resolved_provider != "rule" else "rule_fallback",
    "promptVersions": container.prompts.get_active_versions(),
  }


def invoke_scene(scene: str, raw_payload: dict[str, Any], requested_prompt_version: str | None = None) -> tuple[dict[str, Any], str, str]:
  execution, provider, prompt_version = execute_scene(scene, raw_payload, requested_prompt_version)
  return execution.response, provider, prompt_version


def execute_scene(scene: str, raw_payload: dict[str, Any], requested_prompt_version: str | None = None) -> tuple[SceneExecution[dict[str, Any]], str, str]:
  prompt_version = container.prompts.resolve_version(scene, requested_prompt_version)

  if scene == "command_plan":
    request = CommandPlanRequest.model_validate(raw_payload)
    execution = _serialize_execution(container.command_plan.run(request, prompt_version=prompt_version))
  elif scene == "chart_recommend":
    request = ChartRecommendRequest.model_validate(raw_payload)
    execution = _serialize_execution(container.chart_recommend.run(request, prompt_version=prompt_version))
  elif scene == "chart_ask":
    request = ChartAskRequest.model_validate(raw_payload)
    execution = _serialize_execution(container.chart_ask.run(request, prompt_version=prompt_version))
  elif scene == "data_guide":
    request = DataGuideRequest.model_validate(raw_payload)
    execution = _serialize_execution(container.data_guide.run(request, prompt_version=prompt_version))
  elif scene == "story_summary":
    request = StorySummaryRequest.model_validate(raw_payload)
    execution = _serialize_execution(container.story_summary.run(request, prompt_version=prompt_version))
  else:
    raise SystemExit(f"unsupported scene: {scene}")

  return execution, settings.resolved_provider, prompt_version


def _serialize_execution(execution: SceneExecution[Any]) -> SceneExecution[dict[str, Any]]:
  return SceneExecution(
    response=execution.response.model_dump(by_alias=True, exclude_none=True),
    meta=execution.meta,
  )
