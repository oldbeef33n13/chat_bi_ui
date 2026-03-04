import type { DocType, VDoc } from "../../core/doc/types";

export type EditorDocType = Extract<DocType, "dashboard" | "report" | "ppt">;
export type WorkspaceStatus = "published" | "draft";
export type DocDataSource = "api" | "local";

export interface DocMeta {
  id: string;
  docType: EditorDocType;
  name: string;
  description: string;
  tags: string[];
  updatedAt: string;
  status: WorkspaceStatus;
  canEdit?: boolean;
  canPublish?: boolean;
  revisions?: {
    published?: number;
    draft?: number;
  };
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

export interface PublishResult {
  meta: DocMeta;
  published: DocContent;
  draft: DocContent;
}

export interface ListDocsParams {
  type?: EditorDocType | "all";
  status?: WorkspaceStatus | "all";
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateDocInput {
  docType: EditorDocType;
  title?: string;
  seedTemplateId?: string;
}

export interface SaveDraftInput {
  doc: VDoc;
  baseRevision?: number | null;
}

export interface PublishDraftInput {
  fromDraftRevision?: number | null;
}

export interface DocRepository {
  source: DocDataSource;
  listDocs(params?: ListDocsParams): Promise<DocPage>;
  getDocMeta(docId: string): Promise<DocMeta>;
  getPublishedDoc(docId: string): Promise<DocContent>;
  getDraftDoc(docId: string): Promise<DocContent>;
  createDoc(input: CreateDocInput): Promise<{ meta: DocMeta; draft: DocContent; published: DocContent }>;
  saveDraft(docId: string, input: SaveDraftInput): Promise<{ meta: DocMeta; draft: DocContent }>;
  publishDraft(docId: string, input?: PublishDraftInput): Promise<PublishResult>;
  discardDraft(docId: string): Promise<{ meta: DocMeta; draft: DocContent }>;
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
