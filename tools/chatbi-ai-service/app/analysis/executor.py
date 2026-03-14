from __future__ import annotations

from typing import Any

import pandas as pd

from app.analysis.plan_models import AnalysisPlan


def execute_analysis_plan(plan: AnalysisPlan, source_rows: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
  frames: dict[str, pd.DataFrame] = {}
  for source in plan.sources:
    rows = list(source_rows.get(source.sourceId) or [])
    frames[source.alias] = pd.DataFrame(rows)

  for step in plan.steps:
    if step.op == "filter_rows":
      frames[step.output] = _filter_rows(frames[_single_input(step.input)], step.params)
    elif step.op == "group_aggregate":
      frames[step.output] = _group_aggregate(frames[_single_input(step.input)], step.params)
    elif step.op == "sort_rows":
      frames[step.output] = _sort_rows(frames[_single_input(step.input)], step.params)
    elif step.op == "top_n":
      frames[step.output] = _top_n(frames[_single_input(step.input)], step.params)
    elif step.op == "limit_rows":
      frames[step.output] = _limit_rows(frames[_single_input(step.input)], step.params)
    elif step.op == "compare_period":
      frames[step.output] = _compare_period(frames[_single_input(step.input)], step.params)
    else:
      raise ValueError(f"unsupported operator in executor: {step.op}")

  result_tables = []
  total_output_rows = 0
  for final_output in plan.finalOutputs:
    frame = frames[plan_step_output(plan, final_output.stepId)]
    row_count = int(len(frame))
    total_output_rows += row_count
    result_tables.append(
      {
        "name": final_output.as_name,
        "columns": list(frame.columns),
        "rows": frame.head(20).replace({pd.NA: None}).where(pd.notnull(frame.head(20)), None).to_dict(orient="records"),
        "rowCount": row_count,
      }
    )
  return {
    "status": "succeeded",
    "resultTables": result_tables,
    "stats": {
      "inputRows": sum(len(source_rows.get(source.sourceId) or []) for source in plan.sources),
      "outputRows": total_output_rows,
      "latencyMs": 0,
    },
    "provenance": {
      "sources": [source.sourceId for source in plan.sources],
      "executedSteps": [step.id for step in plan.steps],
    },
  }


def plan_step_output(plan: AnalysisPlan, step_id: str) -> str:
  for step in plan.steps:
    if step.id == step_id:
      return step.output
  raise ValueError(f"unknown step id: {step_id}")


def _single_input(input_ref: str | list[str]) -> str:
  if isinstance(input_ref, list):
    if len(input_ref) != 1:
      raise ValueError("single-input operator received multiple inputs")
    return input_ref[0]
  return input_ref


def _filter_rows(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
  if frame.empty:
    return frame.copy()
  conditions = params.get("conditions") or []
  logic = str(params.get("logic") or "and").lower()
  mask = pd.Series([True] * len(frame), index=frame.index)
  if logic == "or":
    mask = pd.Series([False] * len(frame), index=frame.index)
  for condition in conditions:
    current = _build_condition_mask(frame, condition)
    mask = mask & current if logic == "and" else mask | current
  return frame.loc[mask].reset_index(drop=True)


def _build_condition_mask(frame: pd.DataFrame, condition: dict[str, Any]) -> pd.Series:
  field = condition["field"]
  op = condition["op"]
  value = condition.get("value")
  series = frame[field]
  if op == "eq":
    return series == value
  if op == "neq":
    return series != value
  if op == "in":
    return series.isin(value or [])
  if op == "not_in":
    return ~series.isin(value or [])
  if op == "gt":
    return series > value
  if op == "gte":
    return series >= value
  if op == "lt":
    return series < value
  if op == "lte":
    return series <= value
  if op == "between":
    lower, upper = value
    return (series >= lower) & (series <= upper)
  if op == "contains":
    return series.astype(str).str.contains(str(value), na=False)
  if op == "startswith":
    return series.astype(str).str.startswith(str(value), na=False)
  if op == "endswith":
    return series.astype(str).str.endswith(str(value), na=False)
  if op == "is_null":
    return series.isna()
  if op == "not_null":
    return series.notna()
  raise ValueError(f"unsupported filter op: {op}")


def _group_aggregate(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
  group_by = list(params.get("groupBy") or [])
  metrics = list(params.get("metrics") or [])
  if not metrics:
    return frame[group_by].drop_duplicates().reset_index(drop=True)
  if group_by:
    grouped = frame.groupby(group_by, dropna=False)
    rows = []
    for group_values, group_frame in grouped:
      if not isinstance(group_values, tuple):
        group_values = (group_values,)
      row = {field: value for field, value in zip(group_by, group_values)}
      for metric in metrics:
        row[metric["as"]] = _aggregate_series(group_frame[metric["field"]], metric["agg"])
      rows.append(row)
    return pd.DataFrame(rows)
  row = {}
  for metric in metrics:
    row[metric["as"]] = _aggregate_series(frame[metric["field"]], metric["agg"])
  return pd.DataFrame([row])


def _aggregate_series(series: pd.Series, agg: str) -> Any:
  if agg == "sum":
    return float(series.sum()) if pd.api.types.is_numeric_dtype(series) else float(series.count())
  if agg == "avg":
    return float(series.mean())
  if agg == "min":
    return series.min()
  if agg == "max":
    return series.max()
  if agg == "count":
    return int(series.count())
  if agg == "count_distinct":
    return int(series.nunique())
  raise ValueError(f"unsupported agg: {agg}")


def _sort_rows(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
  specs = list(params.get("by") or [])
  by = [item["field"] for item in specs]
  ascending = [str(item.get("direction") or "asc").lower() != "desc" for item in specs]
  return frame.sort_values(by=by, ascending=ascending, na_position="last").reset_index(drop=True)


def _top_n(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
  field = params["field"]
  n = int(params.get("n") or 5)
  ascending = str(params.get("direction") or "desc").lower() != "desc"
  return frame.sort_values(by=[field], ascending=ascending, na_position="last").head(n).reset_index(drop=True)


def _limit_rows(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
  limit = int(params.get("limit") or 20)
  return frame.head(limit).reset_index(drop=True)


def _compare_period(frame: pd.DataFrame, params: dict[str, Any]) -> pd.DataFrame:
  date_field = params["dateField"]
  metric_field = params["metricField"]
  data = frame.copy()
  data[date_field] = pd.to_datetime(data[date_field], errors="coerce")
  data = data.dropna(subset=[date_field]).sort_values(date_field)
  if data.empty:
    return pd.DataFrame([{"current_value": 0.0, "previous_value": 0.0, "delta": 0.0, "delta_pct": 0.0}])
  current_range = params.get("current") or []
  previous_range = params.get("previous") or []
  if _is_date_range(current_range) and _is_date_range(previous_range):
    current_mask = (data[date_field] >= pd.to_datetime(current_range[0])) & (data[date_field] <= pd.to_datetime(current_range[1]))
    previous_mask = (data[date_field] >= pd.to_datetime(previous_range[0])) & (data[date_field] <= pd.to_datetime(previous_range[1]))
    current_df = data.loc[current_mask]
    previous_df = data.loc[previous_mask]
  else:
    midpoint = max(1, len(data) // 2)
    previous_df = data.iloc[:midpoint]
    current_df = data.iloc[midpoint:]
  current_value = float(current_df[metric_field].sum()) if not current_df.empty else 0.0
  previous_value = float(previous_df[metric_field].sum()) if not previous_df.empty else 0.0
  delta = current_value - previous_value
  delta_pct = 0.0 if previous_value == 0 else delta / previous_value
  return pd.DataFrame([{
    "current_value": current_value,
    "previous_value": previous_value,
    "delta": delta,
    "delta_pct": delta_pct,
  }])


def _is_date_range(value: Any) -> bool:
  return isinstance(value, list) and len(value) == 2 and all(isinstance(item, str) and item[:4].isdigit() for item in value)
