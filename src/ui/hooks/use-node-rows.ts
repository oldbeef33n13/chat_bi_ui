import { useEffect, useMemo, useState } from "react";
import type { ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";
import { HttpDataEndpointRepository } from "../api/http-data-endpoint-repository";
import { resolveDataEndpointParams } from "../utils/data-endpoint-binding";

interface FetchState {
  rawRows: Array<Record<string, unknown>>;
  loading: boolean;
  error?: string;
}

interface UseNodeRowsResult {
  rows: Array<Record<string, unknown>>;
  loading: boolean;
  error?: string;
}

/**
 * 节点数据获取 Hook：
 * 1) 按 node.data 拉取源数据
 * 2) 对图表应用 computedFields
 * 3) 应用全局/节点过滤器
 */
export const useNodeRows = (
  doc: VDoc,
  node: VNode,
  engine: DataEngine,
  dataVersion?: string
): UseNodeRowsResult => {
  const [state, setState] = useState<FetchState>({ rawRows: [], loading: false });
  const endpointRepo = useMemo(() => new HttpDataEndpointRepository("/api/v1"), []);
  const endpointId = node.data?.endpointId;
  const fallbackSourceId = doc.dataSources?.[0]?.id;
  const sourceId = node.data?.sourceId ?? fallbackSourceId;
  const fallbackQueryId = sourceId ? doc.queries?.find((item) => item.sourceId === sourceId)?.queryId : undefined;
  const queryId = node.data?.queryId ?? fallbackQueryId;
  const params = endpointId ? resolveDataEndpointParams(doc, node) : node.data?.params;
  const engineParams = endpointId ? undefined : (params as Record<string, string | number | boolean | string[]> | undefined);
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);
  const requestKey = `${endpointId ?? "na"}::${sourceId ?? "na"}::${queryId ?? "na"}::${paramsKey}`;
  const expectsRows = node.kind === "chart" || node.kind === "table";

  useEffect(() => {
    if (endpointId) {
      let active = true;
      const startedAt = Date.now();
      const warningTimer = window.setTimeout(() => {
        if (!active) {
          return;
        }
        console.warn(
          `[useNodeRows] node=${node.id} endpoint=${endpointId} 加载超过 3s，可能存在接口抖动或请求被持续重置。`
        );
      }, 3000);
      const clearWarning = (): void => window.clearTimeout(warningTimer);
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      endpointRepo
        .testEndpoint(endpointId, params)
        .then((result) => {
          clearWarning();
          if (!active) {
            return;
          }
          if (result.rows.length === 0) {
            console.warn(`[useNodeRows] node=${node.id} endpoint=${endpointId} 返回 0 行数据。`);
          }
          setState({ rawRows: result.rows, loading: false });
        })
        .catch((error) => {
          clearWarning();
          if (!active) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          console.warn(
            `[useNodeRows] node=${node.id} endpoint=${endpointId} 数据加载失败，耗时 ${Date.now() - startedAt}ms：${message}`
          );
          setState({ rawRows: [], loading: false, error: message });
        });
      return () => {
        active = false;
        clearWarning();
      };
    }
    if (!sourceId) {
      setState({ rawRows: [], loading: false });
      return;
    }
    let active = true;
    const startedAt = Date.now();
    const warningTimer = window.setTimeout(() => {
      if (!active) {
        return;
      }
      console.warn(
        `[useNodeRows] node=${node.id} source=${sourceId} query=${queryId ?? "na"} 加载超过 3s，可能存在数据源抖动或请求被持续重置。`
      );
    }, 3000);
    const clearWarning = (): void => window.clearTimeout(warningTimer);
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    engine
      .execute({
        sourceId,
        queryId,
        params: engineParams
      })
      .then((result) => {
        clearWarning();
        if (!active) {
          return;
        }
        if (Array.isArray(result)) {
          const sourceRows = result as Array<Record<string, unknown>>;
          if (expectsRows && sourceRows.length === 0) {
            console.warn(`[useNodeRows] node=${node.id} source=${sourceId} 返回 0 行数据。`);
          }
          setState({ rawRows: sourceRows, loading: false });
          return;
        }
        if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>) && Array.isArray((result as Record<string, unknown>).rows)) {
          const rowsValue = (result as Record<string, unknown>).rows as Array<Record<string, unknown>>;
          if (expectsRows && rowsValue.length === 0) {
            console.warn(`[useNodeRows] node=${node.id} source=${sourceId} 返回 rows=0。`);
          }
          setState({ rawRows: rowsValue, loading: false });
          return;
        }
        console.warn(
          `[useNodeRows] node=${node.id} source=${sourceId} 返回结构不符合预期，期望 Array 或 { rows: Array }。`
        );
        setState({ rawRows: [], loading: false, error: "invalid data shape" });
      })
      .catch((error) => {
        clearWarning();
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        // 防抖让位/取消属于可预期行为，不中断 UI。
        if (message === "request debounced" || message === "request cancelled") {
          console.warn(
            `[useNodeRows] node=${node.id} source=${sourceId} 请求被重置(${message})，耗时 ${Date.now() - startedAt}ms。`
          );
          setState((prev) => ({ ...prev, loading: false }));
          return;
        }
        console.warn(
          `[useNodeRows] node=${node.id} source=${sourceId} 数据加载失败，耗时 ${Date.now() - startedAt}ms：${message}`
        );
        setState({ rawRows: [], loading: false, error: message });
      });
    return () => {
      active = false;
      clearWarning();
      };
  }, [dataVersion, endpointId, endpointRepo, engine, engineParams, node.id, node.kind, paramsKey, queryId, requestKey, sourceId]);

  const rows = useMemo(() => {
    const withComputed = node.kind === "chart" ? applyComputedFields(state.rawRows, (node.props ?? {}) as ChartSpec) : state.rawRows;
    return applyFilters(withComputed, doc.filters ?? [], node);
  }, [doc.filters, node, state.rawRows]);

  useEffect(() => {
    if (state.rawRows.length > 0 && rows.length === 0 && (doc.filters?.length ?? 0) > 0) {
      console.warn(
        `[useNodeRows] node=${node.id} 原始数据 ${state.rawRows.length} 行，但过滤后为 0 行。请检查 filter.bindField 与数据源字段是否匹配。`
      );
    }
  }, [doc.filters, node.id, rows.length, state.rawRows.length]);

  return { rows, loading: state.loading, error: state.error };
};
