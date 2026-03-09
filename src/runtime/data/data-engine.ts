import type { DataSourceDef, QueryDef } from "../../core/doc/types";

/** 查询执行请求参数。 */
export interface QueryRequest {
  sourceId: string;
  queryId?: string;
  params?: Record<string, string | number | boolean | string[]>;
}

/** DataEngine 运行参数。 */
export interface DataEngineOptions {
  debounceMs?: number;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

interface DebounceEntry {
  timer: ReturnType<typeof setTimeout>;
  resolve: (ready: boolean) => void;
}

/** 简单异步等待，用于重试退避。 */
const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * 统一数据执行引擎。
 * 支持静态数据、远端数据、缓存、重试、防抖与请求取消。
 */
export class DataEngine {
  private readonly sources = new Map<string, DataSourceDef>();
  private readonly queries = new Map<string, QueryDef>();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, AbortController>();
  private readonly pendingExecutions = new Map<string, Promise<unknown>>();
  private readonly pendingDebounces = new Map<string, DebounceEntry>();
  private defsSignature = "";

  constructor(
    sources: DataSourceDef[] = [],
    queries: QueryDef[] = [],
    private readonly options: DataEngineOptions = {}
  ) {
    this.syncSources(sources, queries);
  }

  /** 同步数据源定义：定义变化时清理缓存与在途请求。 */
  syncSources(sources: DataSourceDef[] = [], queries: QueryDef[] = []): void {
    const nextSignature = this.serializeDefinitions(sources, queries);
    if (nextSignature === this.defsSignature) {
      return;
    }
    this.defsSignature = nextSignature;
    this.cancel();
    this.clearPendingDebounces();
    this.cache.clear();
    this.sources.clear();
    this.queries.clear();
    sources.forEach((item) => this.sources.set(item.id, item));
    queries.forEach((item) => this.queries.set(item.queryId, item));
  }

  /** 取消指定请求或全部在途请求。 */
  cancel(requestKey?: string): void {
    if (requestKey) {
      this.inFlight.get(requestKey)?.abort();
      this.inFlight.delete(requestKey);
      this.cancelDebounce(requestKey);
      return;
    }
    this.inFlight.forEach((ctrl) => ctrl.abort());
    this.inFlight.clear();
    this.clearPendingDebounces();
  }

  /** 执行查询：缓存命中 -> 防抖 -> 发起请求 -> 重试 -> 回填缓存。 */
  async execute(request: QueryRequest): Promise<unknown> {
    const source = this.sources.get(request.sourceId);
    if (!source) {
      throw new Error(`data source not found: ${request.sourceId}`);
    }
    const query = request.queryId ? this.queries.get(request.queryId) : undefined;
    const key = this.buildCacheKey(source, query, request.params);

    if (source.cacheEnabled) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.at <= (source.cacheTtl ?? 0)) {
        return cached.value;
      }
    }
    const pending = this.pendingExecutions.get(key);
    if (pending) {
      // 同 key 请求复用同一执行链，避免多个图表互相取消/防抖打架。
      return pending;
    }

    const run = (async (): Promise<unknown> => {
      if (source.type === "static") {
        // 静态源无需防抖，直接返回，避免纯本地数据也被“debounced”。
        const value = source.staticData ?? [];
        if (source.cacheEnabled) {
          this.cache.set(key, { at: Date.now(), value });
        }
        return value;
      }

      if (this.options.debounceMs && this.options.debounceMs > 0) {
        const ready = await this.debounce(key, this.options.debounceMs);
        if (!ready) {
          throw new Error("request debounced");
        }
      }

      this.cancel(key);
      const controller = new AbortController();
      this.inFlight.set(key, controller);

      try {
        const value = await this.fetchWithRetry(source, query, request.params, controller.signal);
        if (source.cacheEnabled) {
          this.cache.set(key, { at: Date.now(), value });
        }
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.pendingExecutions.set(
      key,
      run.finally(() => {
        this.pendingExecutions.delete(key);
      })
    );

    return this.pendingExecutions.get(key)!;
  }

  /** 请求执行器：静态源直接返回；远端源按重试策略请求。 */
  private async fetchWithRetry(
    source: DataSourceDef,
    query: QueryDef | undefined,
    params: QueryRequest["params"],
    signal: AbortSignal
  ): Promise<unknown> {
    if (source.type === "static") {
      return source.staticData ?? [];
    }
    // 远端数据源：按 source 配置做重试和退避。
    const retryEnabled = source.retryEnabled ?? true;
    const retryMax = source.retryMax ?? 2;
    const retryInterval = source.retryInterval ?? 250;

    let latestError: unknown;
    for (let attempt = 0; attempt <= (retryEnabled ? retryMax : 0); attempt += 1) {
      try {
        if (!source.url || !source.method) {
          throw new Error(`remote source ${source.id} missing url/method`);
        }
        const mergedParams = { ...source.params, ...params };
        const response = await fetch(this.buildUrl(source.url, source.method, mergedParams), {
          method: source.method,
          headers: {
            "Content-Type": "application/json",
            ...(source.headers ?? {})
          },
          body: source.method === "POST" ? JSON.stringify({ query: query?.text, params: mergedParams }) : undefined,
          signal
        });
        if (!response.ok) {
          throw new Error(`http ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (signal.aborted) {
          throw new Error("request cancelled");
        }
        latestError = error;
        if (attempt < retryMax) {
          await wait(retryInterval * (attempt + 1));
          continue;
        }
      }
    }
    throw latestError instanceof Error ? latestError : new Error(String(latestError));
  }

  /** GET 请求拼装查询参数；POST 原样返回 base。 */
  private buildUrl(base: string, method: "GET" | "POST", params?: QueryRequest["params"]): string {
    if (method === "POST" || !params || Object.keys(params).length === 0) {
      return base;
    }
    const url = new URL(base, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((entry) => url.searchParams.append(key, String(entry)));
        return;
      }
      url.searchParams.set(key, String(value));
    });
    return url.toString();
  }

  /** 生成缓存键。 */
  private buildCacheKey(
    source: DataSourceDef,
    query: QueryDef | undefined,
    params?: QueryRequest["params"]
  ): string {
    return `${source.id}::${query?.queryId ?? "na"}::${JSON.stringify(params ?? {})}`;
  }

  /** 序列化定义，用于判定 sources/queries 是否发生实质变化。 */
  private serializeDefinitions(sources: DataSourceDef[], queries: QueryDef[]): string {
    return JSON.stringify({ sources, queries });
  }

  private debounce(key: string, ms: number): Promise<boolean> {
    // 同 key 只保留最后一次触发，避免高频请求抖动。
    return new Promise((resolve) => {
      const last = this.pendingDebounces.get(key);
      if (last) {
        clearTimeout(last.timer);
        // 旧请求让位给新请求，避免 Promise 永久 pending。
        last.resolve(false);
      }
      const timer = setTimeout(() => {
        const latest = this.pendingDebounces.get(key);
        if (latest?.timer === timer) {
          this.pendingDebounces.delete(key);
        }
        resolve(true);
      }, ms);
      this.pendingDebounces.set(key, { timer, resolve });
    });
  }

  private cancelDebounce(key: string): void {
    const pending = this.pendingDebounces.get(key);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pending.resolve(false);
    this.pendingDebounces.delete(key);
  }

  private clearPendingDebounces(): void {
    this.pendingDebounces.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.resolve(false);
    });
    this.pendingDebounces.clear();
  }
}
