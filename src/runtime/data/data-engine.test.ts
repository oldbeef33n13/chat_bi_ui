import { afterEach, describe, expect, it, vi } from "vitest";
import { DataEngine } from "./data-engine";
import type { DataSourceDef, QueryDef } from "../../core/doc/types";

/** 深拷贝测试数据，确保 syncSources 比较不受引用影响。 */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** DataEngine 缓存与定义同步回归测试。 */
describe("DataEngine syncSources", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** 定义语义不变时，应保留缓存命中。 */
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

  /** 定义发生变化时，应失效缓存并返回新数据。 */
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

  it("deduplicates endpoint-backed requests with the same cache key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "ops_alarm_trend",
            requestEcho: { region: "north" },
            resultSchema: [],
            rows: [{ ts: "2026-03-10 10:00", total: 12 }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = new DataEngine([], [], { debounceMs: 0 });
    const [first, second] = await Promise.all([
      engine.execute({ endpointId: "ops_alarm_trend", params: { region: "north" } }),
      engine.execute({ endpointId: "ops_alarm_trend", params: { region: "north" } })
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    const calls = fetchMock.mock.calls as unknown[][];
    expect(String(calls[0]?.[0] ?? "")).toContain("/api/v1/data-endpoints/ops_alarm_trend/test");
  });

  it("exposes request snapshots for cached and in-flight endpoint requests", async () => {
    let resolveFetch: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = new DataEngine([], [], { debounceMs: 0 });
    const request = { endpointId: "ops_alarm_trend", params: { region: "north" } };

    const pendingPromise = engine.execute(request);
    expect(engine.inspect(request)).toMatchObject({ status: "pending" });

    expect(resolveFetch).toBeTypeOf("function");
    if (resolveFetch) {
      (resolveFetch as (value: Response) => void)(
        new Response(
          JSON.stringify({
            id: "ops_alarm_trend",
            rows: [{ ts: "2026-03-10 10:00", total: 12 }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );
    }

    const result = await pendingPromise;
    expect(result).toMatchObject({
      id: "ops_alarm_trend",
      rows: [{ ts: "2026-03-10 10:00", total: 12 }]
    });
    expect(engine.inspect(request)).toMatchObject({
      status: "ready",
      value: result
    });
  });

  it("retries endpoint requests after a cancellation instead of reusing the aborted pending promise", async () => {
    let firstSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        firstSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((resolve, reject) => {
          firstSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "ops_alarm_trend",
            rows: [{ ts: "2026-03-10 10:00", total: 12 }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const engine = new DataEngine([], [], { debounceMs: 0 });
    const firstPromise = engine.execute({ endpointId: "ops_alarm_trend", params: { region: "north" } });
    engine.cancel(`endpoint::ops_alarm_trend::${JSON.stringify({ region: "north" })}`);
    await expect(firstPromise).rejects.toThrow("request cancelled");

    const second = await engine.execute({ endpointId: "ops_alarm_trend", params: { region: "north" } });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(second).toMatchObject({
      id: "ops_alarm_trend",
      rows: [{ ts: "2026-03-10 10:00", total: 12 }]
    });
  });

  it("keeps same-key endpoint requests deduplicated after debounce has started the fetch", async () => {
    vi.useFakeTimers();
    let resolveFetch: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    const engine = new DataEngine([], [], { debounceMs: 20 });
    const request = { endpointId: "ops_alarm_trend", params: { region: "north" } };

    const firstPromise = engine.execute(request);
    await vi.advanceTimersByTimeAsync(20);
    const secondPromise = engine.execute(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(resolveFetch).toBeTypeOf("function");
    if (resolveFetch) {
      (resolveFetch as (value: Response) => void)(
        new Response(
          JSON.stringify({
            id: "ops_alarm_trend",
            rows: [{ ts: "2026-03-10 10:00", total: 12 }]
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        )
      );
    }

    await expect(firstPromise).resolves.toMatchObject({
      id: "ops_alarm_trend",
      rows: [{ ts: "2026-03-10 10:00", total: 12 }]
    });
  });
});
