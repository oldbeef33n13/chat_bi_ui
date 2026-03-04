import { createBuiltInDoc, listBuiltInDocExamples, resolveDocExampleId } from "../../core/doc/examples";
import type { VDoc } from "../../core/doc/types";
import {
  DocApiError,
  type CreateDocInput,
  type DocContent,
  type DocMeta,
  type DocPage,
  type DocRepository,
  type EditorDocType,
  type ListDocsParams,
  type PublishDraftInput,
  type PublishResult,
  type SaveDraftInput
} from "./doc-repository";

/** 本地仓储内部记录结构：一份 meta + published + draft。 */
interface LocalDocRecord {
  meta: DocMeta;
  published: DocContent;
  draft: DocContent;
}

const cloneDoc = (doc: VDoc): VDoc => structuredClone(doc);
const nowIso = (): string => new Date().toISOString();

/** 简单全文检索（名称/描述/标签）。 */
const includesText = (meta: DocMeta, q?: string): boolean => {
  if (!q) {
    return true;
  }
  const key = q.trim().toLowerCase();
  if (!key) {
    return true;
  }
  const haystack = `${meta.name} ${meta.description} ${meta.tags.join(" ")}`.toLowerCase();
  return haystack.includes(key);
};

/** 基于内置样例生成本地 seed 数据，便于离线和开发态兜底。 */
const makeSeedRecord = (docType: EditorDocType): LocalDocRecord[] => {
  return listBuiltInDocExamples(docType).map((example) => {
    const doc = example.build();
    return {
      meta: {
        id: doc.docId,
        docType,
        name: doc.title ?? example.name,
        description: example.description,
        tags: [docType, "内置样例"],
        updatedAt: nowIso(),
        status: "published",
        canEdit: true,
        canPublish: true,
        revisions: { published: 1, draft: 1 }
      },
      published: { doc: cloneDoc(doc), revision: 1 },
      draft: { doc: cloneDoc(doc), revision: 1 }
    };
  });
};

/**
 * 本地仓储实现：用于 API 不可用时的降级、开发演示与单元测试。
 * 注意：它同样实现 revision 冲突逻辑，保证行为尽量贴近真实后端。
 */
export class LocalDocRepository implements DocRepository {
  readonly source = "local" as const;
  private readonly records = new Map<string, LocalDocRecord>();

  constructor(seed: LocalDocRecord[] = [...makeSeedRecord("dashboard"), ...makeSeedRecord("report"), ...makeSeedRecord("ppt")]) {
    seed.forEach((item) => this.records.set(item.meta.id, item));
  }

  async listDocs(params: ListDocsParams = {}): Promise<DocPage> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, params.pageSize ?? 20);
    const typeFilter = params.type ?? "all";
    const statusFilter = params.status ?? "all";
    const all = [...this.records.values()]
      .map((item) => item.meta)
      .filter((meta) => (typeFilter === "all" ? true : meta.docType === typeFilter))
      .filter((meta) => (statusFilter === "all" ? true : meta.status === statusFilter))
      .filter((meta) => includesText(meta, params.q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);
    return { items, total: all.length, page, pageSize };
  }

  async getDocMeta(docId: string): Promise<DocMeta> {
    const record = this.records.get(docId);
    if (!record) {
      throw new DocApiError("文档不存在", 404);
    }
    return structuredClone(record.meta);
  }

  async getPublishedDoc(docId: string): Promise<DocContent> {
    const record = this.records.get(docId);
    if (!record) {
      throw new DocApiError("文档不存在", 404);
    }
    return {
      doc: cloneDoc(record.published.doc),
      revision: record.published.revision
    };
  }

  async getDraftDoc(docId: string): Promise<DocContent> {
    const record = this.records.get(docId);
    if (!record) {
      throw new DocApiError("文档不存在", 404);
    }
    return {
      doc: cloneDoc(record.draft.doc),
      revision: record.draft.revision
    };
  }

  async createDoc(input: CreateDocInput): Promise<{ meta: DocMeta; draft: DocContent; published: DocContent }> {
    const exampleId = input.seedTemplateId ?? resolveDocExampleId(input.docType);
    const base = createBuiltInDoc(input.docType, exampleId);
    if (input.title && input.title.trim()) {
      base.title = input.title.trim();
    }
    const revision = 1;
    const meta: DocMeta = {
      id: base.docId,
      docType: input.docType,
      name: base.title ?? `${input.docType} 新文档`,
      description: "新建文档",
      tags: [input.docType, "新建"],
      updatedAt: nowIso(),
      status: "draft",
      canEdit: true,
      canPublish: true,
      revisions: { published: revision, draft: revision }
    };
    const record: LocalDocRecord = {
      meta,
      published: { doc: cloneDoc(base), revision },
      draft: { doc: cloneDoc(base), revision }
    };
    this.records.set(meta.id, record);
    return {
      meta: structuredClone(meta),
      draft: { doc: cloneDoc(record.draft.doc), revision: record.draft.revision },
      published: { doc: cloneDoc(record.published.doc), revision: record.published.revision }
    };
  }

  async saveDraft(docId: string, input: SaveDraftInput): Promise<{ meta: DocMeta; draft: DocContent }> {
    const record = this.requireRecord(docId);
    // 并发保护：baseRevision 不一致直接返回 409，避免静默覆盖。
    if (input.baseRevision !== undefined && input.baseRevision !== null && input.baseRevision !== record.draft.revision) {
      throw new DocApiError("草稿已被更新，请刷新后重试", 409, {
        expected: record.draft.revision,
        actual: input.baseRevision
      });
    }
    const nextRevision = record.draft.revision + 1;
    record.draft = {
      doc: cloneDoc(input.doc),
      revision: nextRevision
    };
    record.meta = {
      ...record.meta,
      name: input.doc.title ?? record.meta.name,
      status: "draft",
      updatedAt: nowIso(),
      revisions: {
        ...(record.meta.revisions ?? {}),
        draft: nextRevision,
        published: record.published.revision
      }
    };
    this.records.set(docId, record);
    return {
      meta: structuredClone(record.meta),
      draft: { doc: cloneDoc(record.draft.doc), revision: record.draft.revision }
    };
  }

  async publishDraft(docId: string, input: PublishDraftInput = {}): Promise<PublishResult> {
    const record = this.requireRecord(docId);
    // 发布也需要校验草稿版本，保证“所见即所发”。
    if (
      input.fromDraftRevision !== undefined &&
      input.fromDraftRevision !== null &&
      input.fromDraftRevision !== record.draft.revision
    ) {
      throw new DocApiError("发布失败，草稿版本已变化", 409, {
        expected: record.draft.revision,
        actual: input.fromDraftRevision
      });
    }
    const nextRevision = record.published.revision + 1;
    record.published = {
      doc: cloneDoc(record.draft.doc),
      revision: nextRevision
    };
    record.draft = {
      doc: cloneDoc(record.published.doc),
      revision: nextRevision
    };
    record.meta = {
      ...record.meta,
      name: record.published.doc.title ?? record.meta.name,
      status: "published",
      updatedAt: nowIso(),
      revisions: {
        ...(record.meta.revisions ?? {}),
        draft: record.draft.revision,
        published: record.published.revision
      }
    };
    this.records.set(docId, record);
    return {
      meta: structuredClone(record.meta),
      published: { doc: cloneDoc(record.published.doc), revision: record.published.revision },
      draft: { doc: cloneDoc(record.draft.doc), revision: record.draft.revision }
    };
  }

  async discardDraft(docId: string): Promise<{ meta: DocMeta; draft: DocContent }> {
    const record = this.requireRecord(docId);
    // 放弃草稿时直接回退到发布版快照。
    record.draft = {
      doc: cloneDoc(record.published.doc),
      revision: record.published.revision
    };
    record.meta = {
      ...record.meta,
      status: "published",
      updatedAt: nowIso(),
      revisions: {
        ...(record.meta.revisions ?? {}),
        draft: record.draft.revision,
        published: record.published.revision
      }
    };
    this.records.set(docId, record);
    return {
      meta: structuredClone(record.meta),
      draft: { doc: cloneDoc(record.draft.doc), revision: record.draft.revision }
    };
  }

  private requireRecord(docId: string): LocalDocRecord {
    const record = this.records.get(docId);
    if (!record) {
      throw new DocApiError("文档不存在", 404);
    }
    return record;
  }
}

/** 工厂函数：避免上层直接依赖类实现。 */
export const createLocalDocRepository = (): LocalDocRepository => new LocalDocRepository();
