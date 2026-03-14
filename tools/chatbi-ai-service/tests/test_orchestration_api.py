from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def sample_report_snapshot() -> dict:
  return {
    "docId": "tpl_report_001",
    "docType": "report",
    "schemaVersion": "1.0.0",
    "title": "网络运行周报",
    "root": {
      "id": "root",
      "kind": "report",
      "props": {"reportTitle": "网络运行周报"},
      "children": [
        {
          "id": "section_1",
          "kind": "section",
          "props": {"title": "总体结论"},
          "children": [
            {
              "id": "chart_1",
              "kind": "chart",
              "data": {"sourceId": "ops_alarm_trend", "queryId": "query_alarm_trend"},
              "props": {
                "chartType": "line",
                "titleText": "区域告警趋势",
                "bindings": [
                  {"role": "x", "field": "stat_date"},
                  {"role": "y", "field": "alarm_count"},
                ],
              },
            }
          ],
        },
        {
          "id": "section_2",
          "kind": "section",
          "props": {"title": "容量分析"},
          "children": [
            {
              "id": "text_1",
              "kind": "text",
              "props": {"text": "容量分析说明"},
            }
          ],
        },
      ],
    },
  }


def test_build_object_registry():
  response = client.post(
    "/api/v1/ai/orch/object-registry/build",
    json={
      "baseRevision": 3,
      "snapshotDsl": sample_report_snapshot(),
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["docId"] == "tpl_report_001"
  ids = {item["objectId"] for item in payload["objects"]}
  assert "section_1" in ids
  assert "chart_1" in ids
  chart = next(item for item in payload["objects"] if item["objectId"] == "chart_1")
  assert chart["sectionId"] == "section_1"
  assert chart["chartType"] == "line"
  assert "ops_alarm_trend" in chart["sourceRefs"]


def test_route_selected_chart_for_edit():
  response = client.post(
    "/api/v1/ai/orch/route",
    json={
      "threadId": "thread_edit_001",
      "docId": "tpl_report_001",
      "docType": "report",
      "baseRevision": 3,
      "userText": "把这个图改成柱状图并加标签",
      "snapshotDsl": sample_report_snapshot(),
      "selectedObjectIds": ["chart_1"],
      "activeSectionId": "section_1",
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["intent"] == "ask_edit"
  assert payload["scene"] == "command_plan"
  assert payload["resolvedObjects"][0]["objectId"] == "chart_1"


def test_edit_proposal_uses_command_plan_scene():
  response = client.post(
    "/api/v1/ai/orch/edit/propose",
    json={
      "threadId": "thread_edit_002",
      "docId": "tpl_report_001",
      "docType": "report",
      "baseRevision": 3,
      "userText": "把这个图改成柱状图并加标签",
      "snapshotDsl": sample_report_snapshot(),
      "selectedObjectIds": ["chart_1"],
      "activeSectionId": "section_1",
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["proposal"]["scopeId"] == "chart_1"
  assert payload["proposal"]["commandPlan"]["targets"] == ["chart_1"]
  assert payload["ui"]["message"]
  assert payload["ui"]["confirmLabel"] == "确认更新"
  command_types = [item["type"] for item in payload["proposal"]["commandPlan"]["commands"]]
  assert "UpdateProps" in command_types


def test_edit_proposal_returns_structured_unsupported_for_traditional_flow():
  response = client.post(
    "/api/v1/ai/orch/edit/propose",
    json={
      "threadId": "thread_edit_unsupported_001",
      "docId": "tpl_report_001",
      "docType": "report",
      "baseRevision": 3,
      "userText": "帮我直接发布并导出这份报告",
      "snapshotDsl": sample_report_snapshot(),
      "selectedObjectIds": ["chart_1"],
      "activeSectionId": "section_1",
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["proposal"] is None
  assert payload["unsupported"]["code"] == "traditional_flow_only"
  assert payload["unsupported"]["recommendations"]


def test_create_and_get_report_generation_job():
  create_response = client.post(
    "/api/v1/ai/orch/generate/jobs",
    json={
      "threadId": "thread_generate_001",
      "docId": "tpl_report_001",
      "docType": "report",
      "baseRevision": 3,
      "userText": "生成一份面向领导的网络运行周报",
      "snapshotDsl": sample_report_snapshot(),
      "templateVariables": {"region": "华东"},
    },
  )
  assert create_response.status_code == 200
  created = create_response.json()["job"]
  create_payload = create_response.json()
  assert created["flowType"] == "report_generate"
  assert created["status"] == "ready"
  assert len(created["units"]) >= 3
  assert created["outline"]["units"][0]["unitType"] == "section"
  assert create_payload["ui"]["confirmLabel"] == "确认插入章节骨架"

  get_response = client.get(f"/api/v1/ai/orch/generate/jobs/{created['jobId']}")
  assert get_response.status_code == 200
  loaded = get_response.json()
  assert loaded["jobId"] == created["jobId"]
  assert loaded["outline"]["title"] == created["outline"]["title"]


def test_run_report_generation_unit_returns_section_artifact():
  create_response = client.post(
    "/api/v1/ai/orch/generate/jobs",
    json={
      "threadId": "thread_generate_002",
      "docId": "tpl_report_001",
      "docType": "report",
      "baseRevision": 3,
      "userText": "生成一份面向领导的网络运行周报",
      "snapshotDsl": sample_report_snapshot(),
      "templateVariables": {"region": "华东"},
    },
  )
  assert create_response.status_code == 200
  created = create_response.json()["job"]
  unit_id = created["units"][0]["unitId"]

  run_response = client.post(f"/api/v1/ai/orch/generate/jobs/{created['jobId']}/units/{unit_id}/run")
  assert run_response.status_code == 200
  job = run_response.json()
  unit = next(item for item in job["units"] if item["unitId"] == unit_id)

  assert unit["status"] == "ready"
  assert unit["artifact"]["artifactKind"] == "section"
  assert unit["artifact"]["node"]["kind"] == "section"
  assert unit["artifact"]["node"]["children"][0]["kind"] == "text"


def test_create_generation_job_returns_structured_unsupported_for_cross_doc_request():
  create_response = client.post(
    "/api/v1/ai/orch/generate/jobs",
    json={
      "threadId": "thread_generate_unsupported_001",
      "docId": "tpl_report_001",
      "docType": "report",
      "baseRevision": 3,
      "userText": "生成一份面向管理层的 PPT 汇报",
      "snapshotDsl": sample_report_snapshot(),
      "templateVariables": {"region": "华东"},
    },
  )
  assert create_response.status_code == 200
  payload = create_response.json()
  assert payload["job"] is None
  assert payload["unsupported"]["code"] == "cross_doc_generation"
  assert payload["unsupported"]["recommendations"]


def test_story_summary_returns_ui_metadata():
  response = client.post(
    "/api/v1/ai/story/summary",
    json={
      "docType": "report",
      "title": "网络运行周报",
      "focus": "请总结当前文档",
      "insights": ["告警总量周同比下降 12%", "华东区域恢复最快", "核心风险仍集中在跨域链路"],
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["headline"]
  assert payload["conclusion"]
  assert payload["ui"]["message"]
  assert payload["ui"]["confirmLabel"] == "保存章节草稿"
  assert payload["ui"]["appliedMessage"] == "已为你保存一份章节草稿。"


def test_runtime_analyze_returns_summary_and_plan():
  response = client.post(
    "/api/v1/ai/orch/runtime/analyze",
    json={
      "threadId": "thread_runtime_001",
      "docId": "tpl_report_001",
      "docType": "report",
      "question": "请继续分析这个图，找出最高峰和主要变化原因",
      "selectedObjectIds": ["chart_1"],
      "lastResolvedObjectId": "chart_1",
      "candidateSources": [
        {
          "sourceId": "ops_alarm_trend",
          "name": "区域告警趋势",
          "schema": [
            {"name": "stat_date", "type": "time"},
            {"name": "alarm_count", "type": "number"},
            {"name": "region", "type": "string"},
          ],
          "rows": [
            {"stat_date": "2026-03-01", "alarm_count": 12, "region": "华东"},
            {"stat_date": "2026-03-02", "alarm_count": 18, "region": "华东"},
            {"stat_date": "2026-03-03", "alarm_count": 9, "region": "华东"},
          ],
        }
      ],
    },
  )
  assert response.status_code == 200
  payload = response.json()
  assert payload["headline"]
  assert payload["conclusion"]
  assert payload["plan"]["analysisMode"] == "single_source"
  assert payload["execution"]["status"] == "succeeded"
  assert payload["evidence"]
  assert payload["ui"]["message"]
  assert payload["ui"]["confirmLabel"] == "保存章节草稿"
