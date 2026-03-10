import type { DocType, VDoc } from "../../core/doc/types";

export type EditorDocType = Extract<DocType, "dashboard" | "report" | "ppt">;
export type DocDataSource = "api";

export interface DocMeta {
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

export interface DocPage {
  items: DocMeta[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DocContent {
  doc: VDoc;
  revision: number;
}

export interface DocRevision {
  revision: number;
  createdAt: string;
  createdBy: string;
  current: boolean;
}

export interface DocSeedTemplate {
  id: string;
  docType: EditorDocType;
  name: string;
  description: string;
  tags: string[];
}

export interface DocDocument {
  meta: DocMeta;
  content: DocContent;
}

export interface ListDocsParams {
  type?: EditorDocType | "all";
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateDocInput {
  docType: EditorDocType;
  title?: string;
  seedTemplateId?: string;
  dashboardPreset?: "wallboard" | "workbench";
}

export interface PublishDocInput {
  doc: VDoc;
  baseRevision?: number | null;
}

export interface DocRepository {
  source: DocDataSource;
  listDocs(params?: ListDocsParams): Promise<DocPage>;
  getDocMeta(docId: string): Promise<DocMeta>;
  getDocContent(docId: string): Promise<DocContent>;
  listDocRevisions(docId: string): Promise<DocRevision[]>;
  restoreDocRevision(docId: string, revision: number): Promise<DocDocument>;
  listSeedTemplates(): Promise<DocSeedTemplate[]>;
  createDoc(input: CreateDocInput): Promise<DocDocument>;
  publishDoc(docId: string, input: PublishDocInput): Promise<DocDocument>;
}

export class DocApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "DocApiError";
  }
}

export const isEditorDocType = (value: string): value is EditorDocType =>
  value === "dashboard" || value === "report" || value === "ppt";
