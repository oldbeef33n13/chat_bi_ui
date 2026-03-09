import { getAtPath, joinPath } from "../doc/patch";
import { findNodeById } from "../doc/tree";
import type { Command, CommandResult, PatchOp, VDoc, VNode } from "../doc/types";
import { prefixedId } from "../utils/id";

export interface ExecutorContext {
  selectedIds: string[];
  templateResolver?: (templateId: string, target?: Command["templateTarget"]) => VNode[];
}

const clone = <T>(value: T): T => structuredClone(value);

const patchObjectFields = (
  doc: VDoc,
  basePath: string,
  updates: Record<string, unknown>
): { patches: PatchOp[]; inverse: PatchOp[] } => {
  const patches: PatchOp[] = [];
  const inverse: PatchOp[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const path = `${basePath}/${key}`;
    const prev = getAtPath(doc, path);
    if (prev === undefined) {
      patches.push({ op: "add", path, value: clone(value) });
      inverse.unshift({ op: "remove", path });
      continue;
    }
    patches.push({ op: "replace", path, value: clone(value) });
    inverse.unshift({ op: "replace", path, value: clone(prev) });
  }
  return { patches, inverse };
};

const appendChildrenInitPatch = (doc: VDoc, parentPath: string): { patches: PatchOp[]; inverse: PatchOp[] } => {
  const childrenPath = `${parentPath}/children`;
  const current = getAtPath(doc, childrenPath);
  if (current !== undefined) {
    return { patches: [], inverse: [] };
  }
  return {
    patches: [{ op: "add", path: childrenPath, value: [] }],
    inverse: [{ op: "remove", path: childrenPath }]
  };
};

const executeOne = (doc: VDoc, command: Command, ctx: ExecutorContext): CommandResult => {
  switch (command.type) {
    case "InsertNode": {
      if (!command.parentId || !command.node) {
        throw new Error("InsertNode requires parentId and node");
      }
      const parentLoc = findNodeById(doc.root, command.parentId);
      if (!parentLoc) {
        throw new Error(`parent not found: ${command.parentId}`);
      }
      const init = appendChildrenInitPatch(doc, parentLoc.path);
      const children = (getAtPath(doc, `${parentLoc.path}/children`) as VNode[] | undefined) ?? [];
      const index = command.index ?? children.length;
      const insertPath = `${parentLoc.path}/children/${Math.max(0, index)}`;
      return {
        patches: [...init.patches, { op: "add", path: insertPath, value: clone(command.node) }],
        inversePatches: [{ op: "remove", path: insertPath }, ...init.inverse],
        sideEffects: { reflow: true, rerender: true },
        summary: `insert node ${command.node.id}`
      };
    }
    case "UpdateDoc": {
      if (!command.doc) {
        throw new Error("UpdateDoc requires doc");
      }
      const patches: PatchOp[] = [];
      const inverse: PatchOp[] = [];
      for (const [key, value] of Object.entries(command.doc)) {
        const path = `/${key}`;
        const prev = getAtPath(doc, path);
        if (prev === undefined) {
          patches.push({ op: "add", path, value: clone(value) });
          inverse.unshift({ op: "remove", path });
        } else {
          patches.push({ op: "replace", path, value: clone(value) });
          inverse.unshift({ op: "replace", path, value: clone(prev) });
        }
      }
      return {
        patches,
        inversePatches: inverse,
        sideEffects: { requery: true, reflow: true, rerender: true },
        summary: "update doc"
      };
    }
    case "RemoveNode": {
      if (!command.nodeId) {
        throw new Error("RemoveNode requires nodeId");
      }
      const nodeLoc = findNodeById(doc.root, command.nodeId);
      if (!nodeLoc || !nodeLoc.parent || nodeLoc.index === undefined) {
        throw new Error(`node cannot be removed: ${command.nodeId}`);
      }
      const path = `${nodeLoc.parentPath}/children/${nodeLoc.index}`;
      return {
        patches: [{ op: "remove", path }],
        inversePatches: [{ op: "add", path, value: clone(nodeLoc.node) }],
        sideEffects: { reflow: true, rerender: true },
        summary: `remove node ${command.nodeId}`
      };
    }
    case "MoveNode": {
      if (!command.nodeId || !command.newParentId) {
        throw new Error("MoveNode requires nodeId and newParentId");
      }
      const fromLoc = findNodeById(doc.root, command.nodeId);
      const toParentLoc = findNodeById(doc.root, command.newParentId);
      if (!fromLoc || !fromLoc.parent || fromLoc.index === undefined || !toParentLoc) {
        throw new Error("MoveNode target not found");
      }
      const init = appendChildrenInitPatch(doc, toParentLoc.path);
      const targetChildren = (getAtPath(doc, `${toParentLoc.path}/children`) as VNode[] | undefined) ?? [];
      let toIndex = command.newIndex ?? targetChildren.length;
      if (fromLoc.parent.id === command.newParentId && toIndex > fromLoc.index) {
        toIndex -= 1;
      }
      const fromPath = `${fromLoc.parentPath}/children/${fromLoc.index}`;
      const toPath = `${toParentLoc.path}/children/${Math.max(0, toIndex)}`;
      return {
        patches: [...init.patches, { op: "move", from: fromPath, path: toPath }],
        inversePatches: [{ op: "move", from: toPath, path: fromPath }, ...init.inverse],
        sideEffects: { reflow: true, rerender: true },
        summary: `move node ${command.nodeId}`
      };
    }
    case "UpdateProps": {
      if (!command.nodeId || !command.props) {
        throw new Error("UpdateProps requires nodeId and props");
      }
      const nodeLoc = findNodeById(doc.root, command.nodeId);
      if (!nodeLoc) {
        throw new Error(`node not found: ${command.nodeId}`);
      }
      const basePath = `${nodeLoc.path}/props`;
      const baseExists = getAtPath(doc, basePath) !== undefined;
      const init: { patches: PatchOp[]; inverse: PatchOp[] } = baseExists
        ? { patches: [], inverse: [] }
        : { patches: [{ op: "add", path: basePath, value: {} }], inverse: [{ op: "remove", path: basePath }] };
      const fieldPatches = patchObjectFields(doc, basePath, command.props);
      return {
        patches: [...init.patches, ...fieldPatches.patches],
        inversePatches: [...fieldPatches.inverse, ...init.inverse],
        sideEffects: { requery: true, rerender: true },
        summary: `update props ${command.nodeId}`
      };
    }
    case "UpdateData": {
      if (!command.nodeId || !command.data) {
        throw new Error("UpdateData requires nodeId and data");
      }
      const nodeLoc = findNodeById(doc.root, command.nodeId);
      if (!nodeLoc) {
        throw new Error(`node not found: ${command.nodeId}`);
      }
      const basePath = `${nodeLoc.path}/data`;
      const baseExists = getAtPath(doc, basePath) !== undefined;
      const init: { patches: PatchOp[]; inverse: PatchOp[] } = baseExists
        ? { patches: [], inverse: [] }
        : { patches: [{ op: "add", path: basePath, value: {} }], inverse: [{ op: "remove", path: basePath }] };
      const fieldPatches = patchObjectFields(doc, basePath, command.data as Record<string, unknown>);
      return {
        patches: [...init.patches, ...fieldPatches.patches],
        inversePatches: [...fieldPatches.inverse, ...init.inverse],
        sideEffects: { requery: true, rerender: true },
        summary: `update data ${command.nodeId}`
      };
    }
    case "UpdateLayout": {
      if (!command.nodeId || !command.layout) {
        throw new Error("UpdateLayout requires nodeId and layout");
      }
      const nodeLoc = findNodeById(doc.root, command.nodeId);
      if (!nodeLoc) {
        throw new Error(`node not found: ${command.nodeId}`);
      }
      const basePath = `${nodeLoc.path}/layout`;
      const baseExists = getAtPath(doc, basePath) !== undefined;
      const init: { patches: PatchOp[]; inverse: PatchOp[] } = baseExists
        ? { patches: [], inverse: [] }
        : { patches: [{ op: "add", path: basePath, value: {} }], inverse: [{ op: "remove", path: basePath }] };
      const fieldPatches = patchObjectFields(doc, basePath, command.layout as Record<string, unknown>);
      return {
        patches: [...init.patches, ...fieldPatches.patches],
        inversePatches: [...fieldPatches.inverse, ...init.inverse],
        sideEffects: { reflow: true, rerender: true },
        summary: `update layout ${command.nodeId}`
      };
    }
    case "UpdateStyle": {
      if (!command.nodeId || !command.style) {
        throw new Error("UpdateStyle requires nodeId and style");
      }
      const nodeLoc = findNodeById(doc.root, command.nodeId);
      if (!nodeLoc) {
        throw new Error(`node not found: ${command.nodeId}`);
      }
      const basePath = `${nodeLoc.path}/style`;
      const baseExists = getAtPath(doc, basePath) !== undefined;
      const init: { patches: PatchOp[]; inverse: PatchOp[] } = baseExists
        ? { patches: [], inverse: [] }
        : { patches: [{ op: "add", path: basePath, value: {} }], inverse: [{ op: "remove", path: basePath }] };
      const fieldPatches = patchObjectFields(doc, basePath, command.style as Record<string, unknown>);
      return {
        patches: [...init.patches, ...fieldPatches.patches],
        inversePatches: [...fieldPatches.inverse, ...init.inverse],
        sideEffects: { rerender: true },
        summary: `update style ${command.nodeId}`
      };
    }
    case "ResetStyle": {
      if (!command.nodeId) {
        throw new Error("ResetStyle requires nodeId");
      }
      const nodeLoc = findNodeById(doc.root, command.nodeId);
      if (!nodeLoc) {
        throw new Error(`node not found: ${command.nodeId}`);
      }
      const stylePath = `${nodeLoc.path}/style`;
      const existing = getAtPath(doc, stylePath);
      const patches: PatchOp[] = [];
      const inverse: PatchOp[] = [];
      if (existing !== undefined) {
        patches.push({ op: "remove", path: stylePath });
        inverse.unshift({ op: "add", path: stylePath, value: clone(existing) });
      }
      if (command.style && Object.keys(command.style).length > 0) {
        patches.push({ op: "add", path: stylePath, value: clone(command.style) });
        inverse.unshift({ op: "remove", path: stylePath });
      }
      return {
        patches,
        inversePatches: inverse,
        sideEffects: { rerender: true },
        summary: `reset style ${command.nodeId}`
      };
    }
    case "Group": {
      const nodeIds = command.nodeIds ?? [];
      const groupId = command.groupId ?? prefixedId("group");
      const patches: PatchOp[] = [];
      const inverse: PatchOp[] = [];
      for (const nodeId of nodeIds) {
        const nodeLoc = findNodeById(doc.root, nodeId);
        if (!nodeLoc) {
          continue;
        }
        const path = `${nodeLoc.path}/layout/group`;
        const prev = getAtPath(doc, path);
        if (prev === undefined) {
          patches.push({ op: "add", path, value: groupId });
          inverse.unshift({ op: "remove", path });
        } else {
          patches.push({ op: "replace", path, value: groupId });
          inverse.unshift({ op: "replace", path, value: prev });
        }
      }
      return {
        patches,
        inversePatches: inverse,
        sideEffects: { reflow: true, rerender: true },
        summary: `group ${nodeIds.length} nodes`
      };
    }
    case "Ungroup": {
      const nodeIds = command.nodeIds ?? [];
      const patches: PatchOp[] = [];
      const inverse: PatchOp[] = [];
      for (const nodeId of nodeIds) {
        const nodeLoc = findNodeById(doc.root, nodeId);
        if (!nodeLoc) {
          continue;
        }
        const path = `${nodeLoc.path}/layout/group`;
        const prev = getAtPath(doc, path);
        if (prev === undefined) {
          continue;
        }
        patches.push({ op: "remove", path });
        inverse.unshift({ op: "add", path, value: prev });
      }
      return {
        patches,
        inversePatches: inverse,
        sideEffects: { reflow: true, rerender: true },
        summary: `ungroup ${nodeIds.length} nodes`
      };
    }
    case "ApplyTheme": {
      if (!command.themeId) {
        throw new Error("ApplyTheme requires themeId");
      }
      if (!command.scope || command.scope === "doc") {
        return {
          patches: [{ op: "replace", path: "/themeId", value: command.themeId }],
          inversePatches: [{ op: "replace", path: "/themeId", value: doc.themeId ?? "" }],
          sideEffects: { rerender: true },
          summary: `apply theme ${command.themeId}`
        };
      }
      const targetIds = command.scope === "selection" ? ctx.selectedIds : [command.scope.nodeId];
      const patches: PatchOp[] = [];
      const inverse: PatchOp[] = [];
      for (const nodeId of targetIds) {
        const loc = findNodeById(doc.root, nodeId);
        if (!loc) {
          continue;
        }
        const stylePath = `${loc.path}/style`;
        const styleValue = getAtPath(doc, stylePath);
        if (styleValue === undefined) {
          // 兜底：节点未定义 style 时先一次性创建，避免 patch 写入深层路径时报错。
          patches.push({ op: "add", path: stylePath, value: { tokenId: command.themeId } });
          inverse.unshift({ op: "remove", path: stylePath });
          continue;
        }
        if (styleValue === null || typeof styleValue !== "object" || Array.isArray(styleValue)) {
          patches.push({ op: "replace", path: stylePath, value: { tokenId: command.themeId } });
          inverse.unshift({ op: "replace", path: stylePath, value: clone(styleValue) });
          continue;
        }
        const path = `${stylePath}/tokenId`;
        const prev = getAtPath(doc, path);
        if (prev === undefined) {
          patches.push({ op: "add", path, value: command.themeId });
          inverse.unshift({ op: "remove", path });
        } else {
          patches.push({ op: "replace", path, value: command.themeId });
          inverse.unshift({ op: "replace", path, value: prev });
        }
      }
      return {
        patches,
        inversePatches: inverse,
        sideEffects: { rerender: true },
        summary: `apply theme ${command.themeId} on ${targetIds.length} nodes`
      };
    }
    case "ApplyTemplate": {
      if (!command.templateId || !command.parentId) {
        throw new Error("ApplyTemplate requires templateId and parentId");
      }
      const parent = findNodeById(doc.root, command.parentId);
      if (!parent) {
        throw new Error("ApplyTemplate parent not found");
      }
      const templateNodes = ctx.templateResolver?.(command.templateId, command.templateTarget) ?? [];
      const patches: PatchOp[] = [];
      const inverse: PatchOp[] = [];
      const init = appendChildrenInitPatch(doc, parent.path);
      patches.push(...init.patches);
      inverse.push(...init.inverse);
      const baseChildren = ((getAtPath(doc, `${parent.path}/children`) as VNode[] | undefined) ?? []).length;
      templateNodes.forEach((node, idx) => {
        const p = `${parent.path}/children/${baseChildren + idx}`;
        patches.push({ op: "add", path: p, value: clone(node) });
        inverse.unshift({ op: "remove", path: p });
      });
      return {
        patches,
        inversePatches: inverse,
        sideEffects: { reflow: true, rerender: true },
        summary: `apply template ${command.templateId}`
      };
    }
    case "Batch": {
      const items = command.commands ?? [];
      return executeCommands(doc, items, ctx);
    }
    case "Transaction": {
      if (command.commands?.length) {
        return executeCommands(doc, command.commands, ctx);
      }
      return { patches: [], inversePatches: [], summary: `tx ${command.txMode ?? "noop"}` };
    }
    default: {
      const exhaustive: never = command.type;
      throw new Error(`unsupported command: ${String(exhaustive)}`);
    }
  }
};

export const executeCommands = (doc: VDoc, commands: Command[], ctx: ExecutorContext): CommandResult => {
  let current = clone(doc);
  const patches: PatchOp[] = [];
  const inverse: PatchOp[] = [];
  const summaries: string[] = [];
  let reflow = false;
  let requery = false;
  let rerender = false;

  for (const command of commands) {
    const result = executeOne(current, command, ctx);
    if (result.patches.length === 0 && result.inversePatches.length === 0) {
      continue;
    }
    patches.push(...result.patches);
    inverse.unshift(...result.inversePatches);
    summaries.push(result.summary ?? command.type);
    if (result.sideEffects?.reflow) {
      reflow = true;
    }
    if (result.sideEffects?.requery) {
      requery = true;
    }
    if (result.sideEffects?.rerender) {
      rerender = true;
    }
    current = applyLocalPatches(current, result.patches);
  }

  return {
    patches,
    inversePatches: inverse,
    sideEffects: { reflow, requery, rerender },
    summary: summaries.join(" | ")
  };
};

const applyLocalPatches = (doc: VDoc, patches: PatchOp[]): VDoc => {
  const next = clone(doc);
  for (const patch of patches) {
    switch (patch.op) {
      case "add":
      case "replace":
        setByPath(next, patch.path, patch.value, patch.op === "add");
        break;
      case "remove":
        removeByPath(next, patch.path);
        break;
      case "move": {
        if (!patch.from) {
          throw new Error("move patch missing from");
        }
        const value = getAtPath(next, patch.from);
        removeByPath(next, patch.from);
        setByPath(next, patch.path, value, true);
        break;
      }
      default:
        break;
    }
  }
  return next;
};

const pathParts = (path: string): string[] => path.split("/").slice(1);

const setByPath = (obj: unknown, path: string, value: unknown, isAdd: boolean): void => {
  const parts = pathParts(path);
  const last = parts.pop();
  if (!last) {
    throw new Error("invalid path");
  }
  let cursor: any = obj;
  for (const part of parts) {
    const key = Array.isArray(cursor) ? Number(part) : part;
    cursor = cursor[key];
  }
  const key = Array.isArray(cursor) ? Number(last) : last;
  if (Array.isArray(cursor) && isAdd) {
    cursor.splice(key as number, 0, clone(value));
    return;
  }
  cursor[key] = clone(value);
};

const removeByPath = (obj: unknown, path: string): void => {
  const parts = pathParts(path);
  const last = parts.pop();
  if (!last) {
    throw new Error("invalid path");
  }
  let cursor: any = obj;
  for (const part of parts) {
    const key = Array.isArray(cursor) ? Number(part) : part;
    cursor = cursor[key];
  }
  const key = Array.isArray(cursor) ? Number(last) : last;
  if (Array.isArray(cursor)) {
    cursor.splice(key as number, 1);
    return;
  }
  delete cursor[key];
};

export const guessChangedNodeIds = (doc: VDoc, patches: PatchOp[]): string[] => {
  const ids = new Set<string>();
  for (const patch of patches) {
    const parts = patch.path.split("/").slice(1);
    for (let i = parts.length; i >= 2; i -= 1) {
      const partial = joinPath(...parts.slice(0, i));
      const node = getAtPath(doc, partial);
      if (node && typeof node === "object" && "id" in (node as Record<string, unknown>)) {
        ids.add(String((node as Record<string, unknown>).id));
        break;
      }
    }
  }
  return [...ids];
};
