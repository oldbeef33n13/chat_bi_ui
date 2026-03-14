from __future__ import annotations

from typing import Any


def render_composed_eval_markdown(summary: dict[str, Any]) -> str:
  lines = [
    "# ChatBI AI Composed Eval Report",
    "",
    f"- Supported Flows: `{', '.join(summary['supportedFlowTypes'])}`",
    f"- Cases: `{summary['caseCount']}`",
    f"- Pass: `{summary['passCount']}` / `{summary['caseCount']}` (`{summary['passRate']:.2%}`)",
    f"- Avg Latency: `{summary['avgLatencyMs']}` ms",
    f"- Avg Score: `{summary['avgScore']:.4f}`",
    "",
    "## Flow Summary",
    "",
    "| Flow Type | Cases | Pass | Pass Rate | Avg Latency (ms) | Avg Score |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ]
  for item in summary["flows"]:
    lines.append(
      f"| {item['flowType']} | {item['caseCount']} | {item['passCount']} | {item['passRate']:.2%} | {item['avgLatencyMs']} | {item['avgScore']:.4f} |"
    )

  failed = [item for item in summary["results"] if not item["passed"]]
  lines.extend(["", "## Failed Cases", ""])
  if not failed:
    lines.append("All composed cases passed.")
  else:
    lines.append("| Case ID | Flow Type | Score | Failures |")
    lines.append("| --- | --- | ---: | --- |")
    for item in failed:
      failure_text = ", ".join(item["score"]["failures"]) or "score_below_threshold"
      lines.append(f"| {item['caseId']} | {item['flowType']} | {item['score']['total']:.4f} | {failure_text} |")
  return "\n".join(lines)
