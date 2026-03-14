from __future__ import annotations

import json
from io import StringIO
from pathlib import Path

from app.cli import main


ROOT = Path(__file__).resolve().parents[1]


def test_cli_capabilities(capsys):
  exit_code = main(["capabilities"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["provider"] == "rule"
  assert "chart_recommend" in payload["surfaces"]
  assert payload["promptVersions"]["chart_recommend"] == "v2"


def test_cli_chart_recommend_from_case_file(capsys):
  case_path = ROOT / "evals" / "chart_recommend" / "case_001.json"
  exit_code = main(["chart-recommend", "--input", str(case_path), "--pretty"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["scene"] == "chart_recommend"
  assert payload["inputId"] == "chart_recommend_basic_001"
  assert payload["promptVersion"] == "v2"
  assert payload["result"]["chartType"] in {"line", "combo"}


def test_cli_command_plan_from_json(capsys):
  raw = json.dumps({"input": "改成柱状图并开启标签", "currentNodeId": "chart_1"}, ensure_ascii=False)
  exit_code = main(["command-plan", "--json", raw])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["scene"] == "command_plan"
  assert payload["result"]["plan"]["targets"] == ["chart_1"]


def test_cli_story_summary_from_stdin(monkeypatch, capsys):
  raw = json.dumps(
    {
      "docType": "report",
      "title": "网络运行周报",
      "focus": "管理层摘要",
      "insights": ["本周告警上升", "容量压力增加"],
    },
    ensure_ascii=False,
  )
  monkeypatch.setattr("sys.stdin", StringIO(raw))
  exit_code = main(["story-summary", "--stdin"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["scene"] == "story_summary"
  assert "conclusion" in payload["result"]


def test_cli_eval_single_scene(capsys):
  exit_code = main(["eval", "--scene", "chart_recommend"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["caseCount"] >= 5
  assert payload["scenes"][0]["scene"] == "chart_recommend"


def test_cli_eval_markdown(capsys):
  exit_code = main(["eval", "--case-id", "story_summary_basic_001", "--report", "markdown"])
  assert exit_code == 0
  output = capsys.readouterr().out
  assert "ChatBI AI Eval Report" in output
  assert "story_summary" in output


def test_cli_eval_filter_by_tag(capsys):
  exit_code = main(["eval", "--scene", "chart_recommend", "--tag", "sankey"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["caseCount"] == 2
  assert {item["caseId"] for item in payload["results"]} == {"chart_recommend_basic_004", "chart_recommend_flow_007"}


def test_cli_compare_versions(capsys):
  exit_code = main(
    [
      "compare",
      "--scene",
      "chart_recommend",
      "--case-id",
      "chart_recommend_basic_001",
      "--baseline",
      "v2",
      "--candidate",
      "v2",
    ]
  )
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["baselineVersion"] == "v2"
  assert payload["candidateVersion"] == "v2"
  assert payload["caseCount"] == 1


def test_cli_composed_eval(capsys):
  exit_code = main(["composed-eval", "--flow-type", "router"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["mode"] == "composed"
  assert payload["flows"][0]["flowType"] == "router"


def test_cli_composed_conversation_eval(capsys):
  exit_code = main(["composed-eval", "--flow-type", "conversation"])
  assert exit_code == 0
  payload = json.loads(capsys.readouterr().out)
  assert payload["mode"] == "composed"
  assert payload["flows"][0]["flowType"] == "conversation"
