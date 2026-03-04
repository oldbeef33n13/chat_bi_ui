import type { DataSourceDef, QueryDef } from "../../core/doc/types";

export interface QueryRequest {
  sourceId: string;
  queryId?: string;
  params?: Record<string, string | number | boolean | string[]>;
}

export interface DataEngineOptions {
  debounceMs?: number;
}

interface CacheEntry {
  at: number;
  value: unknown;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export class DataEngine {
  private readonly sources = new Map<string, DataSourceDef>();
  private readonly queries = new Map<string, QueryDef>();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, AbortController>();
  private readonly pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private defsSignature = "";

  constructor(
    sources: DataSourceDef[] = [],
    queries: QueryDef[] = [],
    private readonly options: DataEngineOptions = {}
  ) {
    this.syncSources(sources, queries);
  }

  syncSources(sources: DataSourceDef[] = [], queries: QueryDef[] = []): void {
    const nextSignature = this.serializeDefinitions(sources, queries);
    if (nextSignature === this.defsSignature) {
      return;
    }
    this.defsSignature = nextSignature;
    this.cancel();
    this.pendingTimers.forEach((timer) => clearTimeout(timer));
    this.pendingTimers.clear();
    this.cache.clear();
    this.sources.clear();
    this.queries.clear();
    sources.forEach((item) => this.sources.set(item.id, item));
    queries.forEach((item) => this.queries.set(item.queryId, item));
  }

  cancel(requestKey?: string): void {
    if (requestKey) {
      this.inFlight.get(requestKey)?.abort();
      this.inFlight.delete(requestKey);
      return;
    }
    this.inFlight.forEach((ctrl) => ctrl.abort());
    this.inFlight.clear();
  }

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

    if (this.options.debounceMs && this.options.debounceMs > 0) {
      await this.debounce(key, this.options.debounceMs);
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
  }

  private async fetchWithRetry(
    source: DataSourceDef,
    query: QueryDef | undefined,
    params: QueryRequest["params"],
    signal: AbortSignal
  ): Promise<unknown> {
    if (source.type === "static") {
      return source.staticData ?? [];
    }
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

  private buildCacheKey(
    source: DataSourceDef,
    query: QueryDef | undefined,
    params?: QueryRequest["params"]
  ): string {
    return `${source.id}::${query?.queryId ?? "na"}::${JSON.stringify(params ?? {})}`;
  }

  private serializeDefinitions(sources: DataSourceDef[], queries: QueryDef[]): string {
    return JSON.stringify({ sources, queries });
  }

  private debounce(key: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const lastTimer = this.pendingTimers.get(key);
      if (lastTimer) {
        clearTimeout(lastTimer);
      }
      const timer = setTimeout(() => {
        this.pendingTimers.delete(key);
        resolve();
      }, ms);
      this.pendingTimers.set(key, timer);
    });
  }
}
