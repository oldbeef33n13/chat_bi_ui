from app.core.eval import load_eval_cases, render_eval_compare_markdown, render_eval_markdown, run_eval, run_eval_compare


def test_eval_runner_for_single_scene():
  summary = run_eval(scene="chart_recommend")
  assert summary["caseCount"] == len(load_eval_cases(scene="chart_recommend"))
  assert summary["scenes"][0]["scene"] == "chart_recommend"
  assert summary["provider"] == "rule"


def test_eval_runner_markdown_report():
  summary = run_eval(case_id="story_summary_basic_001")
  report = render_eval_markdown(summary)
  assert "ChatBI AI Eval Report" in report
  assert "story_summary" in report


def test_eval_runner_filter_by_tag():
  summary = run_eval(scene="chart_recommend", tags=["sankey"])
  assert summary["caseCount"] == 2
  assert {item["caseId"] for item in summary["results"]} == {"chart_recommend_basic_004", "chart_recommend_flow_007"}


def test_eval_runner_compare_versions():
  report = run_eval_compare(scene="chart_recommend", case_id="chart_recommend_basic_001", baseline_prompt_version="v2", candidate_prompt_version="v2")
  assert report["baselineVersion"] == "v2"
  assert report["candidateVersion"] == "v2"
  assert report["caseCount"] == 1
  markdown = render_eval_compare_markdown(report)
  assert "ChatBI AI Prompt Compare Report" in markdown
