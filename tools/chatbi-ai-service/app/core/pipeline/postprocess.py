from __future__ import annotations

import json
from typing import Any


def safe_json_loads(raw: str) -> dict[str, Any] | None:
  text = raw.strip()
  if not text:
    return None
  try:
    return json.loads(text)
  except json.JSONDecodeError:
    pass
  if "```" in text:
    parts = text.split("```")
    for part in parts:
      part = part.strip()
      if not part:
        continue
      if part.startswith("json"):
        part = part[4:].strip()
      try:
        return json.loads(part)
      except json.JSONDecodeError:
        continue
  return None


def coerce_string_list(value: Any) -> list[str]:
  if isinstance(value, list):
    return [str(item) for item in value if item is not None]
  if value is None:
    return []
  return [str(value)]
