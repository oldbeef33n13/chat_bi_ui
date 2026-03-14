from __future__ import annotations

from typing import Any

from app.core.execution import SceneExecution, SceneExecutionMeta, classify_provider_exception, shorten_error_message
from app.core.pipeline.chart_semantics import format_field_label, infer_role
from app.core.pipeline.preprocess import compact_fields, compact_rows
from app.core.prompt_registry import PromptRegistry
from app.models import DataEndpointParam, DataGuideRequest, DataGuideResponse, FieldGuide, ParameterGuide


class DataGuideScene:
  def __init__(self, llm_client: Any | None, prompts: PromptRegistry) -> None:
    self._llm = llm_client
    self._prompts = prompts

  def handle(self, request: DataGuideRequest, prompt_version: str | None = None) -> DataGuideResponse:
    return self.run(request, prompt_version=prompt_version).response

  def run(self, request: DataGuideRequest, prompt_version: str | None = None) -> SceneExecution[DataGuideResponse]:
    prompt = self._prompts.get_prompt("data_guide", version=prompt_version)
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
        scene="data_guide",
        system_prompt=prompt.systemPrompt,
        user_payload={
          "name": request.name,
          "description": request.description,
          "params": [item.model_dump(mode="json") for item in request.params],
          "fields": compact_fields([item.model_dump(mode="json") for item in request.fields]),
          "sampleRows": compact_rows(request.sampleRows),
        },
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
      payload["parameterGuide"] = normalize_parameter_guide(payload.get("parameterGuide"), request.params)
      payload["fieldGuide"] = normalize_field_guide(payload.get("fieldGuide"), request.fields)
      payload["recommendedCharts"] = normalize_recommended_charts(payload.get("recommendedCharts"))
      payload["insights"] = normalize_string_list(payload.get("insights"))
      response = DataGuideResponse.model_validate(
        {
          "source": "provider",
          "summary": payload.get("summary") or fallback.summary,
          "parameterGuide": payload.get("parameterGuide") or [item.model_dump() for item in fallback.parameterGuide],
          "fieldGuide": payload.get("fieldGuide") or [item.model_dump() for item in fallback.fieldGuide],
          "recommendedCharts": payload.get("recommendedCharts") or fallback.recommendedCharts,
          "insights": payload.get("insights") or fallback.insights,
        }
      )
      partial_fallback = any(not payload.get(key) for key in ("summary", "parameterGuide", "fieldGuide", "recommendedCharts", "insights"))
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

  def _fallback(self, request: DataGuideRequest) -> DataGuideResponse:
    parameter_guide = [
      ParameterGuide(
        name=item.name,
        label=format_field_label(item.name, item.label),
        type=item.type,
        required=item.required,
        description=item.description or "暂无说明",
      )
      for item in request.params
    ]
    field_guide = [
      FieldGuide(
        name=item.name,
        label=format_field_label(item.name, item.label),
        type=item.type,
        role=infer_role(item.name, item.type),
        description=f"{format_field_label(item.name, item.label)} 适合作为 {infer_role(item.name, item.type)} 字段。",
        unit=item.unit,
      )
      for item in request.fields
    ]
    roles = [item.role for item in field_guide]
    recommended_charts: list[str] = []
    if "time" in roles and "metric" in roles:
      recommended_charts.append("line")
    if "dimension" in roles and "metric" in roles:
      recommended_charts.extend(["bar", "pie"])
    if "source" in roles and "target" in roles and "metric" in roles:
      recommended_charts.append("sankey")
    if roles.count("metric") >= 2:
      recommended_charts.append("scatter")
    return DataGuideResponse(
      source="rule",
      summary=f"接口 {request.name} 包含 {len(request.fields)} 个字段、{len(request.params)} 个参数，适合做快速分析与报告展示。",
      parameterGuide=parameter_guide,
      fieldGuide=field_guide,
      recommendedCharts=list(dict.fromkeys(recommended_charts)),
      insights=[
        f"字段角色分布: 时间 {roles.count('time')}，维度 {roles.count('dimension')}，指标 {roles.count('metric')}。",
        f"样例数据行数: {len(request.sampleRows)}。",
      ],
    )


def normalize_parameter_guide(raw_value: Any, params: list[DataEndpointParam]) -> list[dict[str, Any]]:
  by_name = {item.name: item for item in params}
  if isinstance(raw_value, str):
    return []
  if not isinstance(raw_value, list):
    return [item.model_dump() for item in []]
  normalized: list[dict[str, Any]] = []
  for item in raw_value:
    if not isinstance(item, dict):
      continue
    name = str(item.get("name") or "").strip()
    if not name:
      continue
    source = by_name.get(name)
    label = format_field_label(name, item.get("label") or (source.label if source else None))
    normalized.append(
      {
        "name": name,
        "label": label,
        "type": item.get("type") or (source.type if source else "string"),
        "required": item.get("required") if item.get("required") is not None else (source.required if source else False),
        "description": str(item.get("description") or source.description or "暂无说明"),
      }
    )
  return normalized


def normalize_field_guide(raw_value: Any, fields: list[Any]) -> list[dict[str, Any]]:
  by_name = {item.name: item for item in fields}
  if not isinstance(raw_value, list):
    return []
  normalized: list[dict[str, Any]] = []
  for item in raw_value:
    if not isinstance(item, dict):
      continue
    name = str(item.get("name") or "").strip()
    if not name:
      continue
    source = by_name.get(name)
    field_type = item.get("type") or (source.type if source else "string")
    label = format_field_label(name, item.get("label") or (source.label if source else None))
    normalized.append(
      {
        "name": name,
        "label": label,
        "type": field_type,
        "role": item.get("role") or infer_role(name, field_type),
        "description": str(item.get("description") or f"{label} 适合作为 {infer_role(name, field_type)} 字段。"),
        "unit": item.get("unit") or (source.unit if source else None),
      }
    )
  return normalized


def normalize_recommended_charts(raw_value: Any) -> list[str]:
  if isinstance(raw_value, str):
    raw_items = [raw_value]
  elif isinstance(raw_value, list):
    raw_items = raw_value
  else:
    return []

  normalized: list[str] = []
  for item in raw_items:
    if isinstance(item, dict):
      chart_name = str(item.get("type") or item.get("chartType") or "").strip()
    else:
      chart_name = str(item).strip()
    if not chart_name:
      continue
    chart_id = normalize_chart_name(chart_name)
    if chart_id:
      normalized.append(chart_id)
  return list(dict.fromkeys(normalized))


def normalize_chart_name(raw_name: str) -> str | None:
  lowered = raw_name.strip().lower()
  mapping = {
    "line": "line",
    "折线图": "line",
    "面积图": "line",
    "bar": "bar",
    "柱状图": "bar",
    "条形图": "bar",
    "pie": "pie",
    "饼图": "pie",
    "scatter": "scatter",
    "散点图": "scatter",
    "sankey": "sankey",
    "桑基图": "sankey",
    "有向力导布局图": "graph",
    "graph": "graph",
    "指标卡": "gauge",
    "数字大字报": "gauge",
    "gauge": "gauge",
  }
  return mapping.get(lowered)


def normalize_string_list(raw_value: Any) -> list[str]:
  if isinstance(raw_value, str):
    text = raw_value.replace("；", "。").replace("\n", "。")
    return [item.strip(" -\t\r") for item in text.split("。") if item.strip(" -\t\r")]
  if isinstance(raw_value, list):
    return [str(item).strip() for item in raw_value if str(item).strip()]
  return []
