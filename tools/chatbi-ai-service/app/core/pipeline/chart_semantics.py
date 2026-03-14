from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.models import FieldBinding


def format_field_label(name: str, label: str | None) -> str:
  if label and label.strip() and label.strip() != name:
    return f"{label} ({name})"
  return name


def infer_agg(field_name: str, field_type: str, label: str | None = None, unit: str | None = None) -> str:
  if field_type != "number":
    return "count"
  hint = f"{field_name} {label or ''} {unit or ''}".lower()
  if any(token in hint for token in ["pct", "percent", "ratio", "rate", "utilization", "availability", "latency", "delay", "duration", "error", "success", "avg", "mean"]):
    return "avg"
  return "sum"


def infer_role(field_name: str, field_type: str) -> str:
  lower = field_name.lower()
  if field_type == "time" or any(token in lower for token in ["time", "date", "day", "hour", "month"]):
    return "time"
  if any(token in lower for token in ["source", "src", "from"]):
    return "source"
  if any(token in lower for token in ["target", "dst", "to"]):
    return "target"
  if field_type == "number":
    return "metric"
  return "dimension"


def recommend_chart_type(fields: list[dict[str, Any]], requested_type: str) -> str:
  if requested_type != "auto":
    return requested_type
  roles = [infer_role(field["name"], field["type"]) for field in fields]
  metric_count = roles.count("metric")
  has_time = "time" in roles
  has_source = "source" in roles
  has_target = "target" in roles
  if has_source and has_target and metric_count >= 1:
    return "sankey"
  if has_time and metric_count >= 2:
    return "combo"
  if has_time and metric_count >= 1:
    return "line"
  if metric_count >= 2:
    return "scatter"
  if metric_count >= 1:
    return "bar"
  return "line"


def recommend_bindings(chart_type: str, fields: list[dict[str, Any]]) -> list[FieldBinding]:
  time_field = next((field for field in fields if infer_role(field["name"], field["type"]) == "time"), None)
  metric_fields = [field for field in fields if infer_role(field["name"], field["type"]) == "metric"]
  dimension_fields = [field for field in fields if infer_role(field["name"], field["type"]) == "dimension"]
  source_field = next((field for field in fields if infer_role(field["name"], field["type"]) == "source"), None)
  target_field = next((field for field in fields if infer_role(field["name"], field["type"]) == "target"), None)

  x_field = time_field or (dimension_fields[0] if dimension_fields else (fields[0] if fields else None))
  y_field = metric_fields[0] if metric_fields else (fields[1] if len(fields) > 1 else x_field)

  if not x_field or not y_field:
    return [FieldBinding(role="x", field="x"), FieldBinding(role="y", field="value", agg="sum")]

  if chart_type in {"pie", "treemap", "sunburst", "funnel"}:
    return [
      FieldBinding(role="category", field=(dimension_fields[0] if dimension_fields else x_field)["name"]),
      FieldBinding(role="value", field=y_field["name"], agg=infer_agg(y_field["name"], y_field["type"], y_field.get("label"), y_field.get("unit"))),
    ]

  if chart_type == "gauge":
    return [FieldBinding(role="value", field=y_field["name"], agg=infer_agg(y_field["name"], y_field["type"], y_field.get("label"), y_field.get("unit")))]

  if chart_type == "sankey" and source_field and target_field:
    return [
      FieldBinding(role="linkSource", field=source_field["name"]),
      FieldBinding(role="linkTarget", field=target_field["name"]),
      FieldBinding(role="linkValue", field=y_field["name"], agg=infer_agg(y_field["name"], y_field["type"], y_field.get("label"), y_field.get("unit"))),
    ]

  if chart_type == "combo" and len(metric_fields) >= 2:
    secondary = metric_fields[1]
    return [
      FieldBinding(role="x", field=x_field["name"]),
      FieldBinding(role="y", field=metric_fields[0]["name"], agg=infer_agg(metric_fields[0]["name"], metric_fields[0]["type"], metric_fields[0].get("label"), metric_fields[0].get("unit")), axis="primary"),
      FieldBinding(role="y2", field=secondary["name"], agg=infer_agg(secondary["name"], secondary["type"], secondary.get("label"), secondary.get("unit")), axis="secondary", as_field="secondary"),
    ]

  bindings = [
    FieldBinding(role="x", field=x_field["name"]),
    FieldBinding(role="y", field=y_field["name"], agg=infer_agg(y_field["name"], y_field["type"], y_field.get("label"), y_field.get("unit"))),
  ]
  if dimension_fields:
    series_field = next((field for field in dimension_fields if field["name"] != x_field["name"]), None)
    if series_field:
      bindings.append(FieldBinding(role="series", field=series_field["name"]))
  return bindings


def aggregate_points(spec: dict[str, Any], rows: list[dict[str, Any]]) -> list[tuple[str, float]]:
  bindings = spec.get("bindings") or []
  x_binding = next((item for item in bindings if item.get("role") in {"x", "category"}), None)
  y_binding = next((item for item in bindings if item.get("role") in {"y", "value"}), None)
  if not x_binding or not y_binding:
    return []
  groups: dict[str, list[float]] = defaultdict(list)
  for row in rows:
    x_value = str(row.get(x_binding.get("field"), "-"))
    raw = row.get(y_binding.get("field"))
    try:
      groups[x_value].append(float(raw))
    except (TypeError, ValueError):
      groups[x_value].append(0.0)
  return [(key, sum(values)) for key, values in sorted(groups.items(), key=lambda item: item[0])]
