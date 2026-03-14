from app.core.composed import load_composed_cases, render_composed_eval_markdown, run_composed_eval


def test_composed_runner_for_router_flow():
  summary = run_composed_eval(flow_type="router")
  assert summary["caseCount"] == len(load_composed_cases(flow_type="router"))
  assert summary["flows"][0]["flowType"] == "router"
  assert summary["passCount"] == summary["caseCount"]


def test_composed_runner_for_analysis_pipeline_flow():
  summary = run_composed_eval(flow_type="analysis_pipeline")
  assert summary["caseCount"] == len(load_composed_cases(flow_type="analysis_pipeline"))
  assert summary["flows"][0]["flowType"] == "analysis_pipeline"
  assert summary["passCount"] == summary["caseCount"]


def test_composed_runner_for_multi_source_flow():
  summary = run_composed_eval(flow_type="multi_source")
  assert summary["caseCount"] == len(load_composed_cases(flow_type="multi_source"))
  assert summary["flows"][0]["flowType"] == "multi_source"
  assert summary["passCount"] == summary["caseCount"]


def test_composed_runner_for_conversation_flow():
  summary = run_composed_eval(flow_type="conversation")
  assert summary["caseCount"] == len(load_composed_cases(flow_type="conversation"))
  assert summary["flows"][0]["flowType"] == "conversation"
  assert summary["passCount"] == summary["caseCount"]


def test_composed_conversation_can_embed_analysis_pipeline():
  summary = run_composed_eval(case_id="composed_conversation_001")
  turns = summary["results"][0]["result"]["turns"]
  second_turn = turns[1]
  assert second_turn["scene"] == "analysis_planner"
  assert second_turn["analysis"]["execution"]["status"] == "succeeded"
  assert second_turn["analysis"]["execution"]["resultTables"][0]["name"] == "summary_table"


def test_composed_runner_markdown_report():
  summary = run_composed_eval(case_id="composed_router_001")
  report = render_composed_eval_markdown(summary)
  assert "ChatBI AI Composed Eval Report" in report
  assert "router" in report
