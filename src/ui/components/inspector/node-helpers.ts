import type { ChartSpec, VDoc, VNode } from "../../../core/doc/types";
import { prefixedId } from "../../../core/utils/id";
import { applyComputedFields, applyFilters } from "../../../runtime/data/transforms";

export const findNodeById = (root: VNode, nodeId: string): VNode | undefined => {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
};

export const getPreviewRows = (doc: VDoc, node: VNode, spec: ChartSpec): Array<Record<string, unknown>> => {
  const sourceId = node.data?.sourceId;
  const source = doc.dataSources?.find((item) => item.id === sourceId);
  if (!source || source.type !== "static" || !Array.isArray(source.staticData)) {
    return [];
  }
  const baseRows = source.staticData.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  const withComputed = applyComputedFields(baseRows, spec);
  return applyFilters(withComputed, doc.filters ?? [], node);
};

export const findParentAndIndex = (root: VNode, targetId: string): { parent: VNode; index: number } | undefined => {
  const children = root.children ?? [];
  const index = children.findIndex((item) => item.id === targetId);
  if (index >= 0) {
    return { parent: root, index };
  }
  for (const child of children) {
    const nested = findParentAndIndex(child, targetId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
};

export const findAncestorKind = (root: VNode, targetId: string, kind: string): VNode | undefined => {
  const dfs = (node: VNode, stack: VNode[]): VNode | undefined => {
    if (node.id === targetId) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.kind === kind) {
          return stack[i];
        }
      }
      return node.kind === kind ? node : undefined;
    }
    for (const child of node.children ?? []) {
      const found = dfs(child, [...stack, node]);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return dfs(root, []);
};

export const insertSummaryNode = (
  doc: VDoc,
  chartNode: VNode,
  summary: string,
  execute: (command: { type: "InsertNode"; parentId: string; index?: number; node: VNode }, summary: string) => boolean
): boolean => {
  if (doc.docType === "dashboard") {
    const root = doc.root;
    const maxGy = Math.max(
      0,
      ...(root.children ?? []).map((item) => Number(item.layout?.mode === "grid" ? (item.layout.gy ?? 0) + (item.layout.gh ?? 4) : 0))
    );
    return execute(
      {
        type: "InsertNode",
        parentId: root.id,
        node: {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "grid", gx: 0, gy: maxGy, gw: 12, gh: 2 },
          props: { text: summary, format: "plain" }
        }
      },
      "insert dashboard summary"
    );
  }

  if (doc.docType === "report") {
    const parentInfo = findParentAndIndex(doc.root, chartNode.id);
    if (!parentInfo) {
      return false;
    }
    return execute(
      {
        type: "InsertNode",
        parentId: parentInfo.parent.id,
        index: parentInfo.index + 1,
        node: {
          id: prefixedId("text"),
          kind: "text",
          props: { text: summary, format: "plain" }
        }
      },
      "insert report summary"
    );
  }

  if (doc.docType === "ppt") {
    const slide = findAncestorKind(doc.root, chartNode.id, "slide");
    if (!slide) {
      return false;
    }
    const x = Number(chartNode.layout?.x ?? 40);
    const y = Number(chartNode.layout?.y ?? 90);
    const w = Math.max(220, Number(chartNode.layout?.w ?? 430));
    const h = Math.max(90, Math.round(Number(chartNode.layout?.h ?? 200) * 0.35));
    return execute(
      {
        type: "InsertNode",
        parentId: slide.id,
        node: {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "absolute", x, y: y + Math.round(Number(chartNode.layout?.h ?? 220)) + 10, w, h, z: 2 },
          props: { text: summary, format: "plain" },
          style: { bg: "#f8fbff", pad: 10, borderW: 1, borderC: "#dbeafe", radius: 8 }
        }
      },
      "insert slide summary"
    );
  }

  return false;
};
