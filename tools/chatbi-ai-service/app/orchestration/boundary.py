from __future__ import annotations

from app.orchestration.models import UnsupportedResponse


TRADITIONAL_FLOW_TOKENS = ("发布", "导出", "调度", "定时", "邮件", "通知", "权限", "审批", "接口", "api", "sql", "数据库", "数据源", "代码", "脚本")
PPT_TOKENS = ("ppt", "幻灯", "幻灯片", "页面草稿", "汇报页")
REPORT_TOKENS = ("报告", "report", "章节草稿", "章节大纲")
DASHBOARD_TOKENS = ("dashboard", "大屏", "看板", "模块草稿", "图表模块")


def _contains_any(user_text: str, tokens: tuple[str, ...]) -> bool:
  lowered = user_text.lower()
  return any(token in user_text or token in lowered for token in tokens)


def _default_recommendations(doc_type: str) -> list[str]:
  if doc_type == "report":
    return ["生成大纲", "生成章节", "重写本章"]
  if doc_type == "ppt":
    return ["生成页纲", "补下一页", "重写当前页"]
  return ["改当前图表", "生成新图表", "调整布局"]


def _cross_doc_generation(doc_type: str, user_text: str) -> bool:
  if doc_type == "report":
    return _contains_any(user_text, PPT_TOKENS) or _contains_any(user_text, DASHBOARD_TOKENS)
  if doc_type == "ppt":
    return _contains_any(user_text, REPORT_TOKENS) or _contains_any(user_text, DASHBOARD_TOKENS)
  return _contains_any(user_text, REPORT_TOKENS) or _contains_any(user_text, PPT_TOKENS)


def guard_edit_request(doc_type: str, user_text: str) -> UnsupportedResponse | None:
  if _contains_any(user_text, TRADITIONAL_FLOW_TOKENS):
    return UnsupportedResponse(
      code="traditional_flow_only",
      message="我还在成长中，当前 AI 编排不负责发布、导出、调度或数据接口这类传统操作。",
      recommendations=_default_recommendations(doc_type),
    )
  return None


def guard_generation_request(doc_type: str, user_text: str) -> UnsupportedResponse | None:
  if _contains_any(user_text, TRADITIONAL_FLOW_TOKENS):
    return UnsupportedResponse(
      code="traditional_flow_only",
      message="我还在成长中，当前 AI 编排不负责发布、导出、调度或数据接口这类传统操作。",
      recommendations=_default_recommendations(doc_type),
    )
  if _cross_doc_generation(doc_type, user_text):
    return UnsupportedResponse(
      code="cross_doc_generation",
      message="我还在成长中，当前 AI 编排暂不支持跨文档类型整单生成，请先在当前文档类型内继续生成。",
      recommendations=_default_recommendations(doc_type),
    )
  return None
