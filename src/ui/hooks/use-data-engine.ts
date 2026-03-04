import { useEffect, useMemo, useRef } from "react";
import type { DataSourceDef, QueryDef } from "../../core/doc/types";
import { DataEngine, type DataEngineOptions } from "../../runtime/data/data-engine";

const normalizeDataDefs = (sources: DataSourceDef[] = [], queries: QueryDef[] = []): string =>
  JSON.stringify({ sources, queries });

export interface UseDataEngineResult {
  engine: DataEngine;
  dataVersion: string;
}

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
      engineRef.current?.cancel();
    },
    []
  );

  return { engine: engineRef.current, dataVersion };
};

