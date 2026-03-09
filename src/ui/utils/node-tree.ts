import type { VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";

/** 根据节点 id 深度优先查找单个节点。 */
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

/** 以目标节点为锚点，向上查找指定 kind 的祖先（包含目标自身）。 */
export const findAncestorByKind = (root: VNode, targetId: string | undefined, kind: VNode["kind"]): VNode | undefined => {
  if (!targetId) {
    return undefined;
  }
  const walk = (node: VNode, stack: VNode[]): VNode | undefined => {
    if (node.id === targetId) {
      if (node.kind === kind) {
        return node;
      }
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.kind === kind) {
          return stack[i];
        }
      }
      return undefined;
    }
    for (const child of node.children ?? []) {
      const found = walk(child, [...stack, node]);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return walk(root, []);
};

/** 祖先查找的 id 版封装，便于滚动定位和比较。 */
export const resolveAncestorIdByKind = (root: VNode, targetId: string | undefined, kind: VNode["kind"]): string | undefined =>
  findAncestorByKind(root, targetId, kind)?.id;

/**
 * 复制节点树并重写所有 id。
 * 说明：复制 slide/section 等容器时必须重写子节点 id，避免编辑器出现重复 key/选择冲突。
 */
export const cloneNodeWithNewIds = (node: VNode): VNode => {
  const copied = structuredClone(node);
  const walk = (current: VNode): VNode => {
    const kindPrefix = current.kind === "slide" ? "slide" : current.kind === "section" ? "section" : current.kind;
    const next: VNode = { ...current, id: prefixedId(kindPrefix) };
    if (current.children?.length) {
      next.children = current.children.map((child) => walk(child));
    }
    return next;
  };
  return walk(copied);
};
