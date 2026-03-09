import type { Command, VLayout, VNode } from "../../core/doc/types";
import { findNodeById } from "../../core/doc/tree";
import { cloneNodeWithNewIds } from "./node-tree";

export interface DuplicateNodesPlan {
  commands: Command[];
  clonedNodes: VNode[];
  primaryNodeId?: string;
}

export const buildDuplicateNodesPlan = (
  root: VNode,
  parentId: string,
  nodeIds: string[],
  mutateLayout?: (layout: Partial<VLayout>, sourceNode: VNode, clonedNode: VNode, index: number) => Partial<VLayout>
): DuplicateNodesPlan | null => {
  const parentLoc = findNodeById(root, parentId);
  if (!parentLoc) {
    return null;
  }
  const children = parentLoc.node.children ?? [];
  const selected = children
    .map((child, index) => ({ child, index }))
    .filter((entry) => nodeIds.includes(entry.child.id));
  if (selected.length === 0) {
    return null;
  }

  const insertIndex = Math.max(...selected.map((entry) => entry.index)) + 1;
  const clonedNodes = selected.map((entry, index) => {
    const cloned = cloneNodeWithNewIds(entry.child);
    const nextLayout = mutateLayout?.({ ...(cloned.layout ?? {}) }, entry.child, cloned, index);
    if (nextLayout) {
      const baseLayout = cloned.layout ?? entry.child.layout;
      if (!baseLayout) {
        return cloned;
      }
      cloned.layout = {
        ...baseLayout,
        ...nextLayout
      };
    }
    return cloned;
  });

  return {
    commands: clonedNodes.map((node, index) => ({
      type: "InsertNode",
      parentId,
      index: insertIndex + index,
      node
    })),
    clonedNodes,
    primaryNodeId: clonedNodes[clonedNodes.length - 1]?.id
  };
};
