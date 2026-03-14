import type { TemplateVariableDef, VDoc } from "../../core/doc/types";
import type { EditorDocType } from "./template-repository";

export type TemplateExportOutput = "dashboard_snapshot_json" | "report_docx" | "ppt_pptx";
export type TemplateRunStatus = "queued" | "running" | "succeeded" | "failed";

export interface TemplatePreviewResult {
  templateId: string;
  revision: number;
  snapshot: VDoc;
  resolvedVariables: Record<string, unknown>;
}

export interface TemplateArtifact {
  id: string;
  artifactType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt?: string;
  downloadUrl: string;
}

export interface TemplateRun {
  id: string;
  triggerType: string;
  templateId: string;
  scheduleJobId?: string;
  templateRevisionNo: number;
  outputType: TemplateExportOutput;
  status: TemplateRunStatus;
  variables: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  errorMessage?: string;
  createdAt?: string;
  artifacts: TemplateArtifact[];
}

export interface CreateTemplateExportInput {
  outputType: TemplateExportOutput;
  variables?: Record<string, unknown>;
}

export interface TemplateExportAccepted {
  runId: string;
  status: TemplateRunStatus | string;
}

export interface TemplateRuntimeRepository {
  previewTemplate(templateId: string, variables?: Record<string, unknown>, doc?: VDoc): Promise<TemplatePreviewResult>;
  exportTemplate(templateId: string, input: CreateTemplateExportInput): Promise<TemplateExportAccepted>;
  getRun(runId: string): Promise<TemplateRun>;
}

export const templateOutputByDocType: Record<EditorDocType, TemplateExportOutput> = {
  dashboard: "dashboard_snapshot_json",
  report: "report_docx",
  ppt: "ppt_pptx"
};

export type TemplateVariablePanelState = {
  defs: TemplateVariableDef[];
  values: Record<string, unknown>;
};
