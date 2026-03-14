from __future__ import annotations

from typing import Any

import httpx


class JavaAppGateway:
  def __init__(self, base_url: str, timeout_seconds: float) -> None:
    self._base_url = base_url.rstrip("/")
    self._timeout_seconds = timeout_seconds

  def get_template_content(self, template_id: str) -> dict[str, Any]:
    return self._request("GET", f"/templates/{template_id}/content")

  def preview_template(self, template_id: str, variables: dict[str, Any] | None = None, dsl: dict[str, Any] | None = None) -> dict[str, Any]:
    return self._request("POST", f"/templates/{template_id}/preview", json={"variables": variables or {}, "dsl": dsl})

  def test_data_endpoint(self, endpoint_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return self._request("POST", f"/data-endpoints/{endpoint_id}/test", json={"params": params or {}})

  def _request(self, method: str, path: str, json: dict[str, Any] | None = None) -> dict[str, Any]:
    response = httpx.request(method, f"{self._base_url}{path}", json=json, timeout=self._timeout_seconds)
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, dict) else {"data": payload}
