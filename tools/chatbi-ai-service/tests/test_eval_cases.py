from __future__ import annotations

import json
from pathlib import Path

from app.models import (
  ChartAskRequest,
  ChartRecommendRequest,
  CommandPlanRequest,
  DataGuideRequest,
  StorySummaryRequest,
)


ROOT = Path(__file__).resolve().parents[1]
EVALS_DIR = ROOT / "evals"

SCENE_MODELS = {
  "command_plan": CommandPlanRequest,
  "chart_recommend": ChartRecommendRequest,
  "chart_ask": ChartAskRequest,
  "data_guide": DataGuideRequest,
  "story_summary": StorySummaryRequest,
}


def test_eval_case_directories_exist():
  for scene in SCENE_MODELS:
    assert (EVALS_DIR / scene).exists(), f"missing eval dir for {scene}"


def test_all_eval_cases_have_valid_shape():
  case_files = sorted(EVALS_DIR.glob("*/*.json"))
  assert case_files, "expected at least one eval case"

  ids: set[str] = set()
  for case_file in case_files:
    payload = json.loads(case_file.read_text(encoding="utf-8"))
    assert payload["id"] not in ids, f"duplicate case id: {payload['id']}"
    ids.add(payload["id"])

    scene = payload["scene"]
    assert scene == case_file.parent.name, f"scene mismatch for {case_file}"
    assert payload["title"]
    assert isinstance(payload.get("tags"), list)
    assert "input" in payload
    assert "expect" in payload
    assert "score" in payload

    model = SCENE_MODELS[scene]
    model.model_validate(payload["input"])

    score = payload["score"]
    assert 0 <= score["minimumPassScore"] <= 1
    assert score["weights"], f"missing weights for {case_file}"
