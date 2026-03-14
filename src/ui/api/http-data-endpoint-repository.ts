import { TemplateApiError } from "./template-repository";
import type {
  DataEndpointMeta,
  DataEndpointPage,
  DataEndpointRepository,
  DataEndpointTestResult,
  ListDataEndpointsParams,
  UpsertDataEndpointInput
} from "./data-endpoint-repository";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const parseFieldList = (value: unknown): DataEndpointMeta["paramSchema"] =>
  Array.isArray(value)
    ? value.map((item) => {
        const raw = ensureObject(item);
        return {
          name: String(raw.name ?? ""),
          type: String(raw.type ?? "string"),
          label: raw.label === undefined ? undefined : String(raw.label),
          description: raw.description === undefined ? undefined : String(raw.description),
          unit: raw.unit === undefined || raw.unit === null ? null : String(raw.unit),
          aggAble: raw.aggAble === undefined ? undefined : Boolean(raw.aggAble),
          required: raw.required === undefined ? undefined : Boolean(raw.required),
          defaultValue: raw.defaultValue,
          enumValues: Array.isArray(raw.enumValues) ? raw.enumValues.map((entry) => String(entry)) : undefined
        };
      })
    : [];

const parseEndpoint = (value: unknown): DataEndpointMeta => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    category: String(raw.category ?? ""),
    providerType: String(raw.providerType ?? "mock_rest") as DataEndpointMeta["providerType"],
    origin: String(raw.origin ?? "system") as DataEndpointMeta["origin"],
    method: String(raw.method ?? "GET") as DataEndpointMeta["method"],
    path: String(raw.path ?? ""),
    description: String(raw.description ?? ""),
    paramSchema: parseFieldList(raw.paramSchema),
    resultSchema: parseFieldList(raw.resultSchema),
    sampleRequest: ensureObject(raw.sampleRequest),
    sampleResponse: raw.sampleResponse,
    enabled: raw.enabled === undefined ? true : Boolean(raw.enabled),
    createdAt: raw.createdAt === undefined ? undefined : String(raw.createdAt),
    updatedAt: raw.updatedAt === undefined ? undefined : String(raw.updatedAt)
  };
};

const parseTestResult = (value: unknown): DataEndpointTestResult => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    requestEcho: ensureObject(raw.requestEcho),
    resultSchema: parseFieldList(raw.resultSchema),
    rows: Array.isArray(raw.rows) ? raw.rows.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item)) : []
  };
};

export class HttpDataEndpointRepository implements DataEndpointRepository {
  constructor(private readonly baseUrl = "/api/v1") {}

  async listEndpoints(params: ListDataEndpointsParams = {}): Promise<DataEndpointPage> {
    const query = new URLSearchParams();
    if (params.q) {
      query.set("q", params.q);
    }
    if (params.category && params.category !== "all") {
      query.set("category", params.category);
    }
    if (params.providerType && params.providerType !== "all") {
      query.set("providerType", params.providerType);
    }
    if (params.enabled !== undefined) {
      query.set("enabled", params.enabled ? "true" : "false");
    }
    const payload = await this.requestJson(`${this.baseUrl}/data-endpoints${query.size > 0 ? `?${query.toString()}` : ""}`, { method: "GET" });
    const raw = ensureObject(payload);
    const items = Array.isArray(raw.items) ? raw.items.map(parseEndpoint) : [];
    return {
      items,
      total: Number(raw.total ?? items.length)
    };
  }

  async getEndpoint(endpointId: string): Promise<DataEndpointMeta> {
    return parseEndpoint(await this.requestJson(`${this.baseUrl}/data-endpoints/${encodeURIComponent(endpointId)}`, { method: "GET" }));
  }

  async createEndpoint(input: UpsertDataEndpointInput): Promise<DataEndpointMeta> {
    return parseEndpoint(
      await this.requestJson(`${this.baseUrl}/data-endpoints`, {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
  }

  async updateEndpoint(endpointId: string, input: UpsertDataEndpointInput): Promise<DataEndpointMeta> {
    return parseEndpoint(
      await this.requestJson(`${this.baseUrl}/data-endpoints/${encodeURIComponent(endpointId)}`, {
        method: "PUT",
        body: JSON.stringify(input)
      })
    );
  }

  async testEndpoint(endpointId: string, params?: Record<string, unknown>): Promise<DataEndpointTestResult> {
    return parseTestResult(
      await this.requestJson(`${this.baseUrl}/data-endpoints/${encodeURIComponent(endpointId)}/test`, {
        method: "POST",
        body: JSON.stringify({ params: params ?? {} })
      })
    );
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = ensureObject(payload).message ? String(ensureObject(payload).message) : `HTTP ${response.status}`;
      throw new TemplateApiError(message, response.status, payload);
    }
    return payload;
  }
}
