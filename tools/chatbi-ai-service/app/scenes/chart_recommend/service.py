from __future__ import annotations

from typing import Any

from app.core.execution import SceneExecution, SceneExecutionMeta, classify_provider_exception, shorten_error_message
from app.core.pipeline.chart_semantics import infer_role, recommend_bindings, recommend_chart_type
from app.core.prompt_registry import PromptRegistry
from app.models import ChartRecommendRequest, ChartRecommendResponse


class ChartRecommendScene:
  def __init__(self, llm_client: Any | None, prompts: PromptRegistry) -> None:
    self._llm = llm_client
    self._prompts = prompts

  def handle(self, request: ChartRecommendRequest, prompt_version: str | None = None) -> ChartRecommendResponse:
    return self.run(request, prompt_version=prompt_version).response

  def run(self, request: ChartRecommendRequest, prompt_version: str | None = None) -> SceneExecution[ChartRecommendResponse]:
    prompt = self._prompts.get_prompt("chart_recommend", version=prompt_version)
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
        scene="chart_recommend",
        system_prompt=prompt.systemPrompt,
        user_payload=request.model_dump(mode="json", by_alias=True),
      )
      if not payload:
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
      payload["bindings"] = normalize_bindings_payload(payload.get("bindings"), payload.get("chartType"))
      payload["reasons"] = normalize_string_list(payload.get("reasons"))
      partial_fallback = any(not payload.get(key) for key in ("chartType", "bindings", "reasons"))
      response = ChartRecommendResponse.model_validate(
        {
          "source": "provider",
          "chartType": payload.get("chartType") or fallback.chartType,
          "bindings": payload.get("bindings") or [binding.model_dump(by_alias=True, exclude_none=True) for binding in fallback.bindings],
          "reasons": payload.get("reasons") or fallback.reasons,
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

  def _fallback(self, request: ChartRecommendRequest) -> ChartRecommendResponse:
    fields = [field.model_dump() for field in request.fields]
    chart_type = recommend_chart_type(fields, request.requestedType)
    bindings = recommend_bindings(chart_type, fields)
    roles = [infer_role(field["name"], field["type"]) for field in fields]
    reasons: list[str] = []
    if request.requestedType == "auto":
      reasons.append(f"根据字段结构自动推荐 {chart_type}。")
    else:
      reasons.append(f"按你指定的图表类型 {chart_type} 做绑定建议。")
    if "time" in roles and "metric" in roles:
      reasons.append("检测到时间字段与指标字段，优先适合趋势展示。")
    if roles.count("metric") >= 2:
      reasons.append("存在多个指标字段，可考虑双轴或散点分析。")
    if "source" in roles and "target" in roles:
      reasons.append("检测到 source/target 关系字段，适合关系流向分析。")
    return ChartRecommendResponse(source="rule", chartType=chart_type, bindings=bindings, reasons=reasons)


def normalize_bindings_payload(raw_bindings: Any, chart_type: str | None = None) -> Any:
  if isinstance(raw_bindings, list):
    bindings: list[dict[str, Any]] = []
    role_counts: dict[str, int] = {}
    for item in raw_bindings:
      if not isinstance(item, dict):
        continue
      raw_role = str(item.get("role") or "").strip()
      role_index = role_counts.get(raw_role, 0)
      role_counts[raw_role] = role_index + 1
      role = normalize_chart_binding_role(raw_role, chart_type, role_index)
      field = item.get("field") or item.get("name") or item.get("value")
      if not role or not field:
        continue
      binding = {"role": role, "field": field}
      for key in ("agg", "unit", "axis", "as"):
        if item.get(key) is not None:
          binding[key] = item[key]
      bindings.append(binding)
    return bindings or raw_bindings

  if not isinstance(raw_bindings, dict):
    return raw_bindings

  bindings: list[dict[str, Any]] = []
  for role, value in raw_bindings.items():
    values = value if isinstance(value, list) else [value]
    for index, item in enumerate(values):
      normalized_role = normalize_chart_binding_role(role, chart_type, index)
      if isinstance(item, dict):
        field = item.get("field") or item.get("name") or item.get("value")
        if not field or not normalized_role:
          continue
        binding = {"role": normalized_role, "field": field}
        for key in ("agg", "unit", "axis", "as"):
          if item.get(key) is not None:
            binding[key] = item[key]
        bindings.append(binding)
      elif isinstance(item, str) and item and normalized_role:
        bindings.append({"role": normalized_role, "field": item})
  return bindings or raw_bindings


def normalize_chart_binding_role(role: Any, chart_type: str | None, index: int) -> str:
  raw_role = str(role or "").strip()
  normalized_chart_type = str(chart_type or "").strip().lower()
  if raw_role == "source":
    return "linkSource"
  if raw_role == "target":
    return "linkTarget"
  if raw_role == "value" and normalized_chart_type == "sankey":
    return "linkValue"
  if raw_role == "category" and normalized_chart_type not in {"pie", "treemap", "funnel", "gauge"}:
    return "x"
  if raw_role == "value" and normalized_chart_type not in {"pie", "treemap", "funnel", "gauge", "sankey"}:
    return "y" if index == 0 else "y2"
  if raw_role == "color":
    return "series"
  if raw_role == "y" and index == 1:
    return "y2"
  if raw_role == "metric" and index == 0:
    return "y"
  if raw_role == "metric" and index == 1:
    return "y2"
  return raw_role


def normalize_string_list(value: Any) -> Any:
  if isinstance(value, str):
    parts = [item.strip(" -\n\r\t") for item in value.replace("；", "。").split("。")]
    normalized = [item for item in parts if item]
    return normalized or [value]
  if isinstance(value, list):
    return [str(item).strip() for item in value if str(item).strip()]
  return value
