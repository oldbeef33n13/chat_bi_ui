from __future__ import annotations

from typing import Any

from app.core.execution import SceneExecution, SceneExecutionMeta, classify_provider_exception, shorten_error_message
from app.core.pipeline.chart_semantics import aggregate_points
from app.core.pipeline.preprocess import compact_rows
from app.core.prompt_registry import PromptRegistry
from app.models import ChartAskRequest, ChartAskResponse


class ChartAskScene:
  def __init__(self, llm_client: Any | None, prompts: PromptRegistry) -> None:
    self._llm = llm_client
    self._prompts = prompts

  def handle(self, request: ChartAskRequest, prompt_version: str | None = None) -> ChartAskResponse:
    return self.run(request, prompt_version=prompt_version).response

  def run(self, request: ChartAskRequest, prompt_version: str | None = None) -> SceneExecution[ChartAskResponse]:
    prompt = self._prompts.get_prompt("chart_ask", version=prompt_version)
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
        scene="chart_ask",
        system_prompt=prompt.systemPrompt,
        user_payload={
          "prompt": request.prompt,
          "nodeId": request.nodeId,
          "spec": request.spec,
          "rows": compact_rows(request.rows),
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
      response = ChartAskResponse.model_validate(
        {
          "source": "provider",
          "answer": payload.get("answer") or fallback.answer,
          "suggestions": normalize_string_list(payload.get("suggestions")) or fallback.suggestions,
          "plan": normalize_optional_plan(payload.get("plan")),
          "planSummary": normalize_string(payload.get("planSummary")),
        }
      )
      partial_fallback = any(not payload.get(key) for key in ("answer", "suggestions"))
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

  def _fallback(self, request: ChartAskRequest) -> ChartAskResponse:
    if not request.rows:
      return ChartAskResponse(
        source="rule",
        answer="当前图表没有可分析的数据，请先检查数据源或筛选条件。",
        suggestions=["检查数据接口是否有返回值", "确认参数是否正确", "切换到样例数据查看字段"],
      )

    ordered = aggregate_points(request.spec, request.rows)
    prompt = request.prompt.lower()
    if ordered and any(token in prompt for token in ["最高", "峰值", "max", "top"]):
      peak = max(ordered, key=lambda item: item[1])
      answer = f"峰值出现在 {peak[0]}，数值约 {peak[1]:.2f}。"
    elif ordered and any(token in prompt for token in ["最低", "低点", "min"]):
      trough = min(ordered, key=lambda item: item[1])
      answer = f"低点出现在 {trough[0]}，数值约 {trough[1]:.2f}。"
    elif len(ordered) >= 2 and any(token in prompt for token in ["趋势", "变化", "上升", "下降", "环比"]):
      first = ordered[0]
      last = ordered[-1]
      delta = last[1] - first[1]
      trend = "上升" if delta >= 0 else "下降"
      answer = f"从 {first[0]} 到 {last[0]} 整体{trend} {abs(delta):.2f}。"
    else:
      answer = f"当前图表共有 {len(request.rows)} 条样本数据。建议先看趋势、峰值和异常时段。"

    next_props: dict[str, Any] = {}
    if "柱状" in prompt or "bar" in prompt:
      next_props["chartType"] = "bar"
    elif "折线" in prompt or "line" in prompt:
      next_props["chartType"] = "line"
    elif "饼图" in prompt or "pie" in prompt:
      next_props["chartType"] = "pie"
    if "标签" in prompt:
      next_props["labelShow"] = True
    if "平滑" in prompt:
      next_props["smooth"] = True
    plan = None
    plan_summary = None
    if next_props:
      plan = {
        "intent": "update",
        "targets": [request.nodeId],
        "commands": [{"type": "UpdateProps", "nodeId": request.nodeId, "props": next_props}],
        "explain": f"图表智能追问: {request.prompt}",
      }
      plan_summary = f"建议修改: {', '.join(next_props.keys())}"

    return ChartAskResponse(
      source="rule",
      answer=answer,
      suggestions=["最高点在哪个阶段？", "改成柱状图并开启标签", "关闭网格并切换深色主题"],
      plan=plan,
      planSummary=plan_summary,
    )


def normalize_optional_plan(value: Any) -> dict[str, Any] | None:
  if isinstance(value, dict):
    return value
  return None


def normalize_string(value: Any) -> str | None:
  if value is None:
    return None
  text = str(value).strip()
  return text or None


def normalize_string_list(value: Any) -> list[str]:
  if isinstance(value, str):
    text = value.replace("；", "。").replace("\n", "。")
    return [item.strip(" -\t\r") for item in text.split("。") if item.strip(" -\t\r")]
  if isinstance(value, list):
    return [str(item).strip() for item in value if str(item).strip()]
  return []
