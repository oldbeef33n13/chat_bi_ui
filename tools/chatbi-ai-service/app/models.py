from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PlanRootNode(BaseModel):
  id: str
  kind: str
  children: list["PlanRootNode"] = Field(default_factory=list)


class CommandPlanRequest(BaseModel):
  input: str
  currentNodeId: str | None = None
  root: PlanRootNode | None = None


class CommandPlanResponse(BaseModel):
  source: Literal["rule", "provider"] = "rule"
  plan: dict[str, Any]
  reasoning: list[str] = Field(default_factory=list)


class SourceField(BaseModel):
  name: str
  label: str | None = None
  type: Literal["string", "number", "boolean", "time", "json"]
  unit: str | None = None


class FieldBinding(BaseModel):
  model_config = ConfigDict(populate_by_name=True)

  role: str
  field: str
  agg: str | None = None
  unit: str | None = None
  axis: str | None = None
  as_field: str | None = Field(default=None, alias="as")


class AiRecommendContext(BaseModel):
  docType: str
  nodeId: str | None = None
  sourceId: str | None = None
  trigger: str


class ChartRecommendRequest(BaseModel):
  requestedType: str
  fields: list[SourceField]
  currentBindings: list[FieldBinding] | None = None
  context: AiRecommendContext


class ChartRecommendResponse(BaseModel):
  source: Literal["rule", "provider"] = "rule"
  chartType: str
  bindings: list[FieldBinding]
  reasons: list[str]


class ChartAskRequest(BaseModel):
  prompt: str
  nodeId: str
  spec: dict[str, Any]
  rows: list[dict[str, Any]]


class ChartAskResponse(BaseModel):
  source: Literal["rule", "provider"] = "rule"
  answer: str
  suggestions: list[str]
  plan: dict[str, Any] | None = None
  planSummary: str | None = None


class DataEndpointParam(BaseModel):
  name: str
  label: str | None = None
  type: str = "string"
  required: bool = False
  defaultValue: Any | None = None
  description: str | None = None
  enumValues: list[str] = Field(default_factory=list)


class DataGuideRequest(BaseModel):
  name: str
  description: str | None = None
  params: list[DataEndpointParam] = Field(default_factory=list)
  fields: list[SourceField] = Field(default_factory=list)
  sampleRows: list[dict[str, Any]] = Field(default_factory=list)


class ParameterGuide(BaseModel):
  name: str
  label: str
  type: str
  required: bool
  description: str


class FieldGuide(BaseModel):
  name: str
  label: str
  type: str
  role: str
  description: str
  unit: str | None = None


class DataGuideResponse(BaseModel):
  source: Literal["rule", "provider"] = "rule"
  summary: str
  parameterGuide: list[ParameterGuide]
  fieldGuide: list[FieldGuide]
  recommendedCharts: list[str]
  insights: list[str]


class UiAssistantResponse(BaseModel):
  message: str
  bullets: list[str] = Field(default_factory=list)
  confirmHint: str | None = None
  confirmLabel: str | None = None
  appliedMessage: str | None = None


class StorySummaryRequest(BaseModel):
  docType: str
  title: str
  insights: list[str] = Field(default_factory=list)
  focus: str | None = None


class StorySummaryResponse(BaseModel):
  source: Literal["rule", "provider"] = "rule"
  headline: str
  conclusion: str
  evidence: list[str]
  advice: list[str]
  ui: UiAssistantResponse | None = None
