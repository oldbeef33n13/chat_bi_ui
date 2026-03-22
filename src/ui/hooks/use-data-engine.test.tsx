import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataSourceDef, QueryDef } from "../../core/doc/types";
import { useDataEngine } from "./use-data-engine";

interface Snapshot {
  engine: ReturnType<typeof useDataEngine>["engine"];
  dataVersion: number;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function UseDataEngineProbe({
  sources,
  queries,
  onSnapshot
}: {
  sources: DataSourceDef[];
  queries: QueryDef[];
  onSnapshot: (snapshot: Snapshot) => void;
}): null {
  const { engine, dataVersion } = useDataEngine(sources, queries);

  useEffect(() => {
    onSnapshot({ engine, dataVersion });
  }, [dataVersion, engine, onSnapshot, queries, sources]);

  return null;
}

describe("useDataEngine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps dataVersion stable when equivalent source/query definitions are re-created", async () => {
    const sources: DataSourceDef[] = [
      {
        id: "ds_equivalent",
        type: "static",
        staticData: [{ value: 1 }],
        cacheEnabled: true,
        cacheTtl: 60_000
      }
    ];
    const queries: QueryDef[] = [{ queryId: "q_equivalent", sourceId: "ds_equivalent", kind: "static", text: "select 1" }];
    const snapshots: Snapshot[] = [];

    const view = render(<UseDataEngineProbe sources={sources} queries={queries} onSnapshot={(snapshot) => snapshots.push(snapshot)} />);

    await waitFor(() => {
      expect(snapshots.at(-1)?.dataVersion).toBe(0);
    });

    const initialEngine = snapshots.at(-1)?.engine;
    view.rerender(<UseDataEngineProbe sources={clone(sources)} queries={clone(queries)} onSnapshot={(snapshot) => snapshots.push(snapshot)} />);

    await waitFor(() => {
      expect(snapshots.length).toBeGreaterThanOrEqual(2);
      expect(snapshots.at(-1)?.dataVersion).toBe(0);
      expect(snapshots.at(-1)?.engine).toBe(initialEngine);
    });
  });

  it("bumps dataVersion when source/query definitions change semantically", async () => {
    const sourceV1: DataSourceDef[] = [
      {
        id: "ds_changed",
        type: "static",
        staticData: [{ value: 1 }],
        cacheEnabled: true,
        cacheTtl: 60_000
      }
    ];
    const sourceV2: DataSourceDef[] = [
      {
        id: "ds_changed",
        type: "static",
        staticData: [{ value: 2 }],
        cacheEnabled: true,
        cacheTtl: 60_000
      }
    ];
    const queries: QueryDef[] = [{ queryId: "q_changed", sourceId: "ds_changed", kind: "static", text: "select value" }];
    const snapshots: Snapshot[] = [];

    const view = render(<UseDataEngineProbe sources={sourceV1} queries={queries} onSnapshot={(snapshot) => snapshots.push(snapshot)} />);

    await waitFor(() => {
      expect(snapshots.at(-1)?.dataVersion).toBe(0);
    });

    const initialEngine = snapshots.at(-1)?.engine;
    view.rerender(<UseDataEngineProbe sources={sourceV2} queries={queries} onSnapshot={(snapshot) => snapshots.push(snapshot)} />);

    await waitFor(() => {
      expect(snapshots.at(-1)?.dataVersion).toBe(1);
      expect(snapshots.at(-1)?.engine).toBe(initialEngine);
    });
  });
});
