import type { DocType, VDoc } from "../../core/doc/types";

export type EditorDocType = Extract<DocType, "dashboard" | "report" | "ppt">;
export type TemplateDataSource = "api";

export interface TemplateMeta {
  id: string;
  docType: EditorDocType;
  name: string;
  description: string;
  tags: string[];
  updatedAt: string;
  currentRevision: number;
  canEdit?: boolean;
  canPublish?: boolean;
}

export interface TemplatePage {
  items: TemplateMeta[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TemplateContent {
  doc: VDoc;
  revision: number;
}

export interface TemplateRevision {
  revision: number;
  createdAt: string;
  createdBy: string;
  current: boolean;
}

export interface TemplateSeed {
  id: string;
  docType: EditorDocType;
  name: string;
  description: string;
  tags: string[];
}

export interface TemplateDocument {
  meta: TemplateMeta;
  content: TemplateContent;
}

export interface ListTemplatesParams {
  type?: EditorDocType | "all";
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateTemplateInput {
  docType: EditorDocType;
  title?: string;
  seedTemplateId?: string;
  dashboardPreset?: "wallboard" | "workbench";
}

export interface PublishTemplateInput {
  doc: VDoc;
  baseRevision?: number | null;
}

export interface TemplateRepository {
  source: TemplateDataSource;
  listTemplates(params?: ListTemplatesParams): Promise<TemplatePage>;
  getTemplateMeta(templateId: string): Promise<TemplateMeta>;
  getTemplateContent(templateId: string): Promise<TemplateContent>;
  listTemplateRevisions(templateId: string): Promise<TemplateRevision[]>;
  restoreTemplateRevision(templateId: string, revision: number): Promise<TemplateDocument>;
  listSeedTemplates(): Promise<TemplateSeed[]>;
  createTemplate(input: CreateTemplateInput): Promise<TemplateDocument>;
  publishTemplate(templateId: string, input: PublishTemplateInput): Promise<TemplateDocument>;
}

export class TemplateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "TemplateApiError";
  }
}

export const isEditorDocType = (value: string): value is EditorDocType =>
  value === "dashboard" || value === "report" || value === "ppt";
