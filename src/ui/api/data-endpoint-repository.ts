export interface DataEndpointField {
  name: string;
  type: string;
  label?: string;
  description?: string;
  unit?: string | null;
  aggAble?: boolean;
  required?: boolean;
  defaultValue?: unknown;
  enumValues?: string[];
}

export interface DataEndpointMeta {
  id: string;
  name: string;
  category: string;
  providerType: "mock_rest" | "manual_rest" | "nl2sql_rest";
  origin: "system" | "manual" | "ai_generated";
  method: "GET" | "POST";
  path: string;
  description: string;
  paramSchema: DataEndpointField[];
  resultSchema: DataEndpointField[];
  sampleRequest: Record<string, unknown>;
  sampleResponse: unknown;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface DataEndpointPage {
  items: DataEndpointMeta[];
  total: number;
}

export interface ListDataEndpointsParams {
  q?: string;
  category?: string;
  providerType?: DataEndpointMeta["providerType"] | "all";
  enabled?: boolean;
}

export interface UpsertDataEndpointInput {
  id?: string;
  name: string;
  category?: string;
  providerType: DataEndpointMeta["providerType"];
  origin: DataEndpointMeta["origin"];
  method: DataEndpointMeta["method"];
  path: string;
  description?: string;
  paramSchema?: DataEndpointField[];
  resultSchema?: DataEndpointField[];
  sampleRequest?: Record<string, unknown>;
  sampleResponse?: unknown;
  enabled?: boolean;
}

export interface DataEndpointTestResult {
  id: string;
  requestEcho: Record<string, unknown>;
  resultSchema: DataEndpointField[];
  rows: Array<Record<string, unknown>>;
}

export interface DataEndpointRepository {
  listEndpoints(params?: ListDataEndpointsParams): Promise<DataEndpointPage>;
  getEndpoint(endpointId: string): Promise<DataEndpointMeta>;
  createEndpoint(input: UpsertDataEndpointInput): Promise<DataEndpointMeta>;
  updateEndpoint(endpointId: string, input: UpsertDataEndpointInput): Promise<DataEndpointMeta>;
  testEndpoint(endpointId: string, params?: Record<string, unknown>): Promise<DataEndpointTestResult>;
}
