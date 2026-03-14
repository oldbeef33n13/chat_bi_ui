from __future__ import annotations

from typing import Any

from app.core.execution import SceneExecution, SceneExecutionMeta, classify_provider_exception, shorten_error_message
from app.core.prompt_registry import PromptRegistry
from app.models import StorySummaryRequest, StorySummaryResponse, UiAssistantResponse


class StorySummaryScene:
  def __init__(self, llm_client: Any | None, prompts: PromptRegistry) -> None:
    self._llm = llm_client
    self._prompts = prompts

  def handle(self, request: StorySummaryRequest, prompt_version: str | None = None) -> StorySummaryResponse:
    return self.run(request, prompt_version=prompt_version).response

  def run(self, request: StorySummaryRequest, prompt_version: str | None = None) -> SceneExecution[StorySummaryResponse]:
    prompt = self._prompts.get_prompt("story_summary", version=prompt_version)
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
        scene="story_summary",
        system_prompt=prompt.systemPrompt,
        user_payload=request.model_dump(mode="json"),
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
      payload["headline"] = normalize_string(payload.get("headline"))
      payload["conclusion"] = normalize_string(payload.get("conclusion"))
      payload["evidence"] = normalize_string_list(payload.get("evidence"))
      payload["advice"] = normalize_string_list(payload.get("advice"))
      response = StorySummaryResponse.model_validate(
        {
          "source": "provider",
          "headline": payload.get("headline") or fallback.headline,
          "conclusion": payload.get("conclusion") or fallback.conclusion,
          "evidence": payload.get("evidence") or fallback.evidence,
          "advice": payload.get("advice") or fallback.advice,
          "ui": self._build_ui(request, payload.get("headline") or fallback.headline),
        }
      )
      partial_fallback = any(not payload.get(key) for key in ("headline", "conclusion", "evidence", "advice"))
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

  def _fallback(self, request: StorySummaryRequest) -> StorySummaryResponse:
    headline = f"{request.title} - {request.focus or '关键结论摘要'}"
    if request.insights:
      conclusion = request.insights[0]
      evidence = request.insights[:3]
    else:
      conclusion = "当前内容已具备基础展示结构，建议补齐关键结论与行动建议。"
      evidence = ["已加载模板内容", "可进一步生成章节摘要", "可转写为汇报故事线"]
    advice = ["先明确核心结论，再补证据。", "对异常和变化点补一页说明。", "为管理层版本保留更高层摘要。"]
    return StorySummaryResponse(
      source="rule",
      headline=headline,
      conclusion=conclusion,
      evidence=evidence,
      advice=advice,
      ui=self._build_ui(request, headline),
    )

  def _build_ui(self, request: StorySummaryRequest, headline: str) -> UiAssistantResponse:
    draft_label = "保存页面草稿" if request.docType == "ppt" else "保存模块草稿" if request.docType == "dashboard" else "保存章节草稿"
    return UiAssistantResponse(
      message=f"我先整理了一版总结：{headline}",
      bullets=[],
      confirmHint="确认后只会生成一份草稿，不会直接覆盖当前内容。",
      confirmLabel=draft_label,
      appliedMessage=f"已为你保存一份{draft_label.replace('保存', '')}。",
    )


def normalize_string(value: Any) -> str:
  if value is None:
    return ""
  return str(value).strip()


def normalize_string_list(value: Any) -> list[str]:
  if isinstance(value, str):
    text = value.replace("；", "。").replace("\n", "。")
    return [item.strip(" -\t\r") for item in text.split("。") if item.strip(" -\t\r")]
  if isinstance(value, list):
    return [str(item).strip() for item in value if str(item).strip()]
  return []
