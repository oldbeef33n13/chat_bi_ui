from __future__ import annotations

from dataclasses import dataclass
import json
from typing import Any

import httpx

from app.core.pipeline.postprocess import safe_json_loads
from app.core.settings import is_coding_dashscope_base_url


@dataclass
class OpenAiCompatibleClient:
  base_url: str
  api_key: str
  model: str
  timeout_seconds: float = 45.0
  max_retries: int = 1

  def chat_json(self, *, scene: str, system_prompt: str, user_payload: dict[str, Any]) -> dict[str, Any] | None:
    request_payload = {
      "model": self.model,
      "temperature": 0.1,
      "response_format": {"type": "json_object"},
      "messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
      ],
    }
    if self._supports_disable_thinking():
      request_payload["enable_thinking"] = False
    response = None
    last_exception: Exception | None = None
    for attempt in range(self.max_retries + 1):
      try:
        response = httpx.post(
          f"{self.base_url.rstrip('/')}/chat/completions",
          headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
          },
          json=request_payload,
          timeout=self.timeout_seconds,
        )
        break
      except (httpx.TimeoutException, httpx.TransportError) as exc:
        last_exception = exc
        if attempt >= self.max_retries:
          raise
    if response is None and last_exception is not None:
      raise last_exception
    try:
      response.raise_for_status()
    except httpx.HTTPStatusError as exc:
      raise ValueError(self._build_error_message(exc)) from exc
    payload = response.json()
    content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content")) or ""
    if isinstance(content, list):
      content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    parsed = safe_json_loads(str(content))
    if parsed is None:
      raise ValueError(f"{scene} provider returned non-json content")
    return parsed

  def _supports_disable_thinking(self) -> bool:
    lowered = self.model.lower()
    return lowered.startswith("qwen3") or lowered.startswith("qwen3.5")

  def _build_error_message(self, exc: httpx.HTTPStatusError) -> str:
    response = exc.response
    body = response.text
    hint = ""
    if is_coding_dashscope_base_url(self.base_url) and "model `" in body and "is not supported" in body:
      hint = " Hint: coding.dashscope.aliyuncs.com/v1 supports models like qwen3.5-plus, qwen3-coder-plus and qwen3-max-2026-01-23."
    return f"{exc}.{hint} Response body: {body[:500]}"
