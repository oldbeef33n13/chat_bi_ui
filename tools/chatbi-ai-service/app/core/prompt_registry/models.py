from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PromptVersionRecord(BaseModel):
  status: str = "active"
  goal: str
  systemPrompt: str
  outputContract: dict[str, Any] = Field(default_factory=dict)
  notes: str | None = None
  updatedAt: str


class ScenePromptCatalog(BaseModel):
  scene: str
  activeVersion: str
  versions: dict[str, PromptVersionRecord]


class PromptDefinition(BaseModel):
  scene: str
  version: str
  status: str
  goal: str
  systemPrompt: str
  outputContract: dict[str, Any] = Field(default_factory=dict)
  notes: str | None = None
  updatedAt: str
