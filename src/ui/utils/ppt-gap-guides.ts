import type { Command, VNode } from "../../core/doc/types";

export interface GapGuide {
  id: string;
  orientation: "h" | "v";
  x: number;
  y: number;
  length: number;
  label: string;
}

export const buildGapGuides = (
  nodes: VNode[],
  selectedIds: string[],
  commands: Command[],
  kind: "hdistribute" | "vdistribute"
): GapGuide[] => {
  const selected = nodes
    .filter((node) => selectedIds.includes(node.id) && node.layout?.mode === "absolute")
    .map((node) => ({
      id: node.id,
      x: Number(node.layout?.x ?? 0),
      y: Number(node.layout?.y ?? 0),
      w: Number(node.layout?.w ?? 0),
      h: Number(node.layout?.h ?? 0)
    }));
  if (selected.length < 3) {
    return [];
  }
  const next = selected.map((item) => ({ ...item }));
  commands.forEach((command) => {
    if (command.type !== "UpdateLayout" || !command.nodeId || !command.layout) {
      return;
    }
    const target = next.find((item) => item.id === command.nodeId);
    if (!target) {
      return;
    }
    if (command.layout.x !== undefined) {
      target.x = Number(command.layout.x);
    }
    if (command.layout.y !== undefined) {
      target.y = Number(command.layout.y);
    }
  });

  if (kind === "hdistribute") {
    const sorted = [...next].sort((a, b) => a.x - b.x);
    return sorted.slice(0, -1).map((item, idx) => {
      const nxt = sorted[idx + 1]!;
      const gap = Math.max(0, Math.round(nxt.x - (item.x + item.w)));
      return {
        id: `hgap_${item.id}_${nxt.id}`,
        orientation: "h",
        x: item.x + item.w,
        y: Math.round((item.y + item.h / 2 + (nxt.y + nxt.h / 2)) / 2),
        length: gap,
        label: `${gap}px`
      };
    });
  }

  const sorted = [...next].sort((a, b) => a.y - b.y);
  return sorted.slice(0, -1).map((item, idx) => {
    const nxt = sorted[idx + 1]!;
    const gap = Math.max(0, Math.round(nxt.y - (item.y + item.h)));
    return {
      id: `vgap_${item.id}_${nxt.id}`,
      orientation: "v",
      x: Math.round((item.x + item.w / 2 + (nxt.x + nxt.w / 2)) / 2),
      y: item.y + item.h,
      length: gap,
      label: `${gap}px`
    };
  });
};
