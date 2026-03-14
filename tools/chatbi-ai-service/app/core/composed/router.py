from __future__ import annotations

import re
from typing import Any


INTENT_SCENE_MAP = {
  "ask_data": "data_guide",
  "ask_chart": "chart_ask",
  "ask_doc_summary": "story_summary",
  "ask_edit": "command_plan",
  "ask_generate": "command_plan",
  "ask_analysis": "analysis_planner",
}

REGION_WORDS = ("华东", "华南", "华北", "华中", "西南", "西北", "东北")
PRONOUN_TOKENS = ("这个", "这张", "这个图", "那天", "它", "这章", "这一章", "当前")
CHINESE_DIGITS = {
  "一": 1,
  "二": 2,
  "三": 3,
  "四": 4,
  "五": 5,
  "六": 6,
  "七": 7,
  "八": 8,
  "九": 9,
}


def route_request(payload: dict[str, Any]) -> dict[str, Any]:
  thread = payload.get("thread") or {}
  object_registry = payload.get("objectRegistry") or {}
  user_text = str(payload.get("userText") or "").strip()
  intent = infer_intent(user_text)
  resolved = resolve_objects(thread=thread, object_registry=object_registry, user_text=user_text, intent=intent)
  scene = None if resolved["needsClarification"] else INTENT_SCENE_MAP[intent]
  return {
    "intent": intent,
    "scene": scene,
    "resolvedObjects": resolved["objects"],
    "resolvedObjectIds": [item["objectId"] for item in resolved["objects"]],
    "needsClarification": resolved["needsClarification"],
    "clarificationQuestion": resolved.get("clarificationQuestion"),
    "workingContext": {
      "docId": thread.get("docId"),
      "docType": thread.get("docType"),
      "selectedObjectIds": thread.get("selectedObjectIds") or [],
      "lastResolvedObjectId": resolved["objects"][0]["objectId"] if resolved["objects"] else thread.get("lastResolvedObjectId"),
    },
  }


def infer_intent(user_text: str) -> str:
  text = user_text.lower()
  if any(token in user_text for token in ("改成", "改为", "换成", "替换", "调整", "删除", "新增", "重排", "优化布局")):
    return "ask_edit"
  if any(token in user_text for token in ("总结", "摘要", "结论", "管理层", "汇报话术")):
    return "ask_doc_summary"
  if any(token in user_text for token in ("生成", "创建", "做一个", "补一页", "补一章")):
    return "ask_generate"
  if any(token in user_text for token in ("字段", "参数", "接口", "数据源", "样例数据")):
    return "ask_data"
  if any(token in user_text for token in ("为什么", "原因", "分析", "波动", "关系", "异常", "关联")):
    return "ask_analysis"
  if any(token in user_text for token in ("图", "图表", "最高点", "最低点", "趋势")):
    return "ask_chart"
  if "summary" in text:
    return "ask_doc_summary"
  return "ask_chart"


def resolve_objects(*, thread: dict[str, Any], object_registry: dict[str, Any], user_text: str, intent: str) -> dict[str, Any]:
  objects = list(object_registry.get("objects") or [])
  by_id = {item.get("objectId"): item for item in objects if item.get("objectId")}

  selected = [by_id[item] for item in (thread.get("selectedObjectIds") or []) if item in by_id]
  if selected:
    return {"objects": [_to_resolved(item, confidence=0.98) for item in selected], "needsClarification": False}

  chapter_object = _resolve_from_section_phrase(user_text, objects)
  if chapter_object is not None:
    return {"objects": [_to_resolved(chapter_object, confidence=0.94)], "needsClarification": False}

  if any(token in user_text for token in PRONOUN_TOKENS):
    last_resolved_id = thread.get("lastResolvedObjectId")
    if last_resolved_id and last_resolved_id in by_id:
      return {"objects": [_to_resolved(by_id[last_resolved_id], confidence=0.9)], "needsClarification": False}

  matches = _keyword_match_objects(user_text, objects)
  if len(matches) == 1:
    return {"objects": [_to_resolved(matches[0], confidence=0.86)], "needsClarification": False}
  if len(matches) > 1:
    return {
      "objects": [],
      "needsClarification": True,
      "clarificationQuestion": _build_clarification_question(matches),
    }

  if intent in {"ask_edit", "ask_doc_summary"} and thread.get("activeSectionId"):
    fallback_section = by_id.get(thread["activeSectionId"])
    if fallback_section:
      return {"objects": [_to_resolved(fallback_section, confidence=0.72)], "needsClarification": False}

  return {"objects": [], "needsClarification": False}


def _resolve_from_section_phrase(user_text: str, objects: list[dict[str, Any]]) -> dict[str, Any] | None:
  chapter_number = _extract_chapter_number(user_text)
  if chapter_number is None:
    return None
  expected_id = f"section_{chapter_number}"
  for item in objects:
    if item.get("objectId") == expected_id or item.get("kind") == "section" and item.get("sectionId") == expected_id:
      return item
  return None


def _extract_chapter_number(text: str) -> int | None:
  match = re.search(r"第(\d+)章", text)
  if match:
    return int(match.group(1))
  match = re.search(r"第([一二三四五六七八九])章", text)
  if match:
    return CHINESE_DIGITS.get(match.group(1))
  return None


def _keyword_match_objects(user_text: str, objects: list[dict[str, Any]]) -> list[dict[str, Any]]:
  scores: list[tuple[int, dict[str, Any]]] = []
  for item in objects:
    score = 0
    title = str(item.get("title") or "")
    display_text = str(item.get("displayText") or "")
    keywords = [str(value) for value in item.get("fieldKeywords") or []]
    for token in [title, display_text, *keywords]:
      if token and token in user_text:
        score += 2 if token == title else 1
    if item.get("kind") == "chart" and any(token in user_text for token in ("图", "图表")):
      score += 1
    if score > 0:
      scores.append((score, item))
  if not scores:
    return []
  best_score = max(score for score, _ in scores)
  return [item for score, item in scores if score == best_score]


def _build_clarification_question(matches: list[dict[str, Any]]) -> str:
  titles = [str(item.get("title") or item.get("objectId") or "").strip() for item in matches[:2]]
  titles = [item for item in titles if item]
  if len(titles) >= 2:
    return f"你说的是“{titles[0]}”还是“{titles[1]}”？"
  return "你想问的是哪一个对象？"


def _to_resolved(item: dict[str, Any], *, confidence: float) -> dict[str, Any]:
  return {
    "objectId": item.get("objectId"),
    "kind": item.get("kind"),
    "confidence": round(confidence, 2),
  }


def extract_region(text: str, template_variables: dict[str, Any] | None = None) -> str | None:
  for region in REGION_WORDS:
    if region in text:
      return region
  if template_variables:
    region = template_variables.get("region")
    if isinstance(region, str) and region.strip():
      return region.strip()
  return None
