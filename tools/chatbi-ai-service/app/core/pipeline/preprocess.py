from __future__ import annotations

from typing import Any


def normalize_prompt(text: str) -> str:
  return " ".join(text.strip().split())


def compact_rows(rows: list[dict[str, Any]], limit: int = 12) -> list[dict[str, Any]]:
  return rows[:limit]


def compact_fields(fields: list[dict[str, Any]], limit: int = 24) -> list[dict[str, Any]]:
  return fields[:limit]
