export type ScheduleOutputType = "dashboard_snapshot_json" | "report_docx" | "ppt_pptx";
export type ScheduleRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface ScheduleJobMeta {
  id: string;
  templateId: string;
  name: string;
  enabled: boolean;
  cronExpr: string;
  timezone: string;
  outputType: ScheduleOutputType;
  variables: Record<string, unknown>;
  retentionDays: number;
  lastTriggeredAt?: string;
  nextTriggeredAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ScheduleArtifact {
  id: string;
  artifactType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt?: string;
  downloadUrl: string;
}

export interface ScheduleRun {
  id: string;
  triggerType: string;
  templateId: string;
  scheduleJobId?: string;
  templateRevisionNo: number;
  outputType: ScheduleOutputType;
  status: ScheduleRunStatus;
  variables: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  createdAt?: string;
  artifacts: ScheduleArtifact[];
}

export interface UpsertScheduleInput {
  templateId: string;
  name: string;
  enabled: boolean;
  cronExpr: string;
  timezone?: string;
  outputType: ScheduleOutputType;
  variables?: Record<string, unknown>;
  retentionDays?: number;
}

export interface ScheduleRunNowResult {
  runId: string;
  status: ScheduleRunStatus | string;
}

export interface ScheduleRepository {
  listSchedules(templateId: string): Promise<ScheduleJobMeta[]>;
  getSchedule(scheduleId: string): Promise<ScheduleJobMeta>;
  createSchedule(input: UpsertScheduleInput): Promise<ScheduleJobMeta>;
  updateSchedule(scheduleId: string, input: UpsertScheduleInput): Promise<ScheduleJobMeta>;
  runNow(scheduleId: string): Promise<ScheduleRunNowResult>;
  listRuns(scheduleId: string, limit?: number): Promise<ScheduleRun[]>;
}
