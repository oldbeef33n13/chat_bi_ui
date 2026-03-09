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

export type AlignFailReason = "need_two" | "need_three_for_distribute" | "mixed_scope" | "no_change";

export interface AlignCommandResult {
  commands: Command[];
  reason?: AlignFailReason;
}

export type ContainerAlignFailReason = "need_one" | "mixed_scope" | "no_change";

export interface ContainerAlignCommandResult {
  commands: Command[];
  reason?: ContainerAlignFailReason;
}

interface AbsNode {
  node: VNode;
  parent: VNode;
  parentId: string;
  mode: "absolute" | "grid";
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 生成对齐/分布命令：仅对同父级、同布局模式（absolute/grid）节点生效。
 * 返回命令数组，便于统一进入 command pipeline（可撤销/审计）。
 */
export const buildAlignCommandResult = (root: VNode, selectedIds: string[], kind: AlignKind): AlignCommandResult => {
  const { eligible, scoped } = resolveAlignSelectionDetailed(root, selectedIds);
  if (eligible.length < 2) {
    return { commands: [], reason: "need_two" };
  }
  if (scoped.length < 2) {
    return { commands: [], reason: "mixed_scope" };
  }
  if ((kind === "hdistribute" || kind === "vdistribute") && scoped.length < 3) {
    return { commands: [], reason: "need_three_for_distribute" };
  }

  const nodes = scoped;

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
      if (node.mode === "absolute") {
        layout.x = Math.round(update.x);
      } else {
        layout.gx = Math.max(0, Math.round(update.x));
      }
    }
    if (update.y !== undefined && Math.abs(update.y - node.y) > 0.001) {
      if (node.mode === "absolute") {
        layout.y = Math.round(update.y);
      } else {
        layout.gy = Math.max(0, Math.round(update.y));
      }
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
  if (commands.length === 0) {
    return { commands: [], reason: "no_change" };
  }
  return { commands };
};

/**
 * 兼容旧调用方：仅返回命令数组。
 * 新代码建议使用 buildAlignCommandResult 获取失败原因。
 */
export const buildAlignCommands = (root: VNode, selectedIds: string[], kind: AlignKind): Command[] =>
  buildAlignCommandResult(root, selectedIds, kind).commands;

/**
 * 对齐到容器边界（贴左/贴右/贴顶/贴底/容器居中）：
 * - 允许单元素；
 * - 多元素时要求同父级、同布局模式；
 * - 分布动作不属于容器对齐语义，直接返回 no_change。
 */
export const buildAlignToContainerCommandResult = (
  root: VNode,
  selectedIds: string[],
  kind: AlignKind
): ContainerAlignCommandResult => {
  if (kind === "hdistribute" || kind === "vdistribute") {
    return { commands: [], reason: "no_change" };
  }
  const { eligible, scoped } = resolveAlignSelectionDetailed(root, selectedIds);
  if (eligible.length < 1) {
    return { commands: [], reason: "need_one" };
  }
  if (scoped.length !== eligible.length) {
    return { commands: [], reason: "mixed_scope" };
  }
  if (scoped.length < 1) {
    return { commands: [], reason: "need_one" };
  }

  const mode = scoped[0]!.mode;
  const parent = scoped[0]!.parent;
  const bounds = resolveContainerBounds(parent, mode, scoped);
  const updates = new Map<string, { x?: number; y?: number }>();

  scoped.forEach((item) => {
    if (kind === "left") {
      updates.set(item.node.id, { x: 0 });
      return;
    }
    if (kind === "hcenter") {
      updates.set(item.node.id, { x: (bounds.width - item.w) / 2 });
      return;
    }
    if (kind === "right") {
      updates.set(item.node.id, { x: bounds.width - item.w });
      return;
    }
    if (kind === "top") {
      updates.set(item.node.id, { y: 0 });
      return;
    }
    if (kind === "vcenter") {
      updates.set(item.node.id, { y: (bounds.height - item.h) / 2 });
      return;
    }
    if (kind === "bottom") {
      updates.set(item.node.id, { y: bounds.height - item.h });
    }
  });

  const commands = toLayoutUpdateCommands(scoped, updates);
  if (commands.length === 0) {
    return { commands: [], reason: "no_change" };
  }
  return { commands };
};

/** 解析选中节点，筛出同父级、同布局模式且可编辑的节点（absolute/grid）。 */
const resolveAlignSelectionDetailed = (
  root: VNode,
  selectedIds: string[]
): { eligible: AbsNode[]; scoped: AbsNode[] } => {
  const located = selectedIds.map((id) => locateWithParent(root, id)).filter((item): item is { node: VNode; parent: VNode } => !!item);
  const eligible = located
    .filter((item) => !item.node.layout?.lock)
    .filter((item) => item.node.layout?.mode === "absolute" || item.node.layout?.mode === "grid")
    .map((item) => {
      const mode: "absolute" | "grid" = item.node.layout?.mode === "grid" ? "grid" : "absolute";
      return {
        node: item.node,
        parent: item.parent,
        parentId: item.parent.id,
        mode,
        x: mode === "grid" ? Number(item.node.layout?.gx ?? 0) : Number(item.node.layout?.x ?? 0),
        y: mode === "grid" ? Number(item.node.layout?.gy ?? 0) : Number(item.node.layout?.y ?? 0),
        w: mode === "grid" ? Number(item.node.layout?.gw ?? 1) : Number(item.node.layout?.w ?? 100),
        h: mode === "grid" ? Number(item.node.layout?.gh ?? 1) : Number(item.node.layout?.h ?? 60)
      };
    });
  if (eligible.length < 1) {
    return { eligible, scoped: [] };
  }
  const anchor = eligible[0]!;
  const scoped = eligible.filter((item) => item.parentId === anchor.parentId && item.mode === anchor.mode);
  return { eligible, scoped };
};

const resolveContainerBounds = (
  parent: VNode,
  mode: "absolute" | "grid",
  scoped: AbsNode[]
): { width: number; height: number } => {
  const siblingMetrics = collectSiblingMetrics(parent, mode, scoped);
  if (mode === "absolute") {
    const width = resolvePositive(parent.layout?.w, siblingMetrics.maxRight);
    const height = resolvePositive(parent.layout?.h, siblingMetrics.maxBottom);
    return { width, height };
  }
  const gridCols = resolvePositive((parent.props as Record<string, unknown> | undefined)?.gridCols, siblingMetrics.maxRight);
  const gridRows = resolvePositive((parent.props as Record<string, unknown> | undefined)?.gridRows, siblingMetrics.maxBottom);
  return { width: gridCols, height: gridRows };
};

const collectSiblingMetrics = (parent: VNode, mode: "absolute" | "grid", scoped: AbsNode[]): { maxRight: number; maxBottom: number } => {
  const siblings = parent.children ?? [];
  let maxRight = 0;
  let maxBottom = 0;
  siblings.forEach((item) => {
    if (item.layout?.lock) {
      return;
    }
    if (mode === "absolute" && item.layout?.mode === "absolute") {
      const x = Number(item.layout.x ?? 0);
      const y = Number(item.layout.y ?? 0);
      const w = Number(item.layout.w ?? 100);
      const h = Number(item.layout.h ?? 60);
      maxRight = Math.max(maxRight, x + w);
      maxBottom = Math.max(maxBottom, y + h);
      return;
    }
    if (mode === "grid" && item.layout?.mode === "grid") {
      const gx = Number(item.layout.gx ?? 0);
      const gy = Number(item.layout.gy ?? 0);
      const gw = Number(item.layout.gw ?? 1);
      const gh = Number(item.layout.gh ?? 1);
      maxRight = Math.max(maxRight, gx + gw);
      maxBottom = Math.max(maxBottom, gy + gh);
    }
  });
  if (maxRight <= 0 || maxBottom <= 0) {
    maxRight = Math.max(maxRight, ...scoped.map((item) => item.x + item.w));
    maxBottom = Math.max(maxBottom, ...scoped.map((item) => item.y + item.h));
  }
  return {
    maxRight: Math.max(1, maxRight),
    maxBottom: Math.max(1, maxBottom)
  };
};

const resolvePositive = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) {
    return num;
  }
  const fb = Number(fallback);
  if (Number.isFinite(fb) && fb > 0) {
    return fb;
  }
  return 1;
};

const toLayoutUpdateCommands = (nodes: AbsNode[], updates: Map<string, { x?: number; y?: number }>): Command[] => {
  const commands: Command[] = [];
  for (const node of nodes) {
    const update = updates.get(node.node.id);
    if (!update) {
      continue;
    }
    const layout: Record<string, unknown> = {};
    if (update.x !== undefined && Math.abs(update.x - node.x) > 0.001) {
      if (node.mode === "absolute") {
        layout.x = Math.round(update.x);
      } else {
        layout.gx = Math.max(0, Math.round(update.x));
      }
    }
    if (update.y !== undefined && Math.abs(update.y - node.y) > 0.001) {
      if (node.mode === "absolute") {
        layout.y = Math.round(update.y);
      } else {
        layout.gy = Math.max(0, Math.round(update.y));
      }
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
