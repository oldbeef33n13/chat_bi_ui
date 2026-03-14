import type { PatchOp, VDoc } from "./types";

const decodeSegment = (seg: string): string => seg.replace(/~1/g, "/").replace(/~0/g, "~");
const encodeSegment = (seg: string): string => seg.replace(/~/g, "~0").replace(/\//g, "~1");

export const joinPath = (...segments: Array<string | number>): string =>
  `/${segments.map((seg) => encodeSegment(String(seg))).join("/")}`;

const pathToSegments = (path: string): string[] => {
  if (!path || path === "/") {
    return [];
  }
  return path
    .split("/")
    .slice(1)
    .map(decodeSegment);
};

const getRef = (obj: unknown, path: string): { parent: unknown; key?: string | number } => {
  const segs = pathToSegments(path);
  if (segs.length === 0) {
    return { parent: { root: obj }, key: "root" };
  }
  let cursor: any = obj;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const seg = segs[i]!;
    cursor = Array.isArray(cursor) ? cursor[Number(seg)] : cursor?.[seg];
  }
  const keyRaw = segs[segs.length - 1]!;
  const key = Array.isArray(cursor) ? Number(keyRaw) : keyRaw;
  return { parent: cursor, key };
};

export const getAtPath = (obj: unknown, path: string): unknown => {
  const segs = pathToSegments(path);
  let cursor: any = obj;
  for (const seg of segs) {
    cursor = Array.isArray(cursor) ? cursor[Number(seg)] : cursor?.[seg];
  }
  return cursor;
};

const cloneContainer = (value: unknown): any => {
  if (Array.isArray(value)) {
    return value.slice();
  }
  return { ...(value as Record<string, unknown> | undefined) };
};

const toContainerKey = (container: unknown, raw: string): string | number => {
  if (Array.isArray(container)) {
    return raw === "-" ? container.length : Number(raw);
  }
  return raw;
};

const updateAtPathImmutable = (
  obj: unknown,
  segs: string[],
  updater: (container: unknown, key: string | number) => unknown
): unknown => {
  if (segs.length === 0) {
    const wrapped = updater({ root: obj }, "root") as { root: unknown };
    return wrapped.root;
  }
  if (segs.length === 1) {
    return updater(obj, toContainerKey(obj, segs[0]!));
  }
  const head = segs[0]!;
  const key = toContainerKey(obj, head);
  const currentChild = Array.isArray(obj) ? obj[key as number] : (obj as Record<string, unknown> | undefined)?.[key as string];
  const nextChild = updateAtPathImmutable(currentChild, segs.slice(1), updater);
  if (nextChild === currentChild) {
    return obj;
  }
  const next = cloneContainer(obj);
  next[key] = nextChild;
  return next;
};

const addAtPathImmutable = (obj: unknown, path: string, value: unknown, cloneValue = true): unknown => {
  const segs = pathToSegments(path);
  const nextValue = cloneValue ? structuredClone(value) : value;
  return updateAtPathImmutable(obj, segs, (container, key) => {
    if (Array.isArray(container)) {
      const next = container.slice();
      next.splice(key as number, 0, nextValue);
      return next;
    }
    return {
      ...((container as Record<string, unknown> | undefined) ?? {}),
      [key]: nextValue,
    };
  });
};

const replaceAtPathImmutable = (obj: unknown, path: string, value: unknown): unknown => {
  const segs = pathToSegments(path);
  const nextValue = structuredClone(value);
  return updateAtPathImmutable(obj, segs, (container, key) => {
    if (Array.isArray(container)) {
      const next = container.slice();
      next[key as number] = nextValue;
      return next;
    }
    return {
      ...((container as Record<string, unknown> | undefined) ?? {}),
      [key]: nextValue,
    };
  });
};

const removeAtPathImmutable = (obj: unknown, path: string): unknown => {
  const segs = pathToSegments(path);
  return updateAtPathImmutable(obj, segs, (container, key) => {
    if (Array.isArray(container)) {
      const next = container.slice();
      next.splice(key as number, 1);
      return next;
    }
    const next = { ...((container as Record<string, unknown> | undefined) ?? {}) };
    delete next[key as keyof typeof next];
    return next;
  });
};

const addAtPath = (obj: unknown, path: string, value: unknown): void => {
  const { parent, key } = getRef(obj, path);
  if (key === undefined) {
    throw new Error(`invalid add path: ${path}`);
  }
  if (Array.isArray(parent)) {
    parent.splice(key as number, 0, value);
    return;
  }
  (parent as any)[key] = value;
};

const replaceAtPath = (obj: unknown, path: string, value: unknown): void => {
  const { parent, key } = getRef(obj, path);
  if (key === undefined) {
    throw new Error(`invalid replace path: ${path}`);
  }
  (parent as any)[key] = value;
};

const removeAtPath = (obj: unknown, path: string): unknown => {
  const { parent, key } = getRef(obj, path);
  if (key === undefined) {
    throw new Error(`invalid remove path: ${path}`);
  }
  if (Array.isArray(parent)) {
    const [removed] = parent.splice(key as number, 1);
    return removed;
  }
  const removed = (parent as any)[key];
  delete (parent as any)[key];
  return removed;
};

export const applyPatchInPlace = (doc: VDoc, patch: PatchOp): void => {
  switch (patch.op) {
    case "add":
      addAtPath(doc, patch.path, structuredClone(patch.value));
      return;
    case "replace":
      replaceAtPath(doc, patch.path, structuredClone(patch.value));
      return;
    case "remove":
      removeAtPath(doc, patch.path);
      return;
    case "move": {
      if (!patch.from) {
        throw new Error("move patch missing from");
      }
      const value = removeAtPath(doc, patch.from);
      addAtPath(doc, patch.path, value);
      return;
    }
    default: {
      const exhaustive: never = patch.op;
      throw new Error(`unsupported patch op: ${String(exhaustive)}`);
    }
  }
};

export const applyPatches = (doc: VDoc, patches: PatchOp[]): VDoc => {
  let next: VDoc = doc;
  for (const patch of patches) {
    switch (patch.op) {
      case "add":
        next = addAtPathImmutable(next, patch.path, patch.value) as VDoc;
        break;
      case "replace":
        next = replaceAtPathImmutable(next, patch.path, patch.value) as VDoc;
        break;
      case "remove":
        next = removeAtPathImmutable(next, patch.path) as VDoc;
        break;
      case "move": {
        if (!patch.from) {
          throw new Error("move patch missing from");
        }
        const movedValue = getAtPath(next, patch.from);
        const withoutMovedValue = removeAtPathImmutable(next, patch.from);
        next = addAtPathImmutable(withoutMovedValue, patch.path, movedValue, false) as VDoc;
        break;
      }
      default: {
        const exhaustive: never = patch.op;
        throw new Error(`unsupported patch op: ${String(exhaustive)}`);
      }
    }
  }
  return next;
};

export const invertPatch = (doc: VDoc, patch: PatchOp): PatchOp => {
  switch (patch.op) {
    case "add":
      return { op: "remove", path: patch.path };
    case "remove":
      return { op: "add", path: patch.path, value: getAtPath(doc, patch.path) };
    case "replace":
      return { op: "replace", path: patch.path, value: getAtPath(doc, patch.path) };
    case "move":
      if (!patch.from) {
        throw new Error("move patch missing from");
      }
      return { op: "move", path: patch.from, from: patch.path };
    default: {
      const exhaustive: never = patch.op;
      throw new Error(`unsupported patch op: ${String(exhaustive)}`);
    }
  }
};

export const invertPatches = (doc: VDoc, patches: PatchOp[]): PatchOp[] => {
  const inverses: PatchOp[] = [];
  const scratch = structuredClone(doc);
  for (const patch of patches) {
    const inv = invertPatch(scratch, patch);
    inverses.unshift(inv);
    applyPatchInPlace(scratch, patch);
  }
  return inverses;
};
