from __future__ import annotations

import httpx

from app.core.llm.openai_compatible import OpenAiCompatibleClient


class _DummyResponse:
  def __init__(self, payload: dict):
    self._payload = payload
    self.text = "{}"

  def raise_for_status(self) -> None:
    return None

  def json(self) -> dict:
    return self._payload


def test_openai_compatible_client_retries_once_on_timeout(monkeypatch):
  attempts = {"count": 0}

  def fake_post(*args, **kwargs):
    attempts["count"] += 1
    if attempts["count"] == 1:
      raise httpx.ReadTimeout("timed out")
    return _DummyResponse(
      {
        "choices": [
          {
            "message": {
              "content": "{\"chartType\":\"line\",\"bindings\":[{\"role\":\"x\",\"field\":\"stat_date\"}],\"reasons\":[\"ok\"]}"
            }
          }
        ]
      }
    )

  monkeypatch.setattr(httpx, "post", fake_post)
  client = OpenAiCompatibleClient(
    base_url="https://coding.dashscope.aliyuncs.com/v1",
    api_key="test-key",
    model="qwen3.5-plus",
    timeout_seconds=1.0,
    max_retries=1,
  )
  payload = client.chat_json(scene="chart_recommend", system_prompt="test", user_payload={"foo": "bar"})
  assert attempts["count"] == 2
  assert payload["chartType"] == "line"
