import { useEffect, useMemo } from "react";
import type { VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import {
  describeNodeDataRequest,
  resolveNodeDataRequest,
  serializeNodeDataRequest,
} from "../utils/node-data-request";

export const useNodeDataPrefetch = (
  doc: VDoc,
  nodes: VNode[],
  engine: DataEngine,
  dataVersion: number | string,
  scopeLabel: string
): void => {
  const requests = useMemo(() => {
    const deduped = new Map<string, ReturnType<typeof resolveNodeDataRequest>>();
    nodes.forEach((node) => {
      const request = resolveNodeDataRequest(doc, node);
      if (!request) {
        return;
      }
      deduped.set(serializeNodeDataRequest(request), request);
    });
    return Array.from(deduped.values()).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [doc, nodes]);

  const requestSignature = useMemo(
    () => requests.map((request) => serializeNodeDataRequest(request)).join("|"),
    [requests]
  );

  useEffect(() => {
    if (requests.length === 0) {
      return;
    }
    let active = true;
    requests.forEach((request) => {
      const snapshot = engine.inspect(request);
      if (snapshot.status === "ready" || snapshot.status === "pending") {
        return;
      }
      void engine.execute(request).catch((error) => {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        if (message === "request debounced" || message === "request cancelled") {
          return;
        }
        console.warn(`[useNodeDataPrefetch] ${scopeLabel} ${describeNodeDataRequest(request)} 预取失败：${message}`);
      });
    });
    return () => {
      active = false;
    };
  }, [dataVersion, engine, requestSignature, scopeLabel]);
};
