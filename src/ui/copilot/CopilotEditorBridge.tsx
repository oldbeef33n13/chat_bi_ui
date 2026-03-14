import { useEffect } from "react";
import type { VNode } from "../../core/doc/types";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { findAncestorByKind, findNodeById } from "../utils/node-tree";
import { useCopilot } from "./copilot-context";

const readNodeLabel = (node?: VNode): string | undefined => {
  if (!node) {
    return undefined;
  }
  const props = (node.props ?? {}) as Record<string, unknown>;
  const candidates = [
    props.title,
    props.titleText,
    props.reportTitle,
    props.text,
    props.headerText,
    node.name,
    node.id
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim().replace(/\s+/g, " ").slice(0, 48);
    }
  }
  return node.id;
};

export function CopilotEditorBridge(): null {
  const { updateLiveScene } = useCopilot();
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);

  useEffect(() => {
    if (!doc) {
      updateLiveScene(null);
      return;
    }
    const primary = selection.primaryId ? findNodeById(doc.root, selection.primaryId) : undefined;
    const section = findAncestorByKind(doc.root, selection.primaryId, "section");
    const slide = findAncestorByKind(doc.root, selection.primaryId, "slide");
    updateLiveScene({
      objectId: primary?.id,
      objectKind: primary?.kind,
      objectLabel: readNodeLabel(primary),
      sectionLabel: readNodeLabel(section),
      slideLabel: readNodeLabel(slide),
      selectionCount: selection.selectedIds.length
    });
  }, [doc, selection, updateLiveScene]);

  useEffect(() => () => updateLiveScene(null), [updateLiveScene]);

  return null;
}
