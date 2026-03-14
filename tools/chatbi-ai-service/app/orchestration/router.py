from __future__ import annotations

from app.orchestration.models import (
  ConversationRouteRequest,
  ConversationRouteResponse,
  ObjectRegistry,
  ObjectRegistryObject,
  ResolvedObject,
  ThreadContext,
  WorkingContext,
)
from app.orchestration.store import OrchestrationStore


SCENE_BY_INTENT = {
  "ask_data": "data_guide",
  "ask_chart": "chart_ask",
  "ask_doc_summary": "story_summary",
  "ask_edit": "command_plan",
  "ask_generate": "generation",
  "ask_analysis": "analysis_planner",
}


class ConversationRouter:
  def __init__(self, store: OrchestrationStore) -> None:
    self._store = store

  def route(self, request: ConversationRouteRequest, registry: ObjectRegistry) -> ConversationRouteResponse:
    previous = self._store.get_thread_context(request.threadId)
    intent = self._classify_intent(request.userText, registry, request.selectedObjectIds)
    resolved_objects, clarification_question = self._resolve_objects(request, registry, previous, intent)
    working_context = WorkingContext(
      docId=request.docId,
      docType=request.docType,
      selectedObjectIds=request.selectedObjectIds,
      activeSectionId=request.activeSectionId,
      activeSlideId=request.activeSlideId,
      lastResolvedObjectId=resolved_objects[0].objectId if resolved_objects else previous.lastResolvedObjectId if previous else None,
      templateVariables=request.templateVariables,
      currentIntent=intent,
      activeJobId=previous.activeJobId if previous else None,
    )
    self._store.save_thread_context(
      ThreadContext(
        threadId=request.threadId,
        docId=request.docId,
        docType=request.docType,
        selectedObjectIds=request.selectedObjectIds,
        activeSectionId=request.activeSectionId,
        activeSlideId=request.activeSlideId,
        templateVariables=request.templateVariables,
        lastResolvedObjectId=working_context.lastResolvedObjectId,
        currentIntent=intent,
        activeJobId=working_context.activeJobId,
        recentAcceptedProposalIds=previous.recentAcceptedProposalIds if previous else [],
      )
    )
    return ConversationRouteResponse(
      intent=intent,
      scene=None if clarification_question else SCENE_BY_INTENT[intent],
      resolvedObjects=resolved_objects,
      needsClarification=clarification_question is not None,
      clarificationQuestion=clarification_question,
      workingContext=working_context,
    )

  def _classify_intent(self, user_text: str, registry: ObjectRegistry, selected_object_ids: list[str]) -> str:
    lowered = user_text.lower()
    if any(token in user_text for token in ("修改", "调整", "改成", "改为", "重写", "重新生成", "新增", "删除", "替换", "颜色", "标题", "格式")):
      return "ask_edit"
    if any(token in user_text for token in ("生成", "创建", "新建", "做一份")) or any(token in lowered for token in ("generate", "create")):
      return "ask_generate"
    if any(token in user_text for token in ("为什么", "原因", "下钻", "深挖", "波动", "异常")) or any(token in lowered for token in ("why", "analyze", "drill")):
      return "ask_analysis"
    if any(token in user_text for token in ("总结", "摘要", "概括")) and any(token in user_text for token in ("整份", "全文", "文档", "报告", "PPT", "汇报")):
      return "ask_doc_summary"
    if any(token in user_text for token in ("字段", "数据源", "接口", "参数", "口径")) or any(token in lowered for token in ("field", "schema", "endpoint")):
      return "ask_data"
    selected = {item.objectId: item for item in registry.objects}
    if any(selected.get(item_id) and selected[item_id].kind == "chart" for item_id in selected_object_ids):
      return "ask_chart"
    if "图" in user_text or "chart" in lowered:
      return "ask_chart"
    return "ask_edit"

  def _resolve_objects(
    self,
    request: ConversationRouteRequest,
    registry: ObjectRegistry,
    previous: ThreadContext | None,
    intent: str,
  ) -> tuple[list[ResolvedObject], str | None]:
    objects_by_id = {item.objectId: item for item in registry.objects}
    selected_objects = [
      self._to_resolved(objects_by_id[item_id], 1.0)
      for item_id in request.selectedObjectIds
      if item_id in objects_by_id
    ]
    if selected_objects:
      return selected_objects, None

    if any(token in request.userText for token in ("当前页", "本页", "这一页")) and request.activeSlideId and request.activeSlideId in objects_by_id:
      return [self._to_resolved(objects_by_id[request.activeSlideId], 0.98)], None
    if any(token in request.userText for token in ("本章", "这一章", "当前章节")) and request.activeSectionId and request.activeSectionId in objects_by_id:
      return [self._to_resolved(objects_by_id[request.activeSectionId], 0.98)], None
    if any(token in request.userText for token in ("这个", "这张", "当前")) and previous and previous.lastResolvedObjectId and previous.lastResolvedObjectId in objects_by_id:
      return [self._to_resolved(objects_by_id[previous.lastResolvedObjectId], 0.94)], None

    scored = self._score_objects(request.userText, registry.objects, intent)
    if scored:
      top_score = scored[0][1]
      tied = [item for item in scored if item[1] == top_score and top_score > 0]
      if len(tied) > 1:
        titles = "，还是 ".join(item[0].title for item in tied[:2])
        return [], f"你指的是 {titles}？"
      if top_score > 0:
        return [self._to_resolved(scored[0][0], min(0.92, 0.55 + top_score / 100))], None

    if previous and previous.lastResolvedObjectId and previous.lastResolvedObjectId in objects_by_id:
      return [self._to_resolved(objects_by_id[previous.lastResolvedObjectId], 0.72)], None
    return [], None

  def _score_objects(self, user_text: str, objects: list[ObjectRegistryObject], intent: str) -> list[tuple[ObjectRegistryObject, int]]:
    scored: list[tuple[ObjectRegistryObject, int]] = []
    lowered = user_text.lower()
    for item in objects:
      score = 0
      if item.title and item.title in user_text:
        score += 80
      if item.displayText and item.displayText in user_text:
        score += 60
      for keyword in item.fieldKeywords:
        if keyword and keyword in user_text:
          score += 16
      if item.kind == "chart" and ("图" in user_text or "chart" in lowered):
        score += 8
      if item.kind == "section" and ("章" in user_text or "section" in lowered):
        score += 8
      if item.kind == "slide" and ("页" in user_text or "slide" in lowered):
        score += 8
      if intent == "ask_chart" and item.kind == "chart":
        score += 6
      if score > 0:
        scored.append((item, score))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored

  def _to_resolved(self, item: ObjectRegistryObject, confidence: float) -> ResolvedObject:
    return ResolvedObject(
      objectId=item.objectId,
      kind=item.kind,
      title=item.title,
      confidence=round(confidence, 2),
    )
