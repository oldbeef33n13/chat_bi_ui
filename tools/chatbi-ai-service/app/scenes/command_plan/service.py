from __future__ import annotations

import json
import re
from typing import Any

from app.core.execution import SceneExecution, SceneExecutionMeta, classify_provider_exception, shorten_error_message
from app.core.prompt_registry import PromptRegistry
from app.models import CommandPlanRequest, CommandPlanResponse


class CommandPlanScene:
  def __init__(self, llm_client: Any | None, prompts: PromptRegistry) -> None:
    self._llm = llm_client
    self._prompts = prompts

  def handle(self, request: CommandPlanRequest, prompt_version: str | None = None) -> CommandPlanResponse:
    return self.run(request, prompt_version=prompt_version).response

  def run(self, request: CommandPlanRequest, prompt_version: str | None = None) -> SceneExecution[CommandPlanResponse]:
    prompt = self._prompts.get_prompt("command_plan", version=prompt_version)
    fallback = self._fallback(request)
    if not self._llm:
      return SceneExecution(
        response=fallback,
        meta=SceneExecutionMeta(
          provider_attempted=False,
          provider_succeeded=False,
          fallback_used=True,
          outcome="rule_only",
        ),
      )
    try:
      payload = self._llm.chat_json(
        scene="command_plan",
        system_prompt=prompt.systemPrompt,
        user_payload=request.model_dump(),
      )
      if not payload or not payload.get("plan"):
        return SceneExecution(
          response=fallback,
          meta=SceneExecutionMeta(
            provider_attempted=True,
            provider_succeeded=False,
            fallback_used=True,
            outcome="provider_empty",
          ),
        )
      payload = dict(payload)
      payload["plan"] = normalize_plan_payload(payload.get("plan"), request.currentNodeId)
      payload["plan"] = supplement_plan_from_request(payload["plan"], request.input, request.currentNodeId)
      if not payload["plan"] or not payload["plan"].get("commands"):
        return SceneExecution(
          response=fallback,
          meta=SceneExecutionMeta(
            provider_attempted=True,
            provider_succeeded=False,
            fallback_used=True,
            outcome="provider_invalid_payload",
            error_type="InvalidPlanPayload",
            error_message="Provider plan payload could not be normalized to executable commands.",
          ),
        )
      reasoning = payload.get("reasoning") or ["已由模型生成命令计划。"]
      partial_fallback = "reasoning" not in payload or not payload.get("reasoning")
      response = CommandPlanResponse.model_validate(
        {
          "source": "provider",
          "plan": payload["plan"],
          "reasoning": reasoning,
        }
      )
      return SceneExecution(
        response=response,
        meta=SceneExecutionMeta(
          provider_attempted=True,
          provider_succeeded=True,
          fallback_used=False,
          partial_fallback=partial_fallback,
          outcome="provider_success",
        ),
      )
    except Exception as exc:
      return SceneExecution(
        response=fallback,
        meta=SceneExecutionMeta(
          provider_attempted=True,
          provider_succeeded=False,
          fallback_used=True,
          outcome=classify_provider_exception(exc),
          error_type=type(exc).__name__,
          error_message=shorten_error_message(exc),
        ),
      )

  def _fallback(self, request: CommandPlanRequest) -> CommandPlanResponse:
    node_id = request.currentNodeId or "node_123"
    commands = infer_commands_from_input(request.input, node_id)
    if not commands:
      commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"smooth": True}})
    return CommandPlanResponse(
      source="rule",
      plan={"intent": "update", "targets": [node_id], "commands": commands, "explain": request.input},
      reasoning=["当前为规则兜底模式，后续可替换为真实大模型规划结果。"],
    )


def normalize_plan_payload(raw_plan: Any, current_node_id: str | None) -> dict[str, Any] | None:
  if not isinstance(raw_plan, dict):
    return None
  plan = dict(raw_plan)
  targets = _normalize_targets(plan.get("targets"), current_node_id)
  primary_target = targets[0] if targets else current_node_id
  raw_commands = plan.get("commands")
  commands = normalize_command_list(raw_commands, primary_target)
  if not commands:
    return None
  return {
    "intent": plan.get("intent") or "update",
    "targets": targets or ([current_node_id] if current_node_id else []),
    "commands": commands,
    "explain": plan.get("explain") or "",
  }


def supplement_plan_from_request(plan: dict[str, Any] | None, request_text: str, current_node_id: str | None) -> dict[str, Any] | None:
  inferred_commands = infer_commands_from_input(request_text, current_node_id)
  if not plan:
    if not inferred_commands:
      return None
    return {
      "intent": "update",
      "targets": [current_node_id] if current_node_id else [],
      "commands": inferred_commands,
      "explain": request_text,
    }

  merged_commands = merge_command_lists(plan.get("commands") or [], inferred_commands)
  if not merged_commands:
    return None

  merged_targets = list(plan.get("targets") or [])
  if current_node_id and current_node_id not in merged_targets:
    merged_targets.append(current_node_id)
  return {
    "intent": plan.get("intent") or "update",
    "targets": merged_targets,
    "commands": merged_commands,
    "explain": plan.get("explain") or request_text,
  }


def _normalize_targets(raw_targets: Any, current_node_id: str | None) -> list[str]:
  if isinstance(raw_targets, list):
    return [str(item) for item in raw_targets if item]
  if isinstance(raw_targets, str) and raw_targets.strip():
    return [raw_targets.strip()]
  if current_node_id:
    return [current_node_id]
  return []


def normalize_command_list(raw_commands: Any, node_id: str | None) -> list[dict[str, Any]]:
  if isinstance(raw_commands, (str, dict)):
    raw_commands = [raw_commands]
  if not isinstance(raw_commands, list):
    return []
  commands: list[dict[str, Any]] = []
  for item in raw_commands:
    normalized = normalize_single_command(item, node_id)
    if not normalized:
      continue
    if isinstance(normalized, list):
      commands.extend(normalized)
    else:
      commands.append(normalized)
  return commands


def infer_commands_from_input(text: str, node_id: str | None) -> list[dict[str, Any]]:
  if not node_id:
    return []
  lowered = text.lower()
  commands: list[dict[str, Any]] = []
  if "折线" in text or "line" in lowered:
    commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"chartType": "line"}})
  if "柱状" in text or "bar" in lowered:
    commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"chartType": "bar"}})
  if "饼图" in text or "pie" in lowered:
    commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"chartType": "pie"}})
  if "平滑" in text or "smooth" in lowered:
    commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"smooth": True}})
  if "标签" in text or "label" in lowered:
    commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"labelShow": True}})
  if "暗色" in text or "dark" in lowered:
    commands.append({"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"})
  if not commands and ("优化" in text or "optimize" in lowered or "improve" in lowered):
    commands.append({"type": "UpdateProps", "nodeId": node_id, "props": {"smooth": True}})
  return commands


def merge_command_lists(primary_commands: list[dict[str, Any]], supplemental_commands: list[dict[str, Any]]) -> list[dict[str, Any]]:
  merged: list[dict[str, Any]] = []
  seen: set[str] = set()
  for command in list(primary_commands) + list(supplemental_commands):
    if not isinstance(command, dict):
      continue
    command_key = json.dumps(command, ensure_ascii=False, sort_keys=True)
    if command_key in seen:
      continue
    seen.add(command_key)
    merged.append(command)
  return merged


def normalize_single_command(raw_command: Any, node_id: str | None) -> dict[str, Any] | list[dict[str, Any]] | None:
  if isinstance(raw_command, str):
    return normalize_string_command(raw_command, node_id)
  if isinstance(raw_command, dict):
    if raw_command.get("type") in {"UpdateProps", "ApplyTheme"}:
      return raw_command
    action = _canonical_action_name(raw_command.get("action"))
    params = raw_command.get("params") if isinstance(raw_command.get("params"), dict) else {}
    effective_node_id = str(params.get("nodeId") or node_id or "").strip() or node_id
    if action in {"setcharttype", "changecharttype"} and effective_node_id:
      chart_type = params.get("type") or params.get("chartType")
      if chart_type:
        return {"type": "UpdateProps", "nodeId": effective_node_id, "props": {"chartType": chart_type}}
    if action in {"togglesmooth", "setsmooth"} and effective_node_id:
      enabled = bool(params.get("enabled", True))
      return {"type": "UpdateProps", "nodeId": effective_node_id, "props": {"smooth": enabled}}
    if action in {"setlabelvisibility", "togglelabels", "enablelabels"} and effective_node_id:
      enabled = bool(params.get("enabled", True))
      return {"type": "UpdateProps", "nodeId": effective_node_id, "props": {"labelShow": enabled}}
    if action in {"settheme", "setthemedark", "applythemedark"}:
      theme_value = str(params.get("theme") or "dark").lower()
      theme_id = "theme.tech.dark" if theme_value == "dark" else f"theme.{theme_value}"
      return {"type": "ApplyTheme", "scope": "doc", "themeId": theme_id}
    if action in {"autooptimizechartstyle", "optimizechartstyle", "autooptimizevisualization"} and effective_node_id:
      return {"type": "UpdateProps", "nodeId": effective_node_id, "props": {"smooth": True, "labelShow": True}}
    if action in {"updatevisualization"} and effective_node_id:
      props: dict[str, Any] = {}
      if params.get("chartType"):
        props["chartType"] = params["chartType"]
      if params.get("showLabels") is not None:
        props["labelShow"] = bool(params["showLabels"])
      if params.get("showPercentages") is not None and params.get("chartType") == "pie":
        props["labelShow"] = True
      if props:
        return {"type": "UpdateProps", "nodeId": effective_node_id, "props": props}
  return None


def normalize_string_command(command: str, node_id: str | None) -> dict[str, Any] | list[dict[str, Any]] | None:
  text = command.strip()
  lowered = text.lower()
  canonical = _canonical_action_name(text)
  if canonical in {"setthemedark", "darktheme", "switchtodarktheme"}:
    return {"type": "ApplyTheme", "scope": "doc", "themeId": "theme.tech.dark"}
  if canonical == "enhancedatalabels" and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"labelShow": True}}
  if canonical == "simplifylabels" and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"labelShow": True}}
  if canonical == "adjustcolorpalette" and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"themeRef": "theme.tech.dark", "paletteRef": "palette.tech.dark"}}
  if canonical == "enhancecolorcontrast" and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"themeRef": "theme.tech.dark", "paletteRef": "palette.tech.dark"}}
  if canonical in {"autooptimizechartstyle", "optimizechartstyle", "autooptimizevisualization", "autooptimizelayout"} and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"smooth": True, "labelShow": True}}

  chart_type_match = re.search(r"set[_]?chart[_]?type\(['\"](?P<value>[^'\"]+)['\"]\)", lowered)
  if chart_type_match and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"chartType": chart_type_match.group("value")}}

  label_match = re.search(r"(set[_]?label[_]?visibility|enable[_]?labels)\((?P<value>true|false)\)", lowered)
  if label_match and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"labelShow": label_match.group("value") == "true"}}

  smooth_match = re.search(r"set[_]?smooth\((?P<value>true|false)\)", lowered)
  if smooth_match and node_id:
    return {"type": "UpdateProps", "nodeId": node_id, "props": {"smooth": smooth_match.group("value") == "true"}}

  theme_match = re.search(r"set[_]?theme\(['\"](?P<value>[^'\"]+)['\"]\)", lowered)
  if theme_match:
    theme_value = theme_match.group("value")
    theme_id = "theme.tech.dark" if theme_value == "dark" else f"theme.{theme_value}"
    return {"type": "ApplyTheme", "scope": "doc", "themeId": theme_id}

  return None


def _canonical_action_name(raw_action: Any) -> str:
  if not raw_action:
    return ""
  return re.sub(r"[^a-z0-9]", "", str(raw_action).strip().lower())
