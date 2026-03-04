import { describe, expect, it } from "vitest";
import { DataEngine } from "./data-engine";
import type { DataSourceDef, QueryDef } from "../../core/doc/types";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("DataEngine syncSources", () => {
  it("keeps cache when source/query definitions are equivalent", async () => {
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

    const engine = new DataEngine(sources, queries);
    const first = await engine.execute({ sourceId: "ds_equivalent", queryId: "q_equivalent" });
    expect(Array.isArray(first)).toBe(true);

    engine.syncSources(clone(sources), clone(queries));
    const second = await engine.execute({ sourceId: "ds_equivalent", queryId: "q_equivalent" });
    expect(second).toBe(first);
  });

  it("invalidates cache when source definitions change", async () => {
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

    const engine = new DataEngine(sourceV1, queries);
    const first = await engine.execute({ sourceId: "ds_changed", queryId: "q_changed" });
    engine.syncSources(sourceV2, queries);
    const second = await engine.execute({ sourceId: "ds_changed", queryId: "q_changed" });

    expect(Array.isArray(first)).toBe(true);
    expect(Array.isArray(second)).toBe(true);
    expect(second).not.toBe(first);
    expect((second as Array<{ value: number }>)[0]?.value).toBe(2);
  });
});

