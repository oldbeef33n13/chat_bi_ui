import { useEffect, useMemo, useRef } from "react";
import type { DataSourceDef, QueryDef } from "../../core/doc/types";
import { DataEngine, type DataEngineOptions } from "../../runtime/data/data-engine";

/** 用于判断数据定义是否变化的稳定签名。 */
const normalizeDataDefs = (sources: DataSourceDef[] = [], queries: QueryDef[] = []): string =>
  JSON.stringify({ sources, queries });

export interface UseDataEngineResult {
  engine: DataEngine;
  dataVersion: string;
}

/** DataEngine Hook：负责实例复用、定义同步、卸载清理。 */
export const useDataEngine = (
  sources: DataSourceDef[] = [],
  queries: QueryDef[] = [],
  options: DataEngineOptions = {}
): UseDataEngineResult => {
  const dataVersion = useMemo(() => normalizeDataDefs(sources, queries), [sources, queries]);
  const engineRef = useRef<DataEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new DataEngine(sources, queries, options);
  }

  useEffect(() => {
    engineRef.current?.syncSources(sources, queries);
  }, [dataVersion, sources, queries]);

  useEffect(
    () => () => {
      // 组件卸载时主动取消在途请求，避免内存泄露与状态回写。
      engineRef.current?.cancel();
    },
    []
  );

  return { engine: engineRef.current, dataVersion };
};
