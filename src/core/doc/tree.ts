import type { VNode } from "./types";

export interface NodeLocated {
  node: VNode;
  path: string;
  parent?: VNode;
  parentPath?: string;
  index?: number;
}

export const cloneNode = <T extends VNode>(node: T): T => structuredClone(node);

export const walkNodes = (root: VNode, visitor: (node: VNode, path: string, parent?: VNode, index?: number) => void): void => {
  const dfs = (node: VNode, path: string, parent?: VNode, index?: number): void => {
    visitor(node, path, parent, index);
    node.children?.forEach((child, childIndex) => dfs(child, `${path}/children/${childIndex}`, node, childIndex));
  };
  dfs(root, "/root");
};

export const findNodeById = (root: VNode, nodeId: string): NodeLocated | undefined => {
  let located: NodeLocated | undefined;
  walkNodes(root, (node, path, parent, index) => {
    if (!located && node.id === nodeId) {
      located = {
        node,
        path,
        parent,
        parentPath: parent ? path.slice(0, path.lastIndexOf("/children/")) : undefined,
        index
      };
    }
  });
  return located;
};

export const listNodes = (root: VNode): VNode[] => {
  const nodes: VNode[] = [];
  walkNodes(root, (node) => nodes.push(node));
  return nodes;
};

export const nodeTitle = (node: VNode): string => {
  const base = node.name || (typeof node.props === "object" && node.props && "title" in node.props ? String(node.props.title) : "");
  return base || `${node.kind} (${node.id})`;
};

export const ensureChildren = (node: VNode): VNode[] => {
  if (!node.children) {
    node.children = [];
  }
  return node.children;
};
