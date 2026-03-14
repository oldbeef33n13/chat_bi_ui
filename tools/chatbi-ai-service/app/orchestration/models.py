from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ResolvedIntent = Literal["ask_data", "ask_chart", "ask_doc_summary", "ask_edit", "ask_generate", "ask_analysis"]
ResolvedScene = Literal["data_guide", "chart_ask", "story_summary", "command_plan", "generation", "analysis_planner"]
ObjectKind = Literal["doc", "section", "slide", "chart", "table", "text", "image", "node"]
GenerationUnitType = Literal["section", "slide", "block_region", "summary"]
GenerationJobStatus = Literal["queued", "running", "ready", "completed", "failed"]
GenerationUnitStatus = Literal["queued", "planning", "ready", "accepted", "rejected", "failed"]
ProposalRisk = Literal["low", "medium", "high"]
ArtifactKind = Literal["section", "slide", "block_region", "summary"]
UnsupportedCode = Literal["traditional_flow_only", "cross_doc_generation", "runtime_only"]


class ObjectRegistryObject(BaseModel):
  objectId: str
  kind: ObjectKind | str
  title: str
  sectionId: str | None = None
  slideId: str | None = None
  chartType: str | None = None
  fieldKeywords: list[str] = Field(default_factory=list)
  sourceRefs: list[str] = Field(default_factory=list)
  displayText: str


class ObjectRegistry(BaseModel):
  docId: str
  docType: str
  objects: list[ObjectRegistryObject]


class ObjectRegistryBuildRequest(BaseModel):
  baseRevision: int = 0
  snapshotDsl: dict[str, Any]


class ConversationRouteRequest(BaseModel):
  threadId: str
  docId: str
  docType: str
  userText: str
  baseRevision: int = 0
  snapshotDsl: dict[str, Any]
  selectedObjectIds: list[str] = Field(default_factory=list)
  activeSectionId: str | None = None
  activeSlideId: str | None = None
  templateVariables: dict[str, Any] = Field(default_factory=dict)


class ResolvedObject(BaseModel):
  objectId: str
  kind: str
  title: str
  confidence: float


class WorkingContext(BaseModel):
  docId: str
  docType: str
  selectedObjectIds: list[str] = Field(default_factory=list)
  activeSectionId: str | None = None
  activeSlideId: str | None = None
  lastResolvedObjectId: str | None = None
  templateVariables: dict[str, Any] = Field(default_factory=dict)
  currentIntent: str | None = None
  activeJobId: str | None = None


class ConversationRouteResponse(BaseModel):
  intent: ResolvedIntent
  scene: ResolvedScene | None = None
  resolvedObjects: list[ResolvedObject] = Field(default_factory=list)
  needsClarification: bool = False
  clarificationQuestion: str | None = None
  workingContext: WorkingContext


class ThreadContext(BaseModel):
  threadId: str
  docId: str
  docType: str
  selectedObjectIds: list[str] = Field(default_factory=list)
  activeSectionId: str | None = None
  activeSlideId: str | None = None
  templateVariables: dict[str, Any] = Field(default_factory=dict)
  lastResolvedObjectId: str | None = None
  currentIntent: str | None = None
  activeJobId: str | None = None
  recentAcceptedProposalIds: list[str] = Field(default_factory=list)


class PatchProposal(BaseModel):
  proposalId: str
  threadId: str
  docId: str
  docType: str
  baseRevision: int
  scopeType: str
  scopeId: str | None = None
  risk: ProposalRisk
  summary: str
  explanation: list[str] = Field(default_factory=list)
  commandPlan: dict[str, Any]
  previewChangedObjectIds: list[str] = Field(default_factory=list)
  source: str = "rule"
  accepted: bool = False
  rejected: bool = False
  createdAt: str


class UnsupportedResponse(BaseModel):
  code: UnsupportedCode
  message: str
  recommendations: list[str] = Field(default_factory=list)


class UiAssistantResponse(BaseModel):
  message: str
  bullets: list[str] = Field(default_factory=list)
  confirmHint: str | None = None
  confirmLabel: str | None = None
  appliedMessage: str | None = None


class EditProposalRequest(ConversationRouteRequest):
  pass


class EditProposalResponse(BaseModel):
  route: ConversationRouteResponse
  proposal: PatchProposal | None = None
  unsupported: UnsupportedResponse | None = None
  ui: UiAssistantResponse | None = None


class GenerationOutlineUnit(BaseModel):
  title: str
  goal: str
  unitType: GenerationUnitType
  orderIndex: int


class GenerationOutline(BaseModel):
  title: str
  audience: str
  goal: str
  units: list[GenerationOutlineUnit]
  notes: list[str] = Field(default_factory=list)


class GenerationUnit(BaseModel):
  unitId: str
  title: str
  goal: str
  unitType: GenerationUnitType
  orderIndex: int
  status: GenerationUnitStatus
  resultProposalId: str | None = None
  errorMessage: str | None = None
  artifact: GeneratedArtifact | None = None


class GeneratedArtifact(BaseModel):
  artifactId: str
  unitId: str
  artifactKind: ArtifactKind
  title: str
  summary: str
  node: dict[str, Any]
  notes: list[str] = Field(default_factory=list)
  createdAt: str


class CreateGenerationJobRequest(BaseModel):
  threadId: str
  docId: str
  docType: str
  baseRevision: int = 0
  userText: str
  goal: str | None = None
  snapshotDsl: dict[str, Any]
  templateVariables: dict[str, Any] = Field(default_factory=dict)


class GenerationJob(BaseModel):
  jobId: str
  threadId: str
  docId: str
  docType: str
  baseRevision: int
  flowType: str
  goal: str
  status: GenerationJobStatus
  outline: GenerationOutline
  units: list[GenerationUnit]
  createdAt: str
  updatedAt: str


class CreateGenerationJobResponse(BaseModel):
  job: GenerationJob | None = None
  unsupported: UnsupportedResponse | None = None
  ui: UiAssistantResponse | None = None


class RuntimeAnalysisField(BaseModel):
  name: str
  type: str = "string"
  label: str | None = None
  unit: str | None = None


class RuntimeAnalysisCandidateSource(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  sourceId: str
  name: str | None = None
  fields: list[RuntimeAnalysisField] = Field(default_factory=list, alias="schema")
  rows: list[dict[str, Any]] = Field(default_factory=list)


class RuntimeAnalysisRequest(BaseModel):
  threadId: str
  docId: str
  docType: str
  question: str
  selectedObjectIds: list[str] = Field(default_factory=list)
  activeSectionId: str | None = None
  activeSlideId: str | None = None
  lastResolvedObjectId: str | None = None
  templateVariables: dict[str, Any] = Field(default_factory=dict)
  candidateSources: list[RuntimeAnalysisCandidateSource] = Field(default_factory=list)


class RuntimeAnalysisResponse(BaseModel):
  source: str = "rule"
  headline: str
  conclusion: str
  evidence: list[str] = Field(default_factory=list)
  advice: list[str] = Field(default_factory=list)
  router: dict[str, Any] = Field(default_factory=dict)
  plan: dict[str, Any] = Field(default_factory=dict)
  execution: dict[str, Any] = Field(default_factory=dict)
  ui: UiAssistantResponse | None = None
