import type { VDoc } from "../../core/doc/types";
import { DocApiError } from "./doc-repository";
import type {
  CreateTemplateExportInput,
  TemplateArtifact,
  TemplateExportAccepted,
  TemplatePreviewResult,
  TemplateRun,
  TemplateRuntimeRepository
} from "./template-runtime-repository";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const parseArtifact = (value: unknown): TemplateArtifact => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    artifactType: String(raw.artifactType ?? ""),
    fileName: String(raw.fileName ?? ""),
    contentType: String(raw.contentType ?? "application/octet-stream"),
    sizeBytes: Number(raw.sizeBytes ?? 0),
    createdAt: raw.createdAt === undefined || raw.createdAt === null ? undefined : String(raw.createdAt),
    downloadUrl: String(raw.downloadUrl ?? "")
  };
};

const parseRun = (value: unknown): TemplateRun => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    triggerType: String(raw.triggerType ?? ""),
    templateId: String(raw.templateId ?? ""),
    scheduleJobId: raw.scheduleJobId === undefined || raw.scheduleJobId === null ? undefined : String(raw.scheduleJobId),
    templateRevisionNo: Number(raw.templateRevisionNo ?? 0),
    outputType: String(raw.outputType ?? "dashboard_snapshot_json") as TemplateRun["outputType"],
    status: String(raw.status ?? "queued") as TemplateRun["status"],
    variables: ensureObject(raw.variables),
    startedAt: raw.startedAt === undefined || raw.startedAt === null ? undefined : String(raw.startedAt),
    finishedAt: raw.finishedAt === undefined || raw.finishedAt === null ? undefined : String(raw.finishedAt),
    errorMessage: raw.errorMessage === undefined || raw.errorMessage === null ? undefined : String(raw.errorMessage),
    createdAt: raw.createdAt === undefined || raw.createdAt === null ? undefined : String(raw.createdAt),
    artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.map(parseArtifact) : []
  };
};

const parsePreview = (value: unknown): TemplatePreviewResult => {
  const raw = ensureObject(value);
  const snapshot = raw.snapshot as VDoc | undefined;
  if (!snapshot || typeof snapshot !== "object") {
    throw new DocApiError("响应缺少 snapshot", 500, value);
  }
  return {
    templateId: String(raw.templateId ?? ""),
    revision: Number(raw.revision ?? 0),
    snapshot,
    resolvedVariables: ensureObject(raw.resolvedVariables)
  };
};

const parseAccepted = (value: unknown): TemplateExportAccepted => {
  const raw = ensureObject(value);
  return {
    runId: String(raw.runId ?? ""),
    status: String(raw.status ?? "queued")
  };
};

export class HttpTemplateRuntimeRepository implements TemplateRuntimeRepository {
  constructor(private readonly baseUrl = "/api/v1") {}

  async previewTemplate(templateId: string, variables?: Record<string, unknown>, doc?: VDoc): Promise<TemplatePreviewResult> {
    return parsePreview(
      await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}/preview`, {
        method: "POST",
        body: JSON.stringify({ dsl: doc, variables: variables ?? {} })
      })
    );
  }

  async exportTemplate(templateId: string, input: CreateTemplateExportInput): Promise<TemplateExportAccepted> {
    return parseAccepted(
      await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}/exports`, {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
  }

  async getRun(runId: string): Promise<TemplateRun> {
    return parseRun(await this.requestJson(`${this.baseUrl}/runs/${encodeURIComponent(runId)}`, { method: "GET" }));
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
      throw new DocApiError(message, response.status, payload);
    }
    return payload;
  }
}
