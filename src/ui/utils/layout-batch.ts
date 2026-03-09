import type { Command, VLayout, VNode } from "../../core/doc/types";

export type LayoutBatchAction = "equalWidth" | "equalHeight" | "hdistribute" | "vdistribute";

interface LayoutBatchTarget {
  node: VNode;
  parentId: string;
  mode: "absolute" | "grid";
  x: number;
  y: number;
  w: number;
  h: number;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
}

export interface LayoutBatchResult {
  commands: Command[];
  reason?: string;
}

export interface LayoutBatchPlan {
  targetIds: string[];
  autoExpanded: boolean;
  reason?: string;
}

/**
 * 基于当前选区生成批量布局命令（等宽/等高/分布）。
 * 约束：
 * - 仅处理同父级、同布局模式（absolute 或 grid）的节点；
 * - 忽略 lock=true 的节点；
 * - 分布动作至少需要 3 个节点。
 */
export const buildLayoutBatchCommands = (
  root: VNode,
  selectedIds: string[],
  action: LayoutBatchAction,
  primaryId?: string
): LayoutBatchResult => {
  const targets = resolveLayoutTargets(root, selectedIds);
  if (targets.length < 2) {
    return { commands: [], reason: "至少选择 2 个可编辑元素" };
  }
  if ((action === "hdistribute" || action === "vdistribute") && targets.length < 3) {
    return { commands: [], reason: "分布操作至少选择 3 个元素" };
  }

  const parentId = targets[0]!.parentId;
  if (targets.some((item) => item.parentId !== parentId)) {
    return { commands: [], reason: "仅支持同一容器内元素批量操作" };
  }

  const mode = targets[0]!.mode;
  if (targets.some((item) => item.mode !== mode)) {
    return { commands: [], reason: "请选择相同布局模式的元素" };
  }

  const reference = targets.find((item) => item.node.id === primaryId) ?? targets[0]!;
  const updates = new Map<string, Partial<VLayout>>();

  if (action === "equalWidth") {
    const expected = mode === "absolute" ? reference.w : reference.gw;
    targets.forEach((item) => {
      if (mode === "absolute") {
        if (Math.abs(item.w - expected) < 0.001) {
          return;
        }
        updates.set(item.node.id, { w: Math.max(12, Math.round(expected)) });
        return;
      }
      if (item.gw === expected) {
        return;
      }
      updates.set(item.node.id, { gw: Math.max(1, Math.round(expected)) });
    });
  }

  if (action === "equalHeight") {
    const expected = mode === "absolute" ? reference.h : reference.gh;
    targets.forEach((item) => {
      if (mode === "absolute") {
        if (Math.abs(item.h - expected) < 0.001) {
          return;
        }
        updates.set(item.node.id, { h: Math.max(12, Math.round(expected)) });
        return;
      }
      if (item.gh === expected) {
        return;
      }
      updates.set(item.node.id, { gh: Math.max(1, Math.round(expected)) });
    });
  }

  if (action === "hdistribute") {
    if (mode === "absolute") {
      const sorted = [...targets].sort((a, b) => a.x - b.x);
      const minX = sorted[0]!.x;
      const maxRight = Math.max(...sorted.map((item) => item.x + item.w));
      const totalWidth = sorted.reduce((sum, item) => sum + item.w, 0);
      const gap = Math.max(0, (maxRight - minX - totalWidth) / (sorted.length - 1));
      let cursor = minX;
      sorted.forEach((item) => {
        if (Math.abs(item.x - cursor) > 0.001) {
          updates.set(item.node.id, { x: Math.round(cursor) });
        }
        cursor += item.w + gap;
      });
    } else {
      const sorted = [...targets].sort((a, b) => a.gx - b.gx);
      const minX = sorted[0]!.gx;
      const maxRight = Math.max(...sorted.map((item) => item.gx + item.gw));
      const totalWidth = sorted.reduce((sum, item) => sum + item.gw, 0);
      const gap = Math.max(0, (maxRight - minX - totalWidth) / (sorted.length - 1));
      let cursor = minX;
      sorted.forEach((item) => {
        const gx = Math.max(0, Math.round(cursor));
        if (item.gx !== gx) {
          updates.set(item.node.id, { gx });
        }
        cursor += item.gw + gap;
      });
    }
  }

  if (action === "vdistribute") {
    if (mode === "absolute") {
      const sorted = [...targets].sort((a, b) => a.y - b.y);
      const minY = sorted[0]!.y;
      const maxBottom = Math.max(...sorted.map((item) => item.y + item.h));
      const totalHeight = sorted.reduce((sum, item) => sum + item.h, 0);
      const gap = Math.max(0, (maxBottom - minY - totalHeight) / (sorted.length - 1));
      let cursor = minY;
      sorted.forEach((item) => {
        if (Math.abs(item.y - cursor) > 0.001) {
          updates.set(item.node.id, { y: Math.round(cursor) });
        }
        cursor += item.h + gap;
      });
    } else {
      const sorted = [...targets].sort((a, b) => a.gy - b.gy);
      const minY = sorted[0]!.gy;
      const maxBottom = Math.max(...sorted.map((item) => item.gy + item.gh));
      const totalHeight = sorted.reduce((sum, item) => sum + item.gh, 0);
      const gap = Math.max(0, (maxBottom - minY - totalHeight) / (sorted.length - 1));
      let cursor = minY;
      sorted.forEach((item) => {
        const gy = Math.max(0, Math.round(cursor));
        if (item.gy !== gy) {
          updates.set(item.node.id, { gy });
        }
        cursor += item.gh + gap;
      });
    }
  }

  const commands: Command[] = [];
  updates.forEach((layout, nodeId) => {
    commands.push({
      type: "UpdateLayout",
      nodeId,
      layout
    });
  });

  if (commands.length === 0) {
    return { commands: [], reason: "所选元素无需调整" };
  }
  return { commands };
};

/**
 * 规划批量布局目标：
 * - 优先使用当前选区；
 * - 若选区不足以执行动作，自动扩展到“同父容器 + 同布局模式 + 未锁定”的兄弟元素；
 * - 返回是否发生自动扩展，用于 UI 提示“本次自动扩大了作用范围”。
 */
export const planLayoutBatchTargets = (
  root: VNode,
  anchorNodeId: string,
  selectedIds: string[],
  action: LayoutBatchAction
): LayoutBatchPlan => {
  const normalizedIds = [...new Set(selectedIds.filter(Boolean))];
  const initialIds = normalizedIds.includes(anchorNodeId) ? normalizedIds : [anchorNodeId, ...normalizedIds];
  const minCount = action === "hdistribute" || action === "vdistribute" ? 3 : 2;
  const initialTargets = resolveLayoutTargets(root, initialIds);
  if (isBatchReady(initialTargets, minCount)) {
    return {
      targetIds: initialTargets.map((item) => item.node.id),
      autoExpanded: false
    };
  }

  const anchor = locateWithParent(root, anchorNodeId);
  const anchorMode = anchor?.node.layout?.mode;
  if (!anchor || (anchorMode !== "absolute" && anchorMode !== "grid")) {
    return {
      targetIds: initialTargets.map((item) => item.node.id),
      autoExpanded: false,
      reason: minCount === 3 ? "分布操作至少需要 3 个同容器元素" : "至少需要 2 个同容器元素"
    };
  }

  const siblingIds = (anchor.parent.children ?? [])
    .filter((item) => item.layout?.mode === anchorMode)
    .filter((item) => !item.layout?.lock)
    .map((item) => item.id);
  const siblingTargets = resolveLayoutTargets(root, siblingIds);

  if (!isBatchReady(siblingTargets, minCount)) {
    return {
      targetIds: siblingTargets.map((item) => item.node.id),
      autoExpanded: false,
      reason: minCount === 3 ? "分布操作至少需要 3 个同容器元素" : "至少需要 2 个同容器元素"
    };
  }

  const initialKey = new Set(initialTargets.map((item) => item.node.id));
  const siblingKey = siblingTargets.map((item) => item.node.id);
  const autoExpanded = siblingKey.length !== initialKey.size || siblingKey.some((id) => !initialKey.has(id));
  return {
    targetIds: siblingKey,
    autoExpanded
  };
};

const resolveLayoutTargets = (root: VNode, selectedIds: string[]): LayoutBatchTarget[] =>
  selectedIds
    .map((id) => locateWithParent(root, id))
    .filter((item): item is { node: VNode; parent: VNode } => !!item)
    .filter((item) => !item.node.layout?.lock)
    .filter((item): item is { node: VNode & { layout: VLayout }; parent: VNode } => item.node.layout?.mode === "absolute" || item.node.layout?.mode === "grid")
    .map((item) => ({
      node: item.node,
      parentId: item.parent.id,
      mode: item.node.layout.mode === "absolute" ? "absolute" : "grid",
      x: Number(item.node.layout.x ?? 0),
      y: Number(item.node.layout.y ?? 0),
      w: Number(item.node.layout.w ?? 100),
      h: Number(item.node.layout.h ?? 60),
      gx: Number(item.node.layout.gx ?? 0),
      gy: Number(item.node.layout.gy ?? 0),
      gw: Number(item.node.layout.gw ?? 1),
      gh: Number(item.node.layout.gh ?? 1)
    }));

const isBatchReady = (targets: LayoutBatchTarget[], minCount: number): boolean => {
  if (targets.length < minCount) {
    return false;
  }
  const first = targets[0];
  if (!first) {
    return false;
  }
  return targets.every((item) => item.parentId === first.parentId && item.mode === first.mode);
};

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
