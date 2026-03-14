from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from app.core.composed import render_composed_eval_markdown, run_composed_eval
from app.core.dispatch import SCENES, build_capabilities_payload, execute_scene
from app.core.eval import render_eval_compare_markdown, render_eval_markdown, run_eval, run_eval_compare


SCENE_COMMANDS = {
  "command-plan": "command_plan",
  "chart-recommend": "chart_recommend",
  "chart-ask": "chart_ask",
  "data-guide": "data_guide",
  "story-summary": "story_summary",
}


def build_parser() -> argparse.ArgumentParser:
  parser = argparse.ArgumentParser(prog="python -m app.cli", description="ChatBI AI service CLI")
  subparsers = parser.add_subparsers(dest="command", required=True)

  subparsers.add_parser("capabilities", help="show ai service capabilities")
  eval_parser = subparsers.add_parser("eval", help="run eval cases")
  eval_parser.add_argument("--scene", choices=SCENES, help="run eval for a single scene")
  eval_parser.add_argument("--all", action="store_true", help="run eval for all scenes")
  eval_parser.add_argument("--case-id", help="run one eval case by id")
  eval_parser.add_argument("--tag", action="append", dest="tags", help="filter eval cases by tag, can be repeated")
  eval_parser.add_argument("--prompt-version", help="prompt version label override")
  eval_parser.add_argument("--report", choices=["json", "markdown"], default="json", help="output report format")
  eval_parser.add_argument("--pretty", action="store_true", help="pretty print json")
  eval_parser.add_argument("--output", help="write output to file")

  compare_parser = subparsers.add_parser("compare", help="compare two prompt versions on eval cases")
  compare_parser.add_argument("--scene", choices=SCENES, help="compare a single scene")
  compare_parser.add_argument("--all", action="store_true", help="compare all scenes")
  compare_parser.add_argument("--case-id", help="compare one eval case by id")
  compare_parser.add_argument("--tag", action="append", dest="tags", help="filter eval cases by tag, can be repeated")
  compare_parser.add_argument("--baseline", required=True, help="baseline prompt version")
  compare_parser.add_argument("--candidate", required=True, help="candidate prompt version")
  compare_parser.add_argument("--report", choices=["json", "markdown"], default="json", help="output report format")
  compare_parser.add_argument("--pretty", action="store_true", help="pretty print json")
  compare_parser.add_argument("--output", help="write output to file")

  composed_parser = subparsers.add_parser("composed-eval", help="run composed eval cases")
  composed_parser.add_argument("--flow-type", choices=["router", "analysis_pipeline", "multi_source", "conversation"], help="run one composed flow type")
  composed_parser.add_argument("--case-id", help="run one composed eval case by id")
  composed_parser.add_argument("--tag", action="append", dest="tags", help="filter composed cases by tag, can be repeated")
  composed_parser.add_argument("--report", choices=["json", "markdown"], default="json", help="output report format")
  composed_parser.add_argument("--pretty", action="store_true", help="pretty print json")
  composed_parser.add_argument("--output", help="write output to file")

  for command_name in SCENE_COMMANDS:
    scene_parser = subparsers.add_parser(command_name, help=f"run {command_name} scene once")
    scene_parser.add_argument("--input", dest="input_path", help="input case json file path")
    scene_parser.add_argument("--json", dest="json_text", help="inline json payload")
    scene_parser.add_argument("--stdin", action="store_true", help="read json payload from stdin")
    scene_parser.add_argument("--pretty", action="store_true", help="pretty print json")
    scene_parser.add_argument("--output", help="write json output to file")
    scene_parser.add_argument("--prompt-version", help="prompt version label override")

  return parser


def main(argv: list[str] | None = None) -> int:
  parser = build_parser()
  args = parser.parse_args(argv)

  if args.command == "capabilities":
    payload = build_capabilities_payload()
    return emit_output(payload, pretty=True)

  if args.command == "eval":
    scene = None if args.all or args.case_id else args.scene
    summary = run_eval(scene=scene, case_id=args.case_id, tags=args.tags, prompt_version=args.prompt_version)
    if args.report == "markdown":
      return emit_text_output(render_eval_markdown(summary), output_path=args.output)
    return emit_output(summary, pretty=bool(args.pretty), output_path=args.output)

  if args.command == "compare":
    scene = None if args.all or args.case_id else args.scene
    report = run_eval_compare(
      scene=scene,
      case_id=args.case_id,
      tags=args.tags,
      baseline_prompt_version=args.baseline,
      candidate_prompt_version=args.candidate,
    )
    if args.report == "markdown":
      return emit_text_output(render_eval_compare_markdown(report), output_path=args.output)
    return emit_output(report, pretty=bool(args.pretty), output_path=args.output)

  if args.command == "composed-eval":
    summary = run_composed_eval(flow_type=args.flow_type, case_id=args.case_id, tags=args.tags)
    if args.report == "markdown":
      return emit_text_output(render_composed_eval_markdown(summary), output_path=args.output)
    return emit_output(summary, pretty=bool(args.pretty), output_path=args.output)

  if args.command not in SCENE_COMMANDS:
    parser.error(f"unsupported command: {args.command}")

  raw_payload, input_id = load_input_payload(args)
  scene = SCENE_COMMANDS[args.command]
  if "scene" in raw_payload and "input" in raw_payload:
    if raw_payload["scene"] != scene:
      raise SystemExit(f"scene mismatch: expected {scene}, got {raw_payload['scene']}")
    raw_payload = raw_payload["input"]

  started_at = time.perf_counter()
  execution, provider, prompt_version = execute_scene(scene, raw_payload, args.prompt_version)
  latency_ms = round((time.perf_counter() - started_at) * 1000)
  payload = {
    "scene": scene,
    "provider": provider,
    "model": build_capabilities_payload().get("model"),
    "promptVersion": prompt_version,
    "inputId": input_id,
    "result": execution.response,
    "meta": {
      "latencyMs": latency_ms,
      "source": execution.response.get("source"),
      "fallbackUsed": execution.meta.fallback_used,
      "providerAttempted": execution.meta.provider_attempted,
      "providerSucceeded": execution.meta.provider_succeeded,
      "providerOutcome": execution.meta.outcome,
      "partialFallback": execution.meta.partial_fallback,
      "errorType": execution.meta.error_type,
      "errorMessage": execution.meta.error_message,
    },
  }
  return emit_output(payload, pretty=bool(args.pretty), output_path=args.output)


def load_input_payload(args: argparse.Namespace) -> tuple[dict[str, Any], str | None]:
  sources = [bool(args.input_path), bool(args.json_text), bool(args.stdin)]
  if sum(sources) != 1:
    raise SystemExit("exactly one of --input, --json or --stdin must be provided")

  if args.input_path:
    path = Path(args.input_path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload, payload.get("id")

  if args.json_text:
    return json.loads(args.json_text), None

  return json.loads(sys.stdin.read()), None


def emit_output(payload: dict[str, Any], *, pretty: bool, output_path: str | None = None) -> int:
  text = json.dumps(payload, ensure_ascii=False, indent=2 if pretty else None)
  return emit_text_output(text, output_path=output_path)


def emit_text_output(text: str, *, output_path: str | None = None) -> int:
  if output_path:
    Path(output_path).write_text(text + "\n", encoding="utf-8")
  else:
    sys.stdout.write(text + "\n")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
