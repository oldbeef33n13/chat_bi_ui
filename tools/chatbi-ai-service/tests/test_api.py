from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health():
  response = client.get("/health")
  assert response.status_code == 200
  assert response.json()["status"] == "ok"


def test_capabilities_prompt_versions():
  response = client.get("/api/v1/ai/capabilities")
  assert response.status_code == 200
  payload = response.json()
  assert payload["promptVersions"]["chart_recommend"] == "v2"
  assert payload["promptVersions"]["command_plan"] == "v2"


def test_chart_recommend():
  response = client.post(
    "/api/v1/ai/chart/recommend",
    json={
      "requestedType": "auto",
      "fields": [
        {"name": "stat_date", "label": "统计日期", "type": "time"},
        {"name": "alarm_count", "label": "告警数", "type": "number"},
      ],
      "context": {"docType": "dashboard", "trigger": "inspector"},
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["chartType"] in {"line", "combo"}
  assert any(binding["role"] == "x" for binding in payload["bindings"])


def test_command_plan():
  response = client.post(
    "/api/v1/ai/command-plan",
    json={"input": "改成柱状图并开启标签", "currentNodeId": "chart_1"},
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["plan"]["targets"] == ["chart_1"]
  assert len(payload["plan"]["commands"]) >= 1
