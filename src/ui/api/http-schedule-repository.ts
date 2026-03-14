import { TemplateApiError } from "./template-repository";
import type {
  ScheduleArtifact,
  ScheduleJobMeta,
  ScheduleRepository,
  ScheduleRun,
  ScheduleRunNowResult,
  UpsertScheduleInput
} from "./schedule-repository";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const parseArtifact = (value: unknown): ScheduleArtifact => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    artifactType: String(raw.artifactType ?? ""),
    fileName: String(raw.fileName ?? ""),
    contentType: String(raw.contentType ?? "application/octet-stream"),
    sizeBytes: Number(raw.sizeBytes ?? 0),
    createdAt: raw.createdAt === undefined ? undefined : String(raw.createdAt),
    downloadUrl: String(raw.downloadUrl ?? "")
  };
};

const parseSchedule = (value: unknown): ScheduleJobMeta => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    templateId: String(raw.templateId ?? ""),
    name: String(raw.name ?? ""),
    enabled: Boolean(raw.enabled),
    cronExpr: String(raw.cronExpr ?? ""),
    timezone: String(raw.timezone ?? "Asia/Shanghai"),
    outputType: String(raw.outputType ?? "dashboard_snapshot_json") as ScheduleJobMeta["outputType"],
    variables: ensureObject(raw.variables),
    retentionDays: Number(raw.retentionDays ?? 30),
    lastTriggeredAt: raw.lastTriggeredAt === undefined || raw.lastTriggeredAt === null ? undefined : String(raw.lastTriggeredAt),
    nextTriggeredAt: raw.nextTriggeredAt === undefined || raw.nextTriggeredAt === null ? undefined : String(raw.nextTriggeredAt),
    createdAt: raw.createdAt === undefined ? undefined : String(raw.createdAt),
    updatedAt: raw.updatedAt === undefined ? undefined : String(raw.updatedAt)
  };
};

const parseRun = (value: unknown): ScheduleRun => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    triggerType: String(raw.triggerType ?? ""),
    templateId: String(raw.templateId ?? ""),
    scheduleJobId: raw.scheduleJobId === undefined || raw.scheduleJobId === null ? undefined : String(raw.scheduleJobId),
    templateRevisionNo: Number(raw.templateRevisionNo ?? 0),
    outputType: String(raw.outputType ?? "dashboard_snapshot_json") as ScheduleRun["outputType"],
    status: String(raw.status ?? "queued") as ScheduleRun["status"],
    variables: ensureObject(raw.variables),
    startedAt: raw.startedAt === undefined || raw.startedAt === null ? undefined : String(raw.startedAt),
    finishedAt: raw.finishedAt === undefined || raw.finishedAt === null ? undefined : String(raw.finishedAt),
    errorMessage: raw.errorMessage === undefined || raw.errorMessage === null ? undefined : String(raw.errorMessage),
    createdAt: raw.createdAt === undefined || raw.createdAt === null ? undefined : String(raw.createdAt),
    artifacts: Array.isArray(raw.artifacts) ? raw.artifacts.map(parseArtifact) : []
  };
};

const parseRunNowResult = (value: unknown): ScheduleRunNowResult => {
  const raw = ensureObject(value);
  return {
    runId: String(raw.runId ?? ""),
    status: String(raw.status ?? "queued")
  };
};

export class HttpScheduleRepository implements ScheduleRepository {
  constructor(private readonly baseUrl = "/api/v1") {}

  async listSchedules(templateId: string): Promise<ScheduleJobMeta[]> {
    const query = new URLSearchParams({ templateId });
    const payload = await this.requestJson(`${this.baseUrl}/schedules?${query.toString()}`, { method: "GET" });
    return Array.isArray(payload) ? payload.map(parseSchedule) : [];
  }

  async getSchedule(scheduleId: string): Promise<ScheduleJobMeta> {
    return parseSchedule(await this.requestJson(`${this.baseUrl}/schedules/${encodeURIComponent(scheduleId)}`, { method: "GET" }));
  }

  async createSchedule(input: UpsertScheduleInput): Promise<ScheduleJobMeta> {
    return parseSchedule(
      await this.requestJson(`${this.baseUrl}/schedules`, {
        method: "POST",
        body: JSON.stringify(input)
      })
    );
  }

  async updateSchedule(scheduleId: string, input: UpsertScheduleInput): Promise<ScheduleJobMeta> {
    return parseSchedule(
      await this.requestJson(`${this.baseUrl}/schedules/${encodeURIComponent(scheduleId)}`, {
        method: "PUT",
        body: JSON.stringify(input)
      })
    );
  }

  async runNow(scheduleId: string): Promise<ScheduleRunNowResult> {
    return parseRunNowResult(
      await this.requestJson(`${this.baseUrl}/schedules/${encodeURIComponent(scheduleId)}/run-now`, {
        method: "POST"
      })
    );
  }

  async listRuns(scheduleId: string, limit = 20): Promise<ScheduleRun[]> {
    const query = new URLSearchParams({ limit: String(limit) });
    const payload = await this.requestJson(`${this.baseUrl}/schedules/${encodeURIComponent(scheduleId)}/runs?${query.toString()}`, { method: "GET" });
    return Array.isArray(payload) ? payload.map(parseRun) : [];
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
