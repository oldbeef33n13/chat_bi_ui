import type { DocType, VDoc } from "../../core/doc/types";

/**
 * 编辑器侧可操作的文档类型（与后端接口约定保持一致）。
 * 说明：当前前端只暴露 dashboard/report/ppt 三种业务文档。
 */
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
  /** 列表查询：支持类型、状态、关键词、分页。 */
  listDocs(params?: ListDocsParams): Promise<DocPage>;
  /** 查询文档元信息（权限、状态、更新时间、版本号等）。 */
  getDocMeta(docId: string): Promise<DocMeta>;
  /** 读取已发布版本。 */
  getPublishedDoc(docId: string): Promise<DocContent>;
  /** 读取草稿版本。 */
  getDraftDoc(docId: string): Promise<DocContent>;
  /** 新建文档，返回 meta + 初始 draft/published。 */
  createDoc(input: CreateDocInput): Promise<{ meta: DocMeta; draft: DocContent; published: DocContent }>;
  /** 保存草稿，支持基于 revision 的并发保护。 */
  saveDraft(docId: string, input: SaveDraftInput): Promise<{ meta: DocMeta; draft: DocContent }>;
  /** 发布草稿到正式版本。 */
  publishDraft(docId: string, input?: PublishDraftInput): Promise<PublishResult>;
  /** 放弃草稿并回退到发布版。 */
  discardDraft(docId: string): Promise<{ meta: DocMeta; draft: DocContent }>;
}

/** 统一 API 层错误对象，便于上层按 status 做差异化提示（如 409 冲突）。 */
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

/** 路由参数/查询参数防御性判断。 */
export const isEditorDocType = (value: string): value is EditorDocType =>
  value === "dashboard" || value === "report" || value === "ppt";
