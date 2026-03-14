from __future__ import annotations

from typing import Any

from app.analysis.plan_models import AnalysisPlan


MAX_SOURCE_COUNT = 5
MAX_STEP_COUNT = 20


def validate_analysis_plan(payload: dict[str, Any], source_catalog: dict[str, dict[str, Any]]) -> AnalysisPlan:
  plan = AnalysisPlan.model_validate(payload)

  if len(plan.sources) == 0:
    raise ValueError("analysis plan requires at least one source")
  if len(plan.sources) > MAX_SOURCE_COUNT:
    raise ValueError("analysis plan source count exceeds limit")
  if len(plan.steps) > MAX_STEP_COUNT:
    raise ValueError("analysis plan step count exceeds limit")

  aliases = set()
  source_fields: dict[str, set[str]] = {}
  source_join_hints: dict[str, list[dict[str, Any]]] = {}
  for source in plan.sources:
    if source.alias in aliases:
      raise ValueError(f"duplicate source alias: {source.alias}")
    aliases.add(source.alias)
    if source.sourceId not in source_catalog:
      raise ValueError(f"unknown sourceId: {source.sourceId}")
    schema = source_catalog[source.sourceId].get("schema") or []
    source_fields[source.alias] = {str(item.get("name")) for item in schema if item.get("name")}
    source_join_hints[source.alias] = list(source_catalog[source.sourceId].get("joinHints") or [])

  available_refs = set(aliases)
  produced_outputs: set[str] = set()
  output_fields = dict(source_fields)
  step_outputs_by_id: dict[str, str] = {}

  for step in plan.steps:
    if step.output in produced_outputs or step.output in aliases:
      raise ValueError(f"duplicate output alias: {step.output}")
    input_refs = [step.input] if isinstance(step.input, str) else list(step.input)
    if not input_refs:
      raise ValueError(f"step {step.id} has empty input")
    for ref in input_refs:
      if ref not in available_refs:
        raise ValueError(f"step {step.id} references unknown input: {ref}")

    _validate_step_fields(step=step, input_refs=input_refs, output_fields=output_fields, source_join_hints=source_join_hints)

    produced_outputs.add(step.output)
    available_refs.add(step.output)
    output_fields[step.output] = _derive_output_fields(step=step, input_refs=input_refs, output_fields=output_fields)
    step_outputs_by_id[step.id] = step.output

  for final_output in plan.finalOutputs:
    if final_output.stepId not in step_outputs_by_id:
      raise ValueError(f"final output references unknown step: {final_output.stepId}")
  return plan


def _validate_step_fields(*, step, input_refs: list[str], output_fields: dict[str, set[str]], source_join_hints: dict[str, list[dict[str, Any]]]) -> None:
  if step.op == "filter_rows":
    conditions = step.params.get("conditions") or []
    for condition in conditions:
      field = condition.get("field")
      if field and field not in _merged_fields(input_refs, output_fields):
        raise ValueError(f"step {step.id} references unknown filter field: {field}")
  elif step.op == "group_aggregate":
    group_by = step.params.get("groupBy") or []
    metrics = step.params.get("metrics") or []
    fields = _merged_fields(input_refs, output_fields)
    for field in group_by:
      if field not in fields:
        raise ValueError(f"step {step.id} references unknown group field: {field}")
    for metric in metrics:
      if metric.get("field") not in fields:
        raise ValueError(f"step {step.id} references unknown metric field: {metric.get('field')}")
  elif step.op == "sort_rows":
    fields = _merged_fields(input_refs, output_fields)
    for sort in step.params.get("by") or []:
      if sort.get("field") not in fields:
        raise ValueError(f"step {step.id} references unknown sort field: {sort.get('field')}")
  elif step.op == "top_n":
    fields = _merged_fields(input_refs, output_fields)
    if step.params.get("field") not in fields:
      raise ValueError(f"step {step.id} references unknown top_n field: {step.params.get('field')}")
  elif step.op == "compare_period":
    fields = _merged_fields(input_refs, output_fields)
    for key in ("dateField", "metricField"):
      if step.params.get(key) not in fields:
        raise ValueError(f"step {step.id} references unknown compare_period field: {step.params.get(key)}")
  elif step.op == "join_sources":
    if len(input_refs) != 2:
      raise ValueError(f"step {step.id} join_sources requires exactly 2 inputs")
    left_key = set(step.params.get("leftKey") or [])
    right_key = set(step.params.get("rightKey") or [])
    if not left_key or not right_key:
      raise ValueError(f"step {step.id} join_sources requires join keys")
    left_ref = input_refs[0]
    allowed = False
    for hint in source_join_hints.get(left_ref, []):
      if set(hint.get("joinKeys") or []) == left_key == right_key:
        allowed = True
        break
    if not allowed:
      raise ValueError(f"step {step.id} join_sources not covered by joinHints")


def _derive_output_fields(*, step, input_refs: list[str], output_fields: dict[str, set[str]]) -> set[str]:
  merged = _merged_fields(input_refs, output_fields)
  if step.op == "group_aggregate":
    group_by = set(step.params.get("groupBy") or [])
    metric_aliases = {item.get("as") for item in (step.params.get("metrics") or []) if item.get("as")}
    return group_by | metric_aliases
  if step.op == "compare_period":
    return {"current_value", "previous_value", "delta", "delta_pct"}
  return set(merged)


def _merged_fields(input_refs: list[str], output_fields: dict[str, set[str]]) -> set[str]:
  merged: set[str] = set()
  for ref in input_refs:
    merged |= set(output_fields.get(ref) or set())
  return merged
