import { useEffect, useMemo, useState } from "react";
import type { ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";

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
  const fallbackSourceId = doc.dataSources?.[0]?.id;
  const sourceId = node.data?.sourceId ?? fallbackSourceId;
  const fallbackQueryId = sourceId ? doc.queries?.find((item) => item.sourceId === sourceId)?.queryId : undefined;
  const queryId = node.data?.queryId ?? fallbackQueryId;
  const params = node.data?.params;
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);
  const requestKey = `${sourceId ?? "na"}::${queryId ?? "na"}::${paramsKey}`;

  useEffect(() => {
    if (!sourceId) {
      if (node.kind === "chart" || node.kind === "table") {
        // 缺绑定时给出可定位提示，不中断页面渲染。
        console.warn(`[useNodeRows] node=${node.id} kind=${node.kind} 缺少 data.sourceId，已返回空数据。`);
      }
      setState({ rawRows: [], loading: false });
      return;
    }
    if (!node.data?.sourceId && fallbackSourceId) {
      console.warn(
        `[useNodeRows] node=${node.id} 未配置 data.sourceId，已回退到首个数据源 ${fallbackSourceId}。`
      );
    }
    if (!node.data?.queryId && queryId) {
      console.warn(
        `[useNodeRows] node=${node.id} 未配置 data.queryId，已回退到匹配查询 ${queryId}。`
      );
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
        params
      })
      .then((result) => {
        clearWarning();
        if (!active) {
          return;
        }
        if (Array.isArray(result)) {
          const sourceRows = result as Array<Record<string, unknown>>;
          if (sourceRows.length === 0) {
            console.warn(`[useNodeRows] node=${node.id} source=${sourceId} 返回 0 行数据。`);
          }
          setState({ rawRows: sourceRows, loading: false });
          return;
        }
        if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>) && Array.isArray((result as Record<string, unknown>).rows)) {
          const rowsValue = (result as Record<string, unknown>).rows as Array<Record<string, unknown>>;
          if (rowsValue.length === 0) {
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
  }, [dataVersion, engine, node.id, node.kind, queryId, requestKey, sourceId]);

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
