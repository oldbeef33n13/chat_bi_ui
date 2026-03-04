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

  useEffect(() => {
    const sourceId = node.data?.sourceId;
    if (!sourceId) {
      setState({ rawRows: [], loading: false });
      return;
    }
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    engine
      .execute({
        sourceId,
        queryId: node.data?.queryId,
        params: node.data?.params
      })
      .then((result) => {
        if (!active) {
          return;
        }
        if (Array.isArray(result)) {
          const sourceRows = result as Array<Record<string, unknown>>;
          setState({ rawRows: sourceRows, loading: false });
          return;
        }
        if (result && typeof result === "object" && "rows" in (result as Record<string, unknown>) && Array.isArray((result as Record<string, unknown>).rows)) {
          const rowsValue = (result as Record<string, unknown>).rows as Array<Record<string, unknown>>;
          setState({ rawRows: rowsValue, loading: false });
          return;
        }
        setState({ rawRows: [], loading: false, error: "invalid data shape" });
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setState({ rawRows: [], loading: false, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      active = false;
      // 卸载或依赖切换时取消本请求键，防止旧请求晚到覆盖。
      engine.cancel(`${sourceId}::${node.data?.queryId ?? "na"}::${JSON.stringify(node.data?.params ?? {})}`);
    };
  }, [dataVersion, engine, node.data?.params, node.data?.queryId, node.data?.sourceId]);

  const rows = useMemo(() => {
    const withComputed = node.kind === "chart" ? applyComputedFields(state.rawRows, (node.props ?? {}) as ChartSpec) : state.rawRows;
    return applyFilters(withComputed, doc.filters ?? [], node);
  }, [doc.filters, node, state.rawRows]);

  return { rows, loading: state.loading, error: state.error };
};
