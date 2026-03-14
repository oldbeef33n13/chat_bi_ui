from __future__ import annotations

from fastapi import FastAPI, HTTPException

from app.core.container import container
from app.core.dispatch import build_capabilities_payload
from app.core.settings import settings
from app.models import (
  ChartAskRequest,
  ChartAskResponse,
  ChartRecommendRequest,
  ChartRecommendResponse,
  CommandPlanRequest,
  CommandPlanResponse,
  DataGuideRequest,
  DataGuideResponse,
  StorySummaryRequest,
  StorySummaryResponse,
)
from app.orchestration.models import (
  ConversationRouteRequest,
  ConversationRouteResponse,
  CreateGenerationJobRequest,
  CreateGenerationJobResponse,
  EditProposalRequest,
  EditProposalResponse,
  GenerationJob,
  ObjectRegistry,
  ObjectRegistryBuildRequest,
  RuntimeAnalysisRequest,
  RuntimeAnalysisResponse,
)
app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.get("/health")
def health() -> dict[str, str | None]:
  return {"status": "ok", "provider": settings.resolved_provider, "model": settings.openai_model if settings.resolved_provider == "openai_compatible" else None}


@app.get("/api/v1/ai/capabilities")
def capabilities() -> dict[str, object]:
  return build_capabilities_payload()


@app.post("/api/v1/ai/command-plan", response_model=CommandPlanResponse)
def infer_command_plan(request: CommandPlanRequest) -> CommandPlanResponse:
  return container.command_plan.handle(request)


@app.post("/api/v1/ai/chart/recommend", response_model=ChartRecommendResponse)
def recommend_chart(request: ChartRecommendRequest) -> ChartRecommendResponse:
  return container.chart_recommend.handle(request)


@app.post("/api/v1/ai/chart/ask", response_model=ChartAskResponse)
def ask_chart(request: ChartAskRequest) -> ChartAskResponse:
  return container.chart_ask.handle(request)


@app.post("/api/v1/ai/data/guide", response_model=DataGuideResponse)
def build_data_guide(request: DataGuideRequest) -> DataGuideResponse:
  return container.data_guide.handle(request)


@app.post("/api/v1/ai/story/summary", response_model=StorySummaryResponse)
def summarize_story(request: StorySummaryRequest) -> StorySummaryResponse:
  return container.story_summary.handle(request)


@app.post("/api/v1/ai/orch/object-registry/build", response_model=ObjectRegistry)
def build_object_registry(request: ObjectRegistryBuildRequest) -> ObjectRegistry:
  return container.edit_orchestration.build_object_registry(
    ConversationRouteRequest(
      threadId="registry-build",
      docId=str(request.snapshotDsl.get("docId") or ""),
      docType=str(request.snapshotDsl.get("docType") or "dashboard"),
      userText="build object registry",
      baseRevision=request.baseRevision,
      snapshotDsl=request.snapshotDsl,
    )
  )


@app.post("/api/v1/ai/orch/route", response_model=ConversationRouteResponse)
def route_conversation(request: ConversationRouteRequest) -> ConversationRouteResponse:
  registry = container.edit_orchestration.build_object_registry(request)
  return container.conversation_router.route(request, registry)


@app.post("/api/v1/ai/orch/edit/propose", response_model=EditProposalResponse)
def propose_edit(request: EditProposalRequest) -> EditProposalResponse:
  return container.edit_orchestration.propose_edit(request)


@app.post("/api/v1/ai/orch/generate/jobs", response_model=CreateGenerationJobResponse)
def create_generation_job(request: CreateGenerationJobRequest) -> CreateGenerationJobResponse:
  return container.generation_orchestration.create_job(
    thread_id=request.threadId,
    doc_id=request.docId,
    doc_type=request.docType,
    base_revision=request.baseRevision,
    user_text=request.userText,
    goal=request.goal,
  )


@app.get("/api/v1/ai/orch/generate/jobs/{job_id}", response_model=GenerationJob)
def get_generation_job(job_id: str) -> GenerationJob:
  job = container.generation_orchestration.get_job(job_id)
  if not job:
    raise HTTPException(status_code=404, detail="generation job not found")
  return job


@app.post("/api/v1/ai/orch/generate/jobs/{job_id}/units/{unit_id}/run", response_model=GenerationJob)
def run_generation_unit(job_id: str, unit_id: str) -> GenerationJob:
  job = container.generation_orchestration.run_unit(job_id, unit_id)
  if not job:
    raise HTTPException(status_code=404, detail="generation unit not found")
  return job


@app.post("/api/v1/ai/orch/runtime/analyze", response_model=RuntimeAnalysisResponse)
def analyze_runtime(request: RuntimeAnalysisRequest) -> RuntimeAnalysisResponse:
  return container.runtime_orchestration.analyze(request)
