import type { Command, VNode } from "../../core/doc/types";

export type AlignKind =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom"
  | "hdistribute"
  | "vdistribute";

interface AbsNode {
  node: VNode;
  parentId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 生成对齐/分布命令：仅对同父级 absolute 节点生效。
 * 返回命令数组，便于统一进入 command pipeline（可撤销/审计）。
 */
export const buildAlignCommands = (root: VNode, selectedIds: string[], kind: AlignKind): Command[] => {
  const nodes = resolveAbsoluteSelection(root, selectedIds);
  if (nodes.length < 2) {
    return [];
  }
  if ((kind === "hdistribute" || kind === "vdistribute") && nodes.length < 3) {
    return [];
  }

  const updates = new Map<string, { x?: number; y?: number }>();
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxRight = Math.max(...nodes.map((node) => node.x + node.w));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxBottom = Math.max(...nodes.map((node) => node.y + node.h));
  const centerX = (minX + maxRight) / 2;
  const centerY = (minY + maxBottom) / 2;

  if (kind === "left") {
    nodes.forEach((node) => updates.set(node.node.id, { x: minX }));
  }
  if (kind === "hcenter") {
    nodes.forEach((node) => updates.set(node.node.id, { x: centerX - node.w / 2 }));
  }
  if (kind === "right") {
    nodes.forEach((node) => updates.set(node.node.id, { x: maxRight - node.w }));
  }
  if (kind === "top") {
    nodes.forEach((node) => updates.set(node.node.id, { y: minY }));
  }
  if (kind === "vcenter") {
    nodes.forEach((node) => updates.set(node.node.id, { y: centerY - node.h / 2 }));
  }
  if (kind === "bottom") {
    nodes.forEach((node) => updates.set(node.node.id, { y: maxBottom - node.h }));
  }
  if (kind === "hdistribute") {
    // 水平等距：固定首尾范围，按总宽度反推 gap。
    const sorted = [...nodes].sort((a, b) => a.x - b.x);
    const totalWidth = sorted.reduce((sum, node) => sum + node.w, 0);
    const gap = (maxRight - minX - totalWidth) / (sorted.length - 1);
    let cursor = minX;
    sorted.forEach((node) => {
      updates.set(node.node.id, { x: cursor });
      cursor += node.w + gap;
    });
  }
  if (kind === "vdistribute") {
    // 垂直等距：固定首尾范围，按总高度反推 gap。
    const sorted = [...nodes].sort((a, b) => a.y - b.y);
    const totalHeight = sorted.reduce((sum, node) => sum + node.h, 0);
    const gap = (maxBottom - minY - totalHeight) / (sorted.length - 1);
    let cursor = minY;
    sorted.forEach((node) => {
      updates.set(node.node.id, { y: cursor });
      cursor += node.h + gap;
    });
  }

  const commands: Command[] = [];
  for (const node of nodes) {
    const update = updates.get(node.node.id);
    if (!update) {
      continue;
    }
    const layout: Record<string, unknown> = {};
    if (update.x !== undefined && Math.abs(update.x - node.x) > 0.001) {
      layout.x = Math.round(update.x);
    }
    if (update.y !== undefined && Math.abs(update.y - node.y) > 0.001) {
      layout.y = Math.round(update.y);
    }
    if (Object.keys(layout).length === 0) {
      continue;
    }
    commands.push({
      type: "UpdateLayout",
      nodeId: node.node.id,
      layout
    });
  }
  return commands;
};

/** 解析选中节点，筛出同父级且可编辑的 absolute 节点。 */
const resolveAbsoluteSelection = (root: VNode, selectedIds: string[]): AbsNode[] => {
  const located = selectedIds.map((id) => locateWithParent(root, id)).filter((item): item is { node: VNode; parent: VNode } => !!item);
  const absolute = located
    .filter((item) => !item.node.layout?.lock)
    .filter((item) => item.node.layout?.mode === "absolute")
    .map((item) => ({
      node: item.node,
      parentId: item.parent.id,
      x: Number(item.node.layout?.x ?? 0),
      y: Number(item.node.layout?.y ?? 0),
      w: Number(item.node.layout?.w ?? 100),
      h: Number(item.node.layout?.h ?? 60)
    }));
  if (absolute.length < 2) {
    return [];
  }
  const parentId = absolute[0]!.parentId;
  return absolute.filter((item) => item.parentId === parentId);
};

/** 在节点树中查找目标节点及其父节点。 */
const locateWithParent = (root: VNode, nodeId: string, parent?: VNode): { node: VNode; parent: VNode } | undefined => {
  if (root.id === nodeId && parent) {
    return { node: root, parent };
  }
  for (const child of root.children ?? []) {
    const found = locateWithParent(child, nodeId, root);
    if (found) {
      return found;
    }
  }
  return undefined;
};
