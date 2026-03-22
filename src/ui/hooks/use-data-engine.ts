import { useEffect, useRef, useState } from "react";
import type { DataSourceDef, QueryDef } from "../../core/doc/types";
import { DataEngine, type DataEngineOptions } from "../../runtime/data/data-engine";

export interface UseDataEngineResult {
  engine: DataEngine;
  dataVersion: number;
}

/** DataEngine Hook：负责实例复用、定义同步、卸载清理。 */
export const useDataEngine = (
  sources: DataSourceDef[] = [],
  queries: QueryDef[] = [],
  options: DataEngineOptions = {}
): UseDataEngineResult => {
  const engineRef = useRef<DataEngine | null>(null);
  const defsRef = useRef<{ sources: DataSourceDef[]; queries: QueryDef[] } | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  if (!engineRef.current) {
    engineRef.current = new DataEngine(sources, queries, options);
    defsRef.current = { sources, queries };
  }

  useEffect(() => {
    const currentDefs = defsRef.current;
    if (currentDefs?.sources === sources && currentDefs.queries === queries) {
      return;
    }
    const changed = engineRef.current?.syncSources(sources, queries) ?? false;
    defsRef.current = { sources, queries };
    if (changed) {
      setDataVersion((value) => value + 1);
    }
  }, [queries, sources]);

  useEffect(
    () => () => {
      // 组件卸载时主动取消在途请求，避免内存泄露与状态回写。
      engineRef.current?.cancel();
    },
    []
  );

  return { engine: engineRef.current, dataVersion };
};
