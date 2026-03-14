from __future__ import annotations

from dataclasses import dataclass
from os import getenv
from pathlib import Path

from app.core.env import load_env_file


def _repo_root() -> Path:
  return Path(__file__).resolve().parents[4]


def _load_local_env() -> dict[str, str]:
  root = _repo_root()
  merged: dict[str, str] = {}
  for candidate in (root / ".runtime" / "ai.env", root / "tools" / "chatbi-ai-service" / ".env.local"):
    merged.update(load_env_file(candidate))
  return merged


_LOCAL_ENV = _load_local_env()


def _read_env(name: str, default: str | None = None) -> str | None:
  return getenv(name) or _LOCAL_ENV.get(name) or default


def is_coding_dashscope_base_url(base_url: str | None) -> bool:
  return bool(base_url and "coding.dashscope.aliyuncs.com" in base_url.lower())


def resolve_openai_model(base_url: str | None, configured_model: str | None) -> str:
  model = (configured_model or "").strip()
  if is_coding_dashscope_base_url(base_url):
    if model in {"", "qwen-plus", "qwen-max", "qwen-turbo"}:
      return "qwen3.5-plus"
    return model
  if model:
    return model
  return "qwen-plus"


@dataclass(frozen=True)
class Settings:
  app_name: str = "chatbi-ai-service"
  app_version: str = "0.1.0"
  provider_mode: str = _read_env("CHATBI_AI_PROVIDER", "auto") or "auto"
  openai_base_url: str | None = _read_env("CHATBI_OPENAI_BASE_URL")
  openai_api_key: str | None = _read_env("CHATBI_OPENAI_API_KEY")
  openai_model: str = resolve_openai_model(_read_env("CHATBI_OPENAI_BASE_URL"), _read_env("CHATBI_OPENAI_MODEL"))
  request_timeout_seconds: float = float(_read_env("CHATBI_AI_TIMEOUT_SECONDS", "45") or "45")
  app_server_base_url: str = _read_env("CHATBI_APP_SERVER_BASE_URL", "http://127.0.0.1:18080/api/v1") or "http://127.0.0.1:18080/api/v1"
  orchestration_db_path: str = _read_env("CHATBI_AI_ORCH_DB_PATH", str(_repo_root() / ".runtime" / "ai-orchestration.db")) or str(_repo_root() / ".runtime" / "ai-orchestration.db")

  @property
  def resolved_provider(self) -> str:
    if self.provider_mode == "rule":
      return "rule"
    if self.provider_mode in {"openai_compatible", "auto"} and self.openai_base_url and self.openai_api_key:
      return "openai_compatible"
    return "rule"


settings = Settings()
