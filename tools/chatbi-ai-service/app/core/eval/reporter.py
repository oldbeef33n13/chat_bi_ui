from __future__ import annotations

from typing import Any


def render_eval_markdown(summary: dict[str, Any]) -> str:
  lines = [
    "# ChatBI AI Eval Report",
    "",
    f"- Provider: `{summary['provider']}`",
    f"- Prompt Version: `{summary['promptVersion']}`",
    f"- Cases: `{summary['caseCount']}`",
    f"- Pass: `{summary['passCount']}` / `{summary['caseCount']}` (`{summary['passRate']:.2%}`)",
    f"- Fallback: `{summary['fallbackCount']}`",
    f"- Avg Latency: `{summary['avgLatencyMs']}` ms",
    f"- Avg Score: `{summary['avgScore']:.4f}`",
    "",
    "## Scene Summary",
    "",
    "| Scene | Cases | Pass | Pass Rate | Fallback | Avg Latency (ms) | Avg Score |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for item in summary["scenes"]:
    lines.append(
      f"| {item['scene']} | {item['caseCount']} | {item['passCount']} | {item['passRate']:.2%} | {item['fallbackCount']} | {item['avgLatencyMs']} | {item['avgScore']:.4f} |"
    )

  failed = [item for item in summary["results"] if not item["passed"]]
  lines.extend(["", "## Failed Cases", ""])
  if not failed:
    lines.append("All cases passed.")
  else:
    lines.append("| Case ID | Scene | Score | Failures |")
    lines.append("| --- | --- | ---: | --- |")
    for item in failed:
      failure_text = ", ".join(item["score"]["failures"]) or "score_below_threshold"
      lines.append(f"| {item['caseId']} | {item['scene']} | {item['score']['total']:.4f} | {failure_text} |")

  return "\n".join(lines)


def render_eval_compare_markdown(report: dict[str, Any]) -> str:
  baseline = report["baselineSummary"]
  candidate = report["candidateSummary"]
  delta = report["delta"]
  lines = [
    "# ChatBI AI Prompt Compare Report",
    "",
    f"- Provider: `{report['provider']}`",
    f"- Baseline: `{report['baselineVersion']}`",
    f"- Candidate: `{report['candidateVersion']}`",
    f"- Cases: `{report['caseCount']}`",
    "",
    "| Metric | Baseline | Candidate | Delta |",
    "| --- | ---: | ---: | ---: |",
    f"| Pass Count | {baseline['passCount']} | {candidate['passCount']} | {delta['passCount']} |",
    f"| Pass Rate | {baseline['passRate']:.2%} | {candidate['passRate']:.2%} | {delta['passRate']:.2%} |",
    f"| Avg Score | {baseline['avgScore']:.4f} | {candidate['avgScore']:.4f} | {delta['avgScore']:.4f} |",
    f"| Provider Success | {baseline['providerSuccessCount']} | {candidate['providerSuccessCount']} | {delta['providerSuccessCount']} |",
    f"| Fallback Count | {baseline['fallbackCount']} | {candidate['fallbackCount']} | {delta['fallbackCount']} |",
    "",
    "## Changed Cases",
    "",
  ]
  changed = [
    item for item in report["results"]
    if item["delta"]["score"] != 0 or item["delta"]["passChanged"] or item["delta"]["providerSuccessChanged"]
  ]
  if not changed:
    lines.append("No case-level differences.")
  else:
    lines.append("| Case ID | Baseline Score | Candidate Score | Delta | Pass Changed | Provider Changed |")
    lines.append("| --- | ---: | ---: | ---: | --- | --- |")
    for item in changed:
      lines.append(
        f"| {item['caseId']} | {item['baseline']['score']:.4f} | {item['candidate']['score']:.4f} | "
        f"{item['delta']['score']:.4f} | {item['delta']['passChanged']} | {item['delta']['providerSuccessChanged']} |"
      )
  return "\n".join(lines)
