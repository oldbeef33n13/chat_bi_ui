from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.models import CommandPlanRequest, PlanRootNode
from app.orchestration.boundary import guard_edit_request, guard_generation_request
from app.orchestration.models import (
  ConversationRouteRequest,
  CreateGenerationJobResponse,
  EditProposalRequest,
  EditProposalResponse,
  GeneratedArtifact,
  GenerationJob,
  GenerationOutline,
  GenerationOutlineUnit,
  GenerationUnit,
  ObjectRegistry,
  PatchProposal,
  RuntimeAnalysisRequest,
  RuntimeAnalysisResponse,
  UiAssistantResponse,
)
from app.orchestration.object_registry import ObjectRegistryBuilder
from app.orchestration.router import ConversationRouter
from app.orchestration.store import OrchestrationStore


def _now_iso() -> str:
  return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
  return f"{prefix}_{uuid4().hex[:10]}"


class EditOrchestrationService:
  def __init__(
    self,
    store: OrchestrationStore,
    object_registry_builder: ObjectRegistryBuilder,
    router: ConversationRouter,
    command_plan_scene: Any,
  ) -> None:
    self._store = store
    self._object_registry_builder = object_registry_builder
    self._router = router
    self._command_plan_scene = command_plan_scene

  def build_object_registry(self, request: ConversationRouteRequest) -> ObjectRegistry:
    registry = self._object_registry_builder.build(request.snapshotDsl)
    self._store.save_object_registry(request.docId, request.baseRevision, request.snapshotDsl, registry)
    return registry

  def propose_edit(self, request: EditProposalRequest) -> EditProposalResponse:
    registry = self.build_object_registry(request)
    route = self._router.route(request, registry)
    unsupported = guard_edit_request(request.docType, request.userText)
    if unsupported is not None:
      return EditProposalResponse(route=route, proposal=None, unsupported=unsupported, ui=None)
    if route.needsClarification:
      return EditProposalResponse(route=route, proposal=None)

    target = route.resolvedObjects[0].objectId if route.resolvedObjects else self._resolve_root_node_id(request.snapshotDsl)
    plan_response = self._command_plan_scene.handle(
      CommandPlanRequest(
        input=request.userText,
        currentNodeId=target,
        root=self._to_plan_root(request.snapshotDsl.get("root")),
      )
    )
    proposal = PatchProposal(
      proposalId=_new_id("proposal"),
      threadId=request.threadId,
      docId=request.docId,
      docType=request.docType,
      baseRevision=request.baseRevision,
      scopeType=route.resolvedObjects[0].kind if route.resolvedObjects else "doc",
      scopeId=target,
      risk=self._resolve_risk(plan_response.plan),
      summary=self._resolve_summary(plan_response.plan, request.userText, target),
      explanation=plan_response.reasoning or [request.userText],
      commandPlan=plan_response.plan,
      previewChangedObjectIds=plan_response.plan.get("targets") or ([target] if target else []),
      source=plan_response.source,
      createdAt=_now_iso(),
    )
    self._store.save_patch_proposal(proposal)
    return EditProposalResponse(route=route, proposal=proposal, unsupported=None, ui=self._build_edit_ui(route, proposal))

  def _resolve_root_node_id(self, snapshot_dsl: dict[str, Any]) -> str | None:
    root = snapshot_dsl.get("root")
    return str(root.get("id")) if isinstance(root, dict) and root.get("id") else None

  def _to_plan_root(self, raw_root: Any) -> PlanRootNode | None:
    if not isinstance(raw_root, dict):
      return None
    children = [self._to_plan_root(child) for child in raw_root.get("children") or [] if isinstance(child, dict)]
    return PlanRootNode(
      id=str(raw_root.get("id") or "root"),
      kind=str(raw_root.get("kind") or "node"),
      children=[child for child in children if child is not None],
    )

  def _resolve_risk(self, plan: dict[str, Any]) -> str:
    commands = plan.get("commands") or []
    if any(command.get("type") in {"RemoveNode", "MoveNode", "ApplyTemplate", "Transaction"} for command in commands if isinstance(command, dict)):
      return "high"
    if len(commands) > 4:
      return "medium"
    if any(command.get("type") == "UpdateDoc" for command in commands if isinstance(command, dict)):
      return "medium"
    return "low"

  def _resolve_summary(self, plan: dict[str, Any], user_text: str, target: str | None) -> str:
    preview = plan.get("preview")
    if isinstance(preview, dict) and preview.get("summary"):
      return str(preview["summary"])
    if plan.get("explain"):
      return str(plan["explain"])
    if target:
      return f"{user_text} · target={target}"
    return user_text

  def _build_edit_ui(self, route: Any, proposal: PatchProposal) -> UiAssistantResponse:
    target_kind = route.resolvedObjects[0].kind if route.resolvedObjects else "doc"
    target_title = route.resolvedObjects[0].title if route.resolvedObjects else ""
    target_label = target_title or ("当前图表" if target_kind == "chart" else "当前内容")
    if target_kind == "chart":
      return UiAssistantResponse(
        message=f"我先按 {target_label} 做了一版修改预览。",
        bullets=proposal.explanation[:2],
        confirmHint="确认后会直接更新左侧当前对象。",
        confirmLabel="确认更新",
        appliedMessage=f"已更新左侧主图：{proposal.summary}",
      )
    return UiAssistantResponse(
      message=f"我先按 {target_label} 准备了一版修改预览。",
      bullets=proposal.explanation[:2],
      confirmHint="确认后会直接更新左侧当前内容。",
      confirmLabel="确认更新",
      appliedMessage=f"已更新左侧内容：{proposal.summary}",
    )


class GenerationOrchestrationService:
  def __init__(self, store: OrchestrationStore) -> None:
    self._store = store

  def create_job(self, thread_id: str, doc_id: str, doc_type: str, base_revision: int, user_text: str, goal: str | None = None) -> CreateGenerationJobResponse:
    unsupported = guard_generation_request(doc_type, goal or user_text)
    if unsupported is not None:
      return CreateGenerationJobResponse(job=None, unsupported=unsupported, ui=None)
    final_goal = (goal or user_text).strip()
    outline = self._build_outline(doc_type, final_goal)
    created_at = _now_iso()
    job = GenerationJob(
      jobId=_new_id("job"),
      threadId=thread_id,
      docId=doc_id,
      docType=doc_type,
      baseRevision=base_revision,
      flowType=f"{doc_type}_generate",
      goal=final_goal,
      status="ready",
      outline=outline,
      units=[
        GenerationUnit(
          unitId=_new_id("unit"),
          title=item.title,
          goal=item.goal,
          unitType=item.unitType,
          orderIndex=item.orderIndex,
          status="queued",
        )
        for item in outline.units
      ],
      createdAt=created_at,
      updatedAt=created_at,
    )
    self._store.save_generation_job(job)
    context = self._store.get_thread_context(thread_id)
    if context:
      context.activeJobId = job.jobId
      context.currentIntent = "ask_generate"
      self._store.save_thread_context(context)
    return CreateGenerationJobResponse(job=job, unsupported=None, ui=self._build_generation_ui(job))

  def get_job(self, job_id: str) -> GenerationJob | None:
    return self._store.get_generation_job(job_id)

  def run_unit(self, job_id: str, unit_id: str) -> GenerationJob | None:
    job = self._store.get_generation_job(job_id)
    if not job:
      return None
    unit = next((item for item in job.units if item.unitId == unit_id), None)
    if not unit:
      return None

    now = _now_iso()
    unit.status = "planning"
    unit.errorMessage = None
    job.status = "running"
    job.updatedAt = now
    self._store.save_generation_job(job)

    try:
      artifact = self._build_unit_artifact(job, unit)
      unit.artifact = artifact
      unit.resultProposalId = artifact.artifactId
      unit.status = "ready"
      unit.errorMessage = None
      job.status = "completed" if all(item.artifact is not None for item in job.units) else "running"
      job.updatedAt = _now_iso()
      self._store.save_generation_job(job)
      return job
    except Exception as exc:
      unit.status = "failed"
      unit.errorMessage = str(exc)
      job.status = "failed"
      job.updatedAt = _now_iso()
      self._store.save_generation_job(job)
      raise

  def _build_outline(self, doc_type: str, goal: str) -> GenerationOutline:
    if doc_type == "report":
      units = [
        GenerationOutlineUnit(title="总体结论", goal="先给出本次汇报的核心结论和业务判断", unitType="section", orderIndex=1),
        GenerationOutlineUnit(title="关键指标概览", goal="概览关键指标现状和变化", unitType="section", orderIndex=2),
        GenerationOutlineUnit(title="趋势与异常分析", goal="解释核心趋势、波动和异常原因", unitType="section", orderIndex=3),
        GenerationOutlineUnit(title="风险与建议", goal="沉淀风险点与后续动作建议", unitType="summary", orderIndex=4),
      ]
      return GenerationOutline(title=self._infer_title(goal, "分析报告"), audience=self._infer_audience(goal), goal=goal, units=units, notes=["先确认目录，再逐章生成内容。"])
    if doc_type == "ppt":
      units = [
        GenerationOutlineUnit(title="本次汇报结论", goal="先给领导结论和方向", unitType="slide", orderIndex=1),
        GenerationOutlineUnit(title="关键指标现状", goal="展示关键指标与核心变化", unitType="slide", orderIndex=2),
        GenerationOutlineUnit(title="趋势与问题", goal="呈现主要趋势和问题点", unitType="slide", orderIndex=3),
        GenerationOutlineUnit(title="行动建议", goal="形成可执行建议", unitType="summary", orderIndex=4),
      ]
      return GenerationOutline(title=self._infer_title(goal, "汇报PPT"), audience=self._infer_audience(goal), goal=goal, units=units, notes=["先确认页纲，再逐页生成。"])
    units = [
      GenerationOutlineUnit(title="核心指标概览", goal="放置 KPI 和关键信号", unitType="block_region", orderIndex=1),
      GenerationOutlineUnit(title="趋势分析区", goal="展示核心趋势和变化", unitType="block_region", orderIndex=2),
      GenerationOutlineUnit(title="对比分析区", goal="展示区域、对象或类型对比", unitType="block_region", orderIndex=3),
      GenerationOutlineUnit(title="明细与风险区", goal="承载表格、异常和风险提示", unitType="summary", orderIndex=4),
    ]
    return GenerationOutline(title=self._infer_title(goal, "业务看板"), audience=self._infer_audience(goal), goal=goal, units=units, notes=["先确认模块结构，再补齐组件和布局。"])

  def _infer_title(self, goal: str, fallback: str) -> str:
    for marker in ("周报", "月报", "日报", "专题", "汇报", "看板", "Dashboard", "dashboard", "PPT", "ppt"):
      if marker in goal:
        return goal
    return fallback if len(goal) > 50 else goal

  def _infer_audience(self, goal: str) -> str:
    if any(token in goal for token in ("领导", "管理层", "总监", "高层")):
      return "management"
    if any(token in goal for token in ("客户", "外部", "汇报对象")):
      return "external"
    return "analyst"

  def _build_unit_artifact(self, job: GenerationJob, unit: GenerationUnit) -> GeneratedArtifact:
    if job.docType == "report":
      return self._build_report_artifact(job, unit)
    if job.docType == "ppt":
      return self._build_slide_artifact(job, unit)
    return self._build_dashboard_artifact(job, unit)

  def _build_report_artifact(self, job: GenerationJob, unit: GenerationUnit) -> GeneratedArtifact:
    section_title = f"{unit.orderIndex}. {unit.title.strip()}" if unit.title.strip() else f"章节 {unit.orderIndex}"
    intro = self._build_report_intro(job.goal, unit)
    details = self._build_report_details(unit)
    conclusion = self._build_report_conclusion(unit)
    chart_title = f"{unit.title}图示"
    children: list[dict[str, Any]] = [
      {
        "id": _new_id("text"),
        "kind": "text",
        "props": {
          "text": intro,
          "format": "plain",
        },
      },
      {
        "id": _new_id("text"),
        "kind": "text",
        "props": {
          "text": details,
          "format": "plain",
        },
      },
    ]
    if unit.unitType != "summary":
      children.append(
        {
          "id": _new_id("chart"),
          "kind": "chart",
          "props": {
            "chartType": self._infer_chart_type(unit.title),
            "titleText": chart_title,
            "bindings": [
              {"role": "x", "field": "stat_date", "timeGrain": "day"},
              {"role": "y", "field": "metric_value", "agg": "sum"},
            ],
            "legendShow": False,
            "tooltipShow": True,
            "runtimeAskEnabled": True,
          },
        }
      )
    children.append(
      {
        "id": _new_id("text"),
        "kind": "text",
        "props": {
          "text": conclusion,
          "format": "plain",
        },
      }
    )
    return GeneratedArtifact(
      artifactId=_new_id("artifact"),
      unitId=unit.unitId,
      artifactKind="section",
      title=section_title,
      summary=f"{unit.title} 已生成章节草稿",
      node={
        "id": _new_id("section"),
        "kind": "section",
        "props": {"title": section_title},
        "children": children,
      },
      notes=[
        "这是一版可编辑的章节草稿，后续可以继续重生成或局部修改。",
        "当前图表使用占位字段，可在编辑态替换为真实数据绑定。",
      ],
      createdAt=_now_iso(),
    )

  def _build_slide_artifact(self, job: GenerationJob, unit: GenerationUnit) -> GeneratedArtifact:
    title = f"{unit.orderIndex}. {unit.title.strip()}" if unit.title.strip() else f"页面 {unit.orderIndex}"
    return GeneratedArtifact(
      artifactId=_new_id("artifact"),
      unitId=unit.unitId,
      artifactKind="slide",
      title=title,
      summary=f"{unit.title} 已生成页面草稿",
      node={
        "id": _new_id("slide"),
        "kind": "slide",
        "props": {"title": title, "layoutTemplateId": "title-double-summary"},
        "layout": {"mode": "absolute", "x": 0, "y": 0, "w": 960, "h": 540},
        "children": [
          {
            "id": _new_id("text"),
            "kind": "text",
            "layout": {"mode": "absolute", "x": 40, "y": 30, "w": 360, "h": 60, "z": 1},
            "props": {"text": title, "format": "plain"},
            "style": {"fontSize": 28, "bold": True},
          },
          {
            "id": _new_id("text"),
            "kind": "text",
            "layout": {"mode": "absolute", "x": 40, "y": 108, "w": 860, "h": 280, "z": 1},
            "props": {"text": f"目标：{job.goal}\n\n本页聚焦：{unit.goal}", "format": "plain"},
          },
        ],
      },
      notes=["当前为第一版页面草稿，后续会补图文布局和讲稿说明。"],
      createdAt=_now_iso(),
    )

  def _build_dashboard_artifact(self, job: GenerationJob, unit: GenerationUnit) -> GeneratedArtifact:
    title = unit.title.strip() or f"模块 {unit.orderIndex}"
    return GeneratedArtifact(
      artifactId=_new_id("artifact"),
      unitId=unit.unitId,
      artifactKind="block_region",
      title=title,
      summary=f"{unit.title} 已生成模块草稿",
      node={
        "id": _new_id("container"),
        "kind": "container",
        "layout": {"mode": "grid", "gx": 0, "gy": max(unit.orderIndex - 1, 0) * 4, "gw": 12, "gh": 4},
        "props": {"title": title},
        "children": [
          {
            "id": _new_id("text"),
            "kind": "text",
            "props": {"text": f"{job.goal}\n\n模块目标：{unit.goal}", "format": "plain"},
          }
        ],
      },
      notes=["当前为模块级草稿，后续会继续补齐卡片和图表。"],
      createdAt=_now_iso(),
    )

  def _build_report_intro(self, goal: str, unit: GenerationUnit) -> str:
    return f"本章节围绕“{unit.title}”展开，服务于“{goal}”这一目标。建议先用一句话给出结论，再展开关键证据与影响判断。"

  def _build_report_details(self, unit: GenerationUnit) -> str:
    return "\n".join(
      [
        f"1. 章节目标：{unit.goal}",
        "2. 重点观察：补充关键趋势、异常节点和影响范围。",
        "3. 证据组织：用图表、表格或文字说明支撑结论。",
      ]
    )

  def _build_report_conclusion(self, unit: GenerationUnit) -> str:
    if unit.unitType == "summary":
      return "建议动作：沉淀优先级最高的风险项和后续跟进动作，明确责任人和完成时点。"
    return "结论建议：补充一段管理层可直接引用的总结，说明变化原因、业务影响和下一步动作。"

  def _infer_chart_type(self, title: str) -> str:
    if any(token in title for token in ("对比", "结构", "分布")):
      return "bar"
    if any(token in title for token in ("异常", "风险", "占比")):
      return "pie"
    return "line"

  def _build_generation_ui(self, job: GenerationJob) -> UiAssistantResponse:
    if job.docType == "report":
      return UiAssistantResponse(
        message=f"我先生成了一版大纲：{job.outline.title}",
        bullets=[f"{unit.orderIndex}. {unit.title}" for unit in job.outline.units[:4]],
        confirmHint="确认后会把这版章节骨架插入左侧文档。",
        confirmLabel="确认插入章节骨架",
      )
    if job.docType == "ppt":
      return UiAssistantResponse(
        message=f"我先生成了一版页纲：{job.outline.title}",
        bullets=[f"{unit.orderIndex}. {unit.title}" for unit in job.outline.units[:4]],
      )
    return UiAssistantResponse(
      message=f"我先生成了一版看板结构：{job.outline.title}",
      bullets=[f"{unit.orderIndex}. {unit.title}" for unit in job.outline.units[:4]],
    )


class RuntimeOrchestrationService:
  def _build_runtime_ui(self, doc_type: str, headline: str, mode: str | None = None) -> UiAssistantResponse:
    draft_label = "保存页面草稿" if doc_type == "ppt" else "保存模块草稿" if doc_type == "dashboard" else "保存章节草稿"
    return UiAssistantResponse(
      message=f"我先整理了一版分析结果：{headline}",
      bullets=[],
      confirmHint="确认后只会生成一份草稿，不会直接覆盖当前内容。",
      confirmLabel=draft_label,
      appliedMessage=f"已为你保存一份{draft_label.replace('保存', '')}。",
    )

  def analyze(self, request: RuntimeAnalysisRequest) -> RuntimeAnalysisResponse:
    candidate_sources = [item.model_dump(mode="json", by_alias=True) for item in request.candidateSources]
    try:
      from app.core.composed.analysis_pipeline import run_analysis_pipeline

      pipeline_result = run_analysis_pipeline(
        {
          "userQuestion": request.question,
          "routerContext": {
            "threadId": request.threadId,
            "docId": request.docId,
            "docType": request.docType,
            "activeSectionId": request.activeSectionId,
            "activePageId": request.activeSlideId,
            "selectedObjectIds": request.selectedObjectIds,
            "lastResolvedObjectId": request.lastResolvedObjectId,
            "templateVariables": request.templateVariables,
          },
          "objectRegistry": {"docId": request.docId, "docType": request.docType, "objects": []},
          "plannerInput": {
            "candidateSources": candidate_sources,
          },
          "executorFixtures": {
            "expectedInputRows": sum(len(item.rows) for item in request.candidateSources),
          },
        }
      )
      summary = pipeline_result.get("summary") or {}
    except ModuleNotFoundError:
      source_ids = [item.get("sourceId") for item in candidate_sources if item.get("sourceId")]
      pipeline_result = {
        "router": {"intent": "ask_analysis", "scene": "analysis_planner"},
        "plan": {
          "version": "ap_v1",
          "goal": request.question,
          "analysisMode": "single_source",
          "sources": [{"alias": str(source_ids[0]).replace("-", "_"), "sourceId": source_ids[0]}] if source_ids else [],
          "steps": [],
          "finalOutputs": [],
          "explanation": ["pandas unavailable; returned fallback runtime analysis summary"],
        },
        "execution": {
          "status": "succeeded",
          "resultTables": [],
          "stats": {
            "inputRows": sum(len(item.rows) for item in request.candidateSources),
            "outputRows": 0,
            "latencyMs": 0,
          },
        },
      }
      summary = {
        "headline": "运行态分析结果",
        "conclusion": f"已基于 {len(candidate_sources)} 个候选数据源，对“{request.question}”输出第一版分析摘要。",
        "evidence": [
          f"本次分析覆盖 {sum(len(item.rows) for item in request.candidateSources)} 行样本",
          "当前环境缺少 pandas，已回退到轻量分析摘要",
        ],
        "advice": [
          "补齐执行环境后可得到完整分析计划和结果表",
          "当前可以先将摘要转成草稿后继续编辑",
        ],
      }
    return RuntimeAnalysisResponse(
      source="rule",
      headline=str(summary.get("headline") or "运行态分析结果"),
      conclusion=str(summary.get("conclusion") or "已完成运行态分析。"),
      evidence=[str(item) for item in (summary.get("evidence") or [])],
      advice=[str(item) for item in (summary.get("advice") or [])],
      router=pipeline_result.get("router") or {},
      plan=pipeline_result.get("plan") or {},
      execution=pipeline_result.get("execution") or {},
      ui=self._build_runtime_ui(
        request.docType,
        str(summary.get("headline") or "运行态分析结果"),
        str((pipeline_result.get("plan") or {}).get("analysisMode") or ""),
      ),
    )
