from app.analysis.executor import execute_analysis_plan
from app.analysis.validator import validate_analysis_plan


def test_validate_analysis_plan_accepts_valid_single_source_plan():
  source_catalog = {
    "ops_alarm_trend": {
      "schema": [
        {"name": "stat_date", "type": "time"},
        {"name": "region", "type": "string"},
        {"name": "alarm_count", "type": "number"},
      ],
      "joinHints": [],
    }
  }
  payload = {
    "version": "ap_v1",
    "goal": "分析华东区域近7天告警波动",
    "analysisMode": "single_source",
    "sources": [{"alias": "ops_alarm_trend", "sourceId": "ops_alarm_trend"}],
    "steps": [
      {
        "id": "step_01",
        "op": "filter_rows",
        "input": "ops_alarm_trend",
        "params": {
          "logic": "and",
          "conditions": [{"field": "region", "op": "eq", "value": "华东"}],
        },
        "output": "ops_alarm_trend_filtered",
      },
      {
        "id": "step_02",
        "op": "group_aggregate",
        "input": "ops_alarm_trend_filtered",
        "params": {
          "groupBy": ["stat_date"],
          "metrics": [{"field": "alarm_count", "agg": "sum", "as": "alarm_count"}],
        },
        "output": "ops_alarm_trend_summary",
      },
    ],
    "finalOutputs": [{"stepId": "step_02", "as": "summary_table"}],
  }

  plan = validate_analysis_plan(payload, source_catalog)

  assert plan.version == "ap_v1"
  assert plan.sources[0].sourceId == "ops_alarm_trend"
  assert plan.steps[-1].output == "ops_alarm_trend_summary"


def test_validate_analysis_plan_rejects_unknown_field():
  source_catalog = {
    "ops_alarm_trend": {
      "schema": [
        {"name": "stat_date", "type": "time"},
        {"name": "region", "type": "string"},
        {"name": "alarm_count", "type": "number"},
      ],
      "joinHints": [],
    }
  }
  payload = {
    "version": "ap_v1",
    "goal": "分析告警波动",
    "analysisMode": "single_source",
    "sources": [{"alias": "ops_alarm_trend", "sourceId": "ops_alarm_trend"}],
    "steps": [
      {
        "id": "step_01",
        "op": "filter_rows",
        "input": "ops_alarm_trend",
        "params": {
          "logic": "and",
          "conditions": [{"field": "unknown_field", "op": "eq", "value": "华东"}],
        },
        "output": "ops_alarm_trend_filtered",
      }
    ],
    "finalOutputs": [{"stepId": "step_01", "as": "summary_table"}],
  }

  try:
    validate_analysis_plan(payload, source_catalog)
  except ValueError as error:
    assert "unknown filter field" in str(error)
  else:
    raise AssertionError("expected validate_analysis_plan to reject unknown field")


def test_execute_analysis_plan_runs_filter_group_sort_topn():
  source_catalog = {
    "ops_capacity_topn": {
      "schema": [
        {"name": "region", "type": "string"},
        {"name": "link_name", "type": "string"},
        {"name": "utilization_pct", "type": "number"},
      ],
      "joinHints": [],
    }
  }
  payload = {
    "version": "ap_v1",
    "goal": "找出华南区域链路利用率最高的5条线路",
    "analysisMode": "single_source",
    "sources": [{"alias": "ops_capacity_topn", "sourceId": "ops_capacity_topn"}],
    "steps": [
      {
        "id": "step_01",
        "op": "filter_rows",
        "input": "ops_capacity_topn",
        "params": {
          "logic": "and",
          "conditions": [{"field": "region", "op": "eq", "value": "华南"}],
        },
        "output": "ops_capacity_topn_filtered",
      },
      {
        "id": "step_02",
        "op": "group_aggregate",
        "input": "ops_capacity_topn_filtered",
        "params": {
          "groupBy": ["link_name"],
          "metrics": [{"field": "utilization_pct", "agg": "avg", "as": "utilization_pct_value"}],
        },
        "output": "ops_capacity_topn_summary",
      },
      {
        "id": "step_03",
        "op": "sort_rows",
        "input": "ops_capacity_topn_summary",
        "params": {"by": [{"field": "utilization_pct_value", "direction": "desc"}]},
        "output": "ops_capacity_topn_sorted",
      },
      {
        "id": "step_04",
        "op": "top_n",
        "input": "ops_capacity_topn_sorted",
        "params": {"field": "utilization_pct_value", "n": 3, "direction": "desc"},
        "output": "summary_table",
      },
    ],
    "finalOutputs": [{"stepId": "step_04", "as": "summary_table"}],
  }
  plan = validate_analysis_plan(payload, source_catalog)
  source_rows = {
    "ops_capacity_topn": [
      {"region": "华南", "link_name": "广州-深圳A", "utilization_pct": 93.2},
      {"region": "华南", "link_name": "广州-深圳B", "utilization_pct": 91.4},
      {"region": "华南", "link_name": "广州-东莞", "utilization_pct": 88.6},
      {"region": "华东", "link_name": "上海-苏州", "utilization_pct": 72.3},
    ]
  }

  execution = execute_analysis_plan(plan, source_rows)

  assert execution["status"] == "succeeded"
  assert execution["resultTables"][0]["name"] == "summary_table"
  assert execution["resultTables"][0]["rowCount"] == 3
  assert execution["resultTables"][0]["rows"][0]["link_name"] == "广州-深圳A"


def test_execute_analysis_plan_compare_period_uses_metric_alias():
  source_catalog = {
    "ops_ticket_summary": {
      "schema": [
        {"name": "stat_date", "type": "time"},
        {"name": "close_efficiency", "type": "number"},
      ],
      "joinHints": [],
    }
  }
  payload = {
    "version": "ap_v1",
    "goal": "比较本周和上周工单关闭效率变化",
    "analysisMode": "single_source",
    "sources": [{"alias": "ops_ticket_summary", "sourceId": "ops_ticket_summary"}],
    "steps": [
      {
        "id": "step_01",
        "op": "group_aggregate",
        "input": "ops_ticket_summary",
        "params": {
          "groupBy": ["stat_date"],
          "metrics": [{"field": "close_efficiency", "agg": "avg", "as": "close_efficiency_value"}],
        },
        "output": "ops_ticket_summary_summary",
      },
      {
        "id": "step_02",
        "op": "compare_period",
        "input": "ops_ticket_summary_summary",
        "params": {
          "dateField": "stat_date",
          "metricField": "close_efficiency_value",
          "current": ["本周开始", "本周结束"],
          "previous": ["上周开始", "上周结束"],
        },
        "output": "summary_table",
      },
    ],
    "finalOutputs": [{"stepId": "step_02", "as": "summary_table"}],
  }
  plan = validate_analysis_plan(payload, source_catalog)
  source_rows = {
    "ops_ticket_summary": [
      {"stat_date": "2026-02-23", "close_efficiency": 0.84},
      {"stat_date": "2026-02-24", "close_efficiency": 0.86},
      {"stat_date": "2026-02-25", "close_efficiency": 0.87},
      {"stat_date": "2026-03-01", "close_efficiency": 0.89},
      {"stat_date": "2026-03-02", "close_efficiency": 0.91},
      {"stat_date": "2026-03-03", "close_efficiency": 0.92},
    ]
  }

  execution = execute_analysis_plan(plan, source_rows)
  row = execution["resultTables"][0]["rows"][0]

  assert execution["status"] == "succeeded"
  assert set(row.keys()) == {"current_value", "previous_value", "delta", "delta_pct"}
  assert row["delta"] > 0
