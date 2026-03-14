import type { VDoc, VNode } from "../../core/doc/types";
import type { QueryRequest } from "../../runtime/data/data-engine";
import { resolveDataEndpointParams } from "./data-endpoint-binding";

export type NodeDataDocContext = Pick<VDoc, "dataSources" | "queries" | "filters" | "templateVariables">;

export const isNodeDataFetchEligible = (node: VNode): boolean => node.kind === "chart" || node.kind === "table";

export const collectFetchEligibleNodes = (nodes: VNode[] = []): VNode[] => {
  const collected: VNode[] = [];
  const walk = (node: VNode): void => {
    if (isNodeDataFetchEligible(node)) {
      collected.push(node);
    }
    node.children?.forEach(walk);
  };
  nodes.forEach(walk);
  return collected;
};

export const resolveNodeDataRequest = (doc: NodeDataDocContext, node: VNode): QueryRequest | null => {
  if (!isNodeDataFetchEligible(node)) {
    return null;
  }
  const endpointId = node.data?.endpointId;
  const fallbackSourceId = doc.dataSources?.[0]?.id;
  const sourceId = node.data?.sourceId ?? fallbackSourceId;
  const fallbackQueryId = sourceId ? doc.queries?.find((item) => item.sourceId === sourceId)?.queryId : undefined;
  const queryId = node.data?.queryId ?? fallbackQueryId;
  const params = endpointId ? resolveDataEndpointParams(doc, node) : node.data?.params;
  if (endpointId) {
    return {
      endpointId,
      params: params as Record<string, unknown> | undefined,
    };
  }
  if (!sourceId) {
    return null;
  }
  return {
    sourceId,
    queryId,
    params: params as Record<string, unknown> | undefined,
  };
};

export const serializeNodeDataRequest = (request: QueryRequest): string =>
  JSON.stringify({
    endpointId: request.endpointId ?? null,
    sourceId: request.sourceId ?? null,
    queryId: request.queryId ?? null,
    params: request.params ?? {},
  });

export const describeNodeDataRequest = (request: QueryRequest): string =>
  request.endpointId
    ? `endpoint=${request.endpointId}`
    : `source=${request.sourceId ?? "na"} query=${request.queryId ?? "na"}`;
