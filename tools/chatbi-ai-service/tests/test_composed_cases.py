from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSED_DIR = ROOT / "evals" / "composed"


def test_composed_eval_case_directories_exist():
  for flow_type in ("router", "analysis_pipeline", "multi_source", "conversation"):
    assert (COMPOSED_DIR / flow_type).exists(), f"missing composed eval dir for {flow_type}"


def test_all_composed_eval_cases_have_valid_shape():
  case_files = sorted(COMPOSED_DIR.glob("*/*.json"))
  assert case_files, "expected at least one composed eval case"

  ids: set[str] = set()
  for case_file in case_files:
    payload = json.loads(case_file.read_text(encoding="utf-8"))
    assert payload["id"] not in ids, f"duplicate composed case id: {payload['id']}"
    ids.add(payload["id"])

    assert payload["scene"] == "composed"
    assert payload["flowType"] == case_file.parent.name, f"flowType mismatch for {case_file}"
    assert payload["title"]
    assert isinstance(payload.get("tags"), list)
    assert isinstance(payload.get("input"), dict)
    assert isinstance(payload.get("expect"), dict)
    assert isinstance(payload.get("score"), dict)
    assert 0 <= payload["score"]["minimumPassScore"] <= 1
    assert payload["score"]["weights"]
