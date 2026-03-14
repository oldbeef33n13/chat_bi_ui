import { useEffect, useMemo, useState } from "react";
import type { ChartSpec, VNode } from "../../core/doc/types";
import { DataEngine, type QuerySnapshot } from "../../runtime/data/data-engine";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";
import {
  describeNodeDataRequest,
  type NodeDataDocContext,
  resolveNodeDataRequest,
} from "../utils/node-data-request";

interface UseNodeRowsResult {
  rows: Array<Record<string, unknown>>;
  loading: boolean;
  error?: string;
}

const EMPTY_SNAPSHOT: QuerySnapshot = { status: "empty" };

const resolveRowsFromResult = (result: unknown): Array<Record<string, unknown>> | null => {
  if (Array.isArray(result)) {
    return result as Array<Record<string, unknown>>;
  }
  if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>) && Array.isArray((result as Record<string, unknown>).rows)) {
    return (result as Record<string, unknown>).rows as Array<Record<string, unknown>>;
  }
  return null;
};

/**
 * 节点数据获取 Hook：
 * 1) 订阅 DataEngine 的共享请求快照
 * 2) 如无缓存/在途请求，再触发 execute
 * 3) 对图表应用 computedFields
 * 4) 应用全局/节点过滤器
 */
export const useNodeRows = (
  doc: NodeDataDocContext,
  node: VNode,
  engine: DataEngine,
  dataVersion?: number | string
): UseNodeRowsResult => {
  const request = useMemo(() => resolveNodeDataRequest(doc, node), [doc, node]);
  const requestLabel = request ? describeNodeDataRequest(request) : "no-data-request";
  const expectsRows = node.kind === "chart" || node.kind === "table";
  const [snapshot, setSnapshot] = useState<QuerySnapshot>(() => (request ? engine.inspect(request) : EMPTY_SNAPSHOT));

  useEffect(() => {
    if (!request) {
      setSnapshot(EMPTY_SNAPSHOT);
      return;
    }
    setSnapshot(engine.inspect(request));
    return engine.subscribe(request, () => {
      setSnapshot(engine.inspect(request));
    });
  }, [engine, request]);

  useEffect(() => {
    if (!request) {
      return;
    }
    if (snapshot.status !== "empty") {
      return;
    }
    let active = true;
    const startedAt = Date.now();
    void engine.execute(request).catch((error) => {
      if (!active) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message === "request debounced" || message === "request cancelled") {
        console.warn(
          `[useNodeRows] node=${node.id} ${requestLabel} 请求被重置(${message})，耗时 ${Date.now() - startedAt}ms。`
        );
        return;
      }
      console.warn(
        `[useNodeRows] node=${node.id} ${requestLabel} 数据加载失败，耗时 ${Date.now() - startedAt}ms：${message}`
      );
    });
    return () => {
      active = false;
    };
  }, [dataVersion, engine, node.id, request, requestLabel, snapshot.status]);

  useEffect(() => {
    if (!request || snapshot.status !== "pending") {
      return;
    }
    const timer = window.setTimeout(() => {
      if (engine.inspect(request).status === "pending") {
        console.warn(
          `[useNodeRows] node=${node.id} ${requestLabel} 加载超过 3s，可能存在数据源抖动或请求被持续重置。`
        );
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [engine, node.id, request, requestLabel, snapshot.status]);

  const rawRows = useMemo(() => {
    const resolvedRows = resolveRowsFromResult(snapshot.value);
    if (resolvedRows) {
      if (expectsRows && snapshot.status === "ready" && resolvedRows.length === 0) {
        console.warn(`[useNodeRows] node=${node.id} ${requestLabel} 返回 0 行数据。`);
      }
      return resolvedRows;
    }
    return [];
  }, [expectsRows, node.id, requestLabel, snapshot.status, snapshot.value]);

  const shapeError = useMemo(() => {
    if (snapshot.status !== "ready") {
      return undefined;
    }
    if (snapshot.value === undefined || resolveRowsFromResult(snapshot.value)) {
      return undefined;
    }
    console.warn(
      `[useNodeRows] node=${node.id} ${requestLabel} 返回结构不符合预期，期望 Array 或 { rows: Array }。`
    );
    return "invalid data shape";
  }, [node.id, requestLabel, snapshot.status, snapshot.value]);

  const rows = useMemo(() => {
    const withComputed = node.kind === "chart" ? applyComputedFields(rawRows, (node.props ?? {}) as ChartSpec) : rawRows;
    return applyFilters(withComputed, doc.filters ?? [], node);
  }, [doc.filters, node, rawRows]);

  useEffect(() => {
    if (rawRows.length > 0 && rows.length === 0 && (doc.filters?.length ?? 0) > 0) {
      console.warn(
        `[useNodeRows] node=${node.id} 原始数据 ${rawRows.length} 行，但过滤后为 0 行。请检查 filter.bindField 与数据源字段是否匹配。`
      );
    }
  }, [doc.filters, node.id, rawRows.length, rows.length]);

  const error = snapshot.status === "error" ? snapshot.error : shapeError;
  const loading = Boolean(request) && (snapshot.status === "empty" || snapshot.status === "pending");

  return { rows, loading, error };
};
