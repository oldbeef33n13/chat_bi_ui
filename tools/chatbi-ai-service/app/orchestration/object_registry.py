from __future__ import annotations

from typing import Any

from app.orchestration.models import ObjectRegistry, ObjectRegistryObject


class ObjectRegistryBuilder:
  def build(self, snapshot_dsl: dict[str, Any]) -> ObjectRegistry:
    doc_id = str(snapshot_dsl.get("docId") or "")
    doc_type = str(snapshot_dsl.get("docType") or "dashboard")
    root = snapshot_dsl.get("root")
    if not isinstance(root, dict):
      raise ValueError("snapshotDsl.root must be an object")

    title = self._resolve_title(root) or str(snapshot_dsl.get("title") or doc_id or doc_type)
    objects = [
      ObjectRegistryObject(
        objectId=doc_id or str(root.get("id") or "doc"),
        kind="doc",
        title=title,
        displayText=f"{doc_type} {title}",
      )
    ]
    self._walk_node(root, objects, current_section_id=None, current_slide_id=None, ancestors=[title])
    return ObjectRegistry(docId=doc_id, docType=doc_type, objects=objects)

  def _walk_node(
    self,
    node: dict[str, Any],
    objects: list[ObjectRegistryObject],
    *,
    current_section_id: str | None,
    current_slide_id: str | None,
    ancestors: list[str],
  ) -> None:
    node_id = str(node.get("id") or "")
    kind = str(node.get("kind") or "node")
    title = self._resolve_title(node) or node_id or kind
    next_section_id = node_id if kind == "section" else current_section_id
    next_slide_id = node_id if kind == "slide" else current_slide_id

    if node_id and kind not in {"report", "dashboard", "ppt", "deck", "root"}:
      field_keywords = self._resolve_field_keywords(node, title)
      source_refs = self._resolve_source_refs(node)
      display_text = " ".join(part for part in [*ancestors[-2:], title, kind] if part).strip()
      objects.append(
        ObjectRegistryObject(
          objectId=node_id,
          kind=kind,
          title=title,
          sectionId=next_section_id,
          slideId=next_slide_id,
          chartType=self._resolve_chart_type(node),
          fieldKeywords=field_keywords,
          sourceRefs=source_refs,
          displayText=display_text,
        )
      )

    next_ancestors = [*ancestors, title]
    for child in node.get("children") or []:
      if isinstance(child, dict):
        self._walk_node(
          child,
          objects,
          current_section_id=next_section_id,
          current_slide_id=next_slide_id,
          ancestors=next_ancestors,
        )

  def _resolve_title(self, node: dict[str, Any]) -> str:
    props = node.get("props") if isinstance(node.get("props"), dict) else {}
    if isinstance(props, dict):
      for key in ("title", "reportTitle", "dashTitle", "headerText", "sectionTitle", "titleText"):
        value = props.get(key)
        if isinstance(value, str) and value.strip():
          return value.strip()
      if node.get("kind") == "text":
        value = props.get("text")
        if isinstance(value, str) and value.strip():
          return value.strip().replace("\n", " ")[:40]
    name = node.get("name")
    if isinstance(name, str) and name.strip():
      return name.strip()
    return ""

  def _resolve_chart_type(self, node: dict[str, Any]) -> str | None:
    props = node.get("props")
    if isinstance(props, dict):
      chart_type = props.get("chartType")
      if isinstance(chart_type, str) and chart_type.strip():
        return chart_type.strip()
    return None

  def _resolve_field_keywords(self, node: dict[str, Any], title: str) -> list[str]:
    keywords: list[str] = []
    if title:
      keywords.append(title)
    props = node.get("props")
    if isinstance(props, dict):
      bindings = props.get("bindings")
      if isinstance(bindings, list):
        for binding in bindings:
          if isinstance(binding, dict):
            field = binding.get("field")
            if isinstance(field, str) and field.strip():
              keywords.append(field.strip())
    return list(dict.fromkeys(keyword for keyword in keywords if keyword))

  def _resolve_source_refs(self, node: dict[str, Any]) -> list[str]:
    data = node.get("data")
    refs: list[str] = []
    if isinstance(data, dict):
      for key in ("sourceId", "queryId", "endpointId"):
        value = data.get(key)
        if isinstance(value, str) and value.strip():
          refs.append(value.strip())
    return list(dict.fromkeys(refs))
