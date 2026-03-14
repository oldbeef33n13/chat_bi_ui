from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AnalysisSource(BaseModel):
  alias: str
  sourceId: str


class FinalOutputRef(BaseModel):
  stepId: str
  as_name: str = Field(alias="as")


class SortSpec(BaseModel):
  field: str
  direction: Literal["asc", "desc"] = "asc"


class FilterCondition(BaseModel):
  field: str
  op: Literal["eq", "neq", "in", "not_in", "gt", "gte", "lt", "lte", "between", "contains", "startswith", "endswith", "is_null", "not_null"]
  value: Any | None = None


class MetricAgg(BaseModel):
  field: str
  agg: Literal["sum", "avg", "min", "max", "count", "count_distinct"]
  as_name: str = Field(alias="as")


class AnalysisStep(BaseModel):
  id: str
  op: Literal[
    "select_columns",
    "filter_rows",
    "derive_column",
    "group_aggregate",
    "sort_rows",
    "top_n",
    "limit_rows",
    "time_bucket",
    "pivot_table",
    "fill_nulls",
    "describe_numeric",
    "count_distinct",
    "detect_outliers",
    "compare_period",
    "join_sources",
  ]
  input: str | list[str]
  params: dict[str, Any] = Field(default_factory=dict)
  output: str
  explain: str | None = None


class AnalysisPlan(BaseModel):
  version: Literal["ap_v1"]
  goal: str
  analysisMode: Literal["single_source", "multi_source_compare", "multi_source_join"]
  sources: list[AnalysisSource]
  steps: list[AnalysisStep]
  finalOutputs: list[FinalOutputRef]
  explanation: list[str] = Field(default_factory=list)
