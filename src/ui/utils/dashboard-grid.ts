import type { Command } from "../../core/doc/types";

/** Dashboard 网格布局矩形。 */
export interface GridRect {
  mode: "grid";
  gx: number;
  gy: number;
  gw: number;
  gh: number;
}

export interface GridNodeState {
  id: string;
  lock: boolean;
  layout: GridRect;
}

export interface GridResolveResult {
  commands: Command[];
  strategy: "swap" | "push" | "single";
}

export interface GridGroupMoveResult extends GridResolveResult {
  deltaGx: number;
  deltaGy: number;
  movedIds: string[];
}

/** 约束网格参数到合法区间，避免越界与异常尺寸。 */
export const normalizeGrid = (rect: GridRect, cols: number): GridRect => {
  const gw = Math.max(2, Math.min(cols, Math.round(rect.gw)));
  const gh = Math.max(2, Math.round(rect.gh));
  const gx = Math.max(0, Math.min(cols - gw, Math.round(rect.gx)));
  const gy = Math.max(0, Math.round(rect.gy));
  return { mode: "grid", gx, gy, gw, gh };
};

export const isGridOverlap = (a: GridRect, b: GridRect): boolean =>
  a.gx < b.gx + b.gw && a.gx + a.gw > b.gx && a.gy < b.gy + b.gh && a.gy + a.gh > b.gy;

/** 判定 candidate 是否可放置（忽略指定节点）。 */
const canPlaceGridRect = (candidate: GridRect, occupied: GridNodeState[], ignoreIds: Set<string>): boolean =>
  !occupied.some((item) => !ignoreIds.has(item.id) && isGridOverlap(candidate, item.layout));

/** 从首选位置出发，搜索最近可用网格位。 */
const findFreeGridRect = (
  source: GridRect,
  occupied: GridNodeState[],
  cols: number,
  preferredX: number,
  preferredY: number,
  ignoreIds: Set<string>
): GridRect => {
  // 优先在 preferredX 附近寻找可用位；找不到再向下扩展行。
  const boundedX = Math.max(0, Math.min(cols - source.gw, preferredX));
  for (let dy = 0; dy < 260; dy += 1) {
    const gy = Math.max(0, preferredY + dy);
    const xCandidates = [...Array(Math.max(1, cols - source.gw + 1)).keys()].sort((a, b) => Math.abs(a - boundedX) - Math.abs(b - boundedX));
    for (const gx of xCandidates) {
      const candidate: GridRect = { ...source, gx, gy };
      if (canPlaceGridRect(candidate, occupied, ignoreIds)) {
        return candidate;
      }
    }
  }
  return { ...source, gx: 0, gy: preferredY + 260 };
};

export const resolveGridConflict = (
  nodes: GridNodeState[],
  movedId: string,
  nextLayout: GridRect,
  prevLayout: GridRect,
  cols: number,
  op: "move" | "resize"
): GridResolveResult => {
  /**
   * 冲突解法优先级：
   * 1) single：无冲突直接更新；
   * 2) swap：移动且仅一个冲突时尝试换位；
   * 3) push：广度方式把冲突块向后挤压。
   */
  const normalizedNext = normalizeGrid(nextLayout, cols);
  const map = new Map<string, GridNodeState>(nodes.map((node) => [node.id, { ...node, layout: normalizeGrid(node.layout, cols) }]));
  const moved = map.get(movedId);
  if (!moved) {
    return { commands: [], strategy: "single" };
  }
  map.set(movedId, { ...moved, layout: normalizedNext });
  const all = (): GridNodeState[] => [...map.values()];
  const overlaps = all().filter((item) => item.id !== movedId && isGridOverlap(normalizedNext, item.layout));

  if (overlaps.length === 0) {
    const single: Command[] = [];
    if (!isSameGridRect(moved.layout, normalizedNext)) {
      single.push({ type: "UpdateLayout", nodeId: movedId, layout: normalizedNext });
    }
    return { commands: single, strategy: "single" };
  }

  if (op === "move" && overlaps.length === 1) {
    const target = overlaps[0]!;
    const safeSwapRect = normalizeGrid({ ...target.layout, gx: prevLayout.gx, gy: prevLayout.gy }, cols);
    const ignoreForSwap = new Set<string>([movedId, target.id]);
    const canSwap = !target.lock && canPlaceGridRect(safeSwapRect, all(), ignoreForSwap) && !isGridOverlap(safeSwapRect, normalizedNext);
    if (canSwap) {
      map.set(target.id, { ...target, layout: safeSwapRect });
      const commands = collectGridCommands(nodes, all());
      return { commands, strategy: "swap" };
    }
  }

  const queue: string[] = [movedId];
  let loops = 0;
  while (queue.length > 0 && loops < 500) {
    loops += 1;
    const currentId = queue.shift()!;
    const current = map.get(currentId);
    if (!current) {
      continue;
    }
    const currentOverlaps = all().filter((item) => item.id !== currentId && isGridOverlap(current.layout, item.layout));
    if (currentOverlaps.length === 0) {
      continue;
    }

    let movedCurrent = false;
    for (const collision of currentOverlaps) {
      if (collision.lock) {
        const relocated = findFreeGridRect(
          current.layout,
          all(),
          cols,
          current.layout.gx,
          current.layout.gy + 1,
          new Set<string>([currentId])
        );
        if (!isSameGridRect(current.layout, relocated)) {
          map.set(currentId, { ...current, layout: relocated });
          queue.push(currentId);
          movedCurrent = true;
        }
        break;
      }

      const collisionNext = findFreeGridRect(
        collision.layout,
        all(),
        cols,
        collision.layout.gx,
        Math.max(collision.layout.gy, current.layout.gy + current.layout.gh),
        new Set<string>([collision.id])
      );
      if (!isSameGridRect(collision.layout, collisionNext)) {
        map.set(collision.id, { ...collision, layout: collisionNext });
        queue.push(collision.id);
      }
    }
    if (movedCurrent) {
      continue;
    }
  }

  const commands = collectGridCommands(nodes, all());
  return { commands, strategy: "push" };
};

const collectGridCommands = (before: GridNodeState[], after: GridNodeState[]): Command[] => {
  const prevMap = new Map(before.map((item) => [item.id, item.layout]));
  return after
    .filter((item) => {
      const prev = prevMap.get(item.id);
      return !!prev && !isSameGridRect(prev, item.layout);
    })
    .map((item) => ({
      type: "UpdateLayout" as const,
      nodeId: item.id,
      layout: item.layout
    }));
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

export const resolveGridGroupMove = (
  nodes: GridNodeState[],
  movedIds: string[],
  delta: { gx: number; gy: number },
  cols: number
): GridGroupMoveResult => {
  const originalMap = new Map(nodes.map((item) => [item.id, { ...item, layout: normalizeGrid(item.layout, cols) }]));
  const orderedMovable = movedIds
    .map((id) => originalMap.get(id))
    .filter((item): item is GridNodeState => Boolean(item && !item.lock));
  if (orderedMovable.length === 0) {
    return { commands: [], strategy: "single", deltaGx: 0, deltaGy: 0, movedIds: [] };
  }

  const minDx = Math.max(...orderedMovable.map((item) => -item.layout.gx));
  const maxDx = Math.min(...orderedMovable.map((item) => cols - item.layout.gw - item.layout.gx));
  const deltaGx = Math.max(minDx, Math.min(maxDx, Math.round(delta.gx)));
  const minDy = Math.max(...orderedMovable.map((item) => -item.layout.gy));
  const deltaGy = Math.max(minDy, Math.round(delta.gy));

  let strategy: GridResolveResult["strategy"] = "single";
  let currentNodes = nodes.map((item) => ({ ...item, layout: normalizeGrid(item.layout, cols) }));

  orderedMovable.forEach((item) => {
    const current = currentNodes.find((candidate) => candidate.id === item.id);
    if (!current) {
      return;
    }
    const nextLayout: GridRect = normalizeGrid(
      {
        mode: "grid",
        gx: item.layout.gx + deltaGx,
        gy: item.layout.gy + deltaGy,
        gw: item.layout.gw,
        gh: item.layout.gh
      },
      cols
    );
    const result = resolveGridConflict(currentNodes, item.id, nextLayout, current.layout, cols, "move");
    if (result.strategy === "push" || (strategy === "single" && result.strategy === "swap")) {
      strategy = result.strategy;
    }
    currentNodes = applyGridCommands(currentNodes, result.commands, cols);
  });

  return {
    commands: collectGridCommands(nodes, currentNodes),
    strategy,
    deltaGx,
    deltaGy,
    movedIds: orderedMovable.map((item) => item.id)
  };
};

/** 网格矩形完全相等判定。 */
const isSameGridRect = (a: GridRect, b: GridRect): boolean =>
  a.gx === b.gx && a.gy === b.gy && a.gw === b.gw && a.gh === b.gh;
