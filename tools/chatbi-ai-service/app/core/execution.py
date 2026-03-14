from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Literal, TypeVar

from pydantic import ValidationError


SceneOutcome = Literal[
  "rule_only",
  "provider_success",
  "provider_empty",
  "provider_invalid_payload",
  "provider_error",
]

T = TypeVar("T")


@dataclass(frozen=True)
class SceneExecutionMeta:
  provider_attempted: bool
  provider_succeeded: bool
  fallback_used: bool
  outcome: SceneOutcome
  partial_fallback: bool = False
  error_type: str | None = None
  error_message: str | None = None


@dataclass(frozen=True)
class SceneExecution(Generic[T]):
  response: T
  meta: SceneExecutionMeta


def shorten_error_message(exc: Exception, limit: int = 240) -> str:
  text = str(exc).strip()
  if len(text) <= limit:
    return text
  return text[: limit - 3] + "..."


def classify_provider_exception(exc: Exception) -> SceneOutcome:
  if isinstance(exc, ValidationError):
    return "provider_invalid_payload"
  return "provider_error"
