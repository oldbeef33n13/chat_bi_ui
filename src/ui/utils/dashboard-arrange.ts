import type { Command, VNode } from "../../core/doc/types";
import {
  normalizeGrid,
  resolveGridConflict,
  type GridNodeState,
  type GridRect
} from "./dashboard-grid";
import {
  resolveDashboardNodeRect,
  resolveGridRectFromCanvasRect,
  type DashboardSurfaceMetrics
} from "./dashboard-surface";

const toGridNodes = (root: VNode): GridNodeState[] =>
  (root.children ?? [])
    .filter((node) => (node.layout?.mode ?? "grid") === "grid")
    .map((node) => ({
      id: node.id,
      lock: Boolean(node.layout?.lock),
      layout: normalizeGrid(
        {
          mode: "grid",
          gx: Number(node.layout?.gx ?? 0),
          gy: Number(node.layout?.gy ?? 0),
          gw: Number(node.layout?.gw ?? 4),
          gh: Number(node.layout?.gh ?? 4)
        },
        Math.max(1, Number((root.props as Record<string, unknown> | undefined)?.gridCols ?? 12))
      )
    }));

export const recommendDashboardCardLayout = (root: VNode, size: { gw: number; gh: number }, gridCols: number): GridRect => {
  const occupied = toGridNodes(root).map((item) => item.layout);
  const gw = Math.max(2, Math.min(gridCols, Math.round(size.gw)));
  const gh = Math.max(2, Math.round(size.gh));
  for (let gy = 0; gy < 240; gy += 1) {
    for (let gx = 0; gx <= gridCols - gw; gx += 1) {
      const candidate: GridRect = { mode: "grid", gx, gy, gw, gh };
      const overlap = occupied.some((layout) => {
        return candidate.gx < layout.gx + layout.gw && candidate.gx + candidate.gw > layout.gx && candidate.gy < layout.gy + layout.gh && candidate.gy + candidate.gh > layout.gy;
      });
      if (!overlap) {
        return candidate;
      }
    }
  }
  return { mode: "grid", gx: 0, gy: occupied.length * gh, gw, gh };
};

const applyGridCommands = (nodes: GridNodeState[], commands: Command[], cols: number): GridNodeState[] => {
  const map = new Map(nodes.map((item) => [item.id, { ...item, layout: { ...item.layout } }]));
  commands.forEach((command) => {
    if (command.type !== "UpdateLayout" || !command.nodeId || command.layout?.mode !== "grid") {
      return;
    }
    const current = map.get(command.nodeId);
    if (!current) {
      return;
    }
    map.set(command.nodeId, {
      ...current,
      layout: normalizeGrid(command.layout as GridRect, cols)
    });
  });
  return [...map.values()];
};

const sameGrid = (a: GridRect, b: GridRect): boolean => a.gx === b.gx && a.gy === b.gy && a.gw === b.gw && a.gh === b.gh;

const findNearestCardSlot = (occupied: GridNodeState[], preferred: GridRect, cols: number): GridRect => {
  const normalized = normalizeGrid(preferred, cols);
  for (let dy = 0; dy < 240; dy += 1) {
    const gy = normalized.gy + dy;
    for (let dx = 0; dx < cols; dx += 1) {
      const gx = Math.max(0, Math.min(cols - normalized.gw, normalized.gx + dx));
      const candidate = normalizeGrid({ ...normalized, gx, gy }, cols);
      const overlap = occupied.some((item) => {
        const layout = item.layout;
        return candidate.gx < layout.gx + layout.gw && candidate.gx + candidate.gw > layout.gx && candidate.gy < layout.gy + layout.gh && candidate.gy + candidate.gh > layout.gy;
      });
      if (!overlap) {
        return candidate;
      }
    }
  }
  return normalized;
};

export const recommendDashboardCardLayoutAtPoint = (
  root: VNode,
  metrics: DashboardSurfaceMetrics,
  point: { x: number; y: number },
  size: { gw: number; gh: number }
): GridRect => {
  const seedLayout: GridRect = normalizeGrid(
    {
      mode: "grid",
      gx: 0,
      gy: 0,
      gw: size.gw,
      gh: size.gh
    },
    metrics.gridCols
  );
  const templateRect = resolveDashboardNodeRect(
    {
      id: "__dashboard_insert_template__",
      kind: "container",
      layout: seedLayout
    },
    metrics
  );
  const preferredRect = {
    left: point.x - templateRect.width / 2,
    top: point.y - templateRect.height / 2,
    width: templateRect.width,
    height: templateRect.height
  };
  const preferredGrid = normalizeGrid(
    {
      ...resolveGridRectFromCanvasRect(preferredRect, metrics),
      gw: seedLayout.gw,
      gh: seedLayout.gh
    },
    metrics.gridCols
  );
  return findNearestCardSlot(toGridNodes(root), preferredGrid, metrics.gridCols);
};

export const buildDashboardApplyCardSpanCommands = (
  root: VNode,
  nodeId: string,
  nextWidth: number,
  gridCols: number
): Command[] => {
  const node = (root.children ?? []).find((item) => item.id === nodeId);
  if (!node || (node.layout?.mode ?? "grid") !== "grid" || node.layout?.lock) {
    return [];
  }
  const prev = normalizeGrid(
    {
      mode: "grid",
      gx: Number(node.layout?.gx ?? 0),
      gy: Number(node.layout?.gy ?? 0),
      gw: Number(node.layout?.gw ?? 4),
      gh: Number(node.layout?.gh ?? 4)
    },
    gridCols
  );
  const next = normalizeGrid(
    {
      ...prev,
      gw: Math.max(2, Math.min(gridCols, nextWidth)),
      gx: Math.min(prev.gx, Math.max(0, gridCols - Math.max(2, Math.min(gridCols, nextWidth))))
    },
    gridCols
  );
  if (sameGrid(prev, next)) {
    return [];
  }
  return resolveGridConflict(toGridNodes(root), node.id, next, prev, gridCols, "resize").commands;
};

export const buildDashboardMoveCardRowCommands = (
  root: VNode,
  nodeId: string,
  deltaRows: number,
  gridCols: number
): Command[] => {
  const node = (root.children ?? []).find((item) => item.id === nodeId);
  if (!node || (node.layout?.mode ?? "grid") !== "grid" || node.layout?.lock) {
    return [];
  }
  const prev = normalizeGrid(
    {
      mode: "grid",
      gx: Number(node.layout?.gx ?? 0),
      gy: Number(node.layout?.gy ?? 0),
      gw: Number(node.layout?.gw ?? 4),
      gh: Number(node.layout?.gh ?? 4)
    },
    gridCols
  );
  const next = normalizeGrid(
    {
      ...prev,
      gy: Math.max(0, prev.gy + deltaRows)
    },
    gridCols
  );
  if (sameGrid(prev, next)) {
    return [];
  }
  return resolveGridConflict(toGridNodes(root), node.id, next, prev, gridCols, "move").commands;
};

export const buildDashboardAutoTidyCommands = (root: VNode, nodeIds: string[], gridCols: number): Command[] => {
  const targetIds = [...new Set(nodeIds)];
  const sortedTargets = (root.children ?? [])
    .filter((node) => targetIds.includes(node.id) && (node.layout?.mode ?? "grid") === "grid" && !node.layout?.lock)
    .sort((a, b) => {
      const aGy = Number(a.layout?.gy ?? 0);
      const bGy = Number(b.layout?.gy ?? 0);
      if (aGy !== bGy) {
        return aGy - bGy;
      }
      return Number(a.layout?.gx ?? 0) - Number(b.layout?.gx ?? 0);
    });
  if (sortedTargets.length < 2) {
    return [];
  }

  let current = toGridNodes(root);
  let cursorX = 0;
  let cursorY = Math.min(...sortedTargets.map((node) => Number(node.layout?.gy ?? 0)));
  let rowBottom = cursorY;
  sortedTargets.forEach((node) => {
    const prev = normalizeGrid(
      {
        mode: "grid",
        gx: Number(node.layout?.gx ?? 0),
        gy: Number(node.layout?.gy ?? 0),
        gw: Number(node.layout?.gw ?? 4),
        gh: Number(node.layout?.gh ?? 4)
      },
      gridCols
    );
    if (cursorX > 0 && cursorX + prev.gw > gridCols) {
      cursorX = 0;
      cursorY = rowBottom;
    }
    const target = normalizeGrid(
      {
        ...prev,
        gx: cursorX,
        gy: cursorY
      },
      gridCols
    );
    rowBottom = Math.max(rowBottom, target.gy + target.gh);
    cursorX = target.gx + target.gw;
    const result = resolveGridConflict(current, node.id, target, prev, gridCols, "move");
    current = applyGridCommands(current, result.commands, gridCols);
  });

  const before = new Map(toGridNodes(root).map((item) => [item.id, item.layout]));
  return current
    .filter((item) => {
      const prev = before.get(item.id);
      return prev && !sameGrid(prev, item.layout);
    })
    .map((item) => ({
      type: "UpdateLayout" as const,
      nodeId: item.id,
      layout: item.layout
    }));
};

export const buildDashboardConvertToFloatingCommands = (
  root: VNode,
  nodeIds: string[],
  metrics: DashboardSurfaceMetrics
): Command[] =>
  (root.children ?? [])
    .filter((node) => nodeIds.includes(node.id) && (node.layout?.mode ?? "grid") === "grid" && !node.layout?.lock)
    .map((node, index) => {
      const rect = resolveDashboardNodeRect(node, metrics);
      return {
        type: "UpdateLayout" as const,
        nodeId: node.id,
        layout: {
          mode: "absolute" as const,
          x: rect.left,
          y: rect.top,
          w: rect.width,
          h: rect.height,
          z: index + 1
        }
      };
    });

export const buildDashboardConvertToCardCommands = (
  root: VNode,
  nodeIds: string[],
  metrics: DashboardSurfaceMetrics
): Command[] => {
  const selected = (root.children ?? []).filter(
    (node) => nodeIds.includes(node.id) && node.layout?.mode === "absolute" && !node.layout?.lock
  );
  if (selected.length === 0) {
    return [];
  }
  const commands: Command[] = [];
  const occupied = toGridNodes(root);
  selected.forEach((node) => {
    const rect = resolveDashboardNodeRect(node, metrics);
    const preferred = resolveGridRectFromCanvasRect(rect, metrics);
    const target = findNearestCardSlot(occupied, preferred, metrics.gridCols);
    commands.push({
      type: "UpdateLayout",
      nodeId: node.id,
      layout: target
    });
    occupied.push({
      id: node.id,
      lock: false,
      layout: target
    });
  });
  return commands;
};
