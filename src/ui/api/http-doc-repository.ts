import type { VDoc } from "../../core/doc/types";
import {
  DocApiError,
  type CreateDocInput,
  type DocContent,
  type DocMeta,
  type DocPage,
  type DocRepository,
  type ListDocsParams,
  type PublishDraftInput,
  type PublishResult,
  type SaveDraftInput
} from "./doc-repository";

/** 保证解析阶段始终拿到对象，避免后续属性读取抛异常。 */
const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

/** 统一把后端响应映射为前端稳定的 DocMeta 结构。 */
const parseDocMeta = (value: unknown): DocMeta => {
  const raw = ensureObject(value);
  const revisionsRaw = ensureObject(raw.revisions);
  return {
    id: String(raw.id ?? ""),
    docType: String(raw.docType ?? "dashboard") as DocMeta["docType"],
    name: String(raw.name ?? raw.title ?? ""),
    description: String(raw.description ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item)) : [],
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    status: String(raw.status ?? "published") as DocMeta["status"],
    canEdit: raw.canEdit === undefined ? true : Boolean(raw.canEdit),
    canPublish: raw.canPublish === undefined ? true : Boolean(raw.canPublish),
    revisions: {
      published: revisionsRaw.published === undefined ? undefined : Number(revisionsRaw.published),
      draft: revisionsRaw.draft === undefined ? undefined : Number(revisionsRaw.draft)
    }
  };
};

/** 统一解析文档内容；doc 缺失时视为协议错误。 */
const parseDocContent = (value: unknown): DocContent => {
  const raw = ensureObject(value);
  const doc = raw.doc as VDoc | undefined;
  if (!doc || typeof doc !== "object") {
    throw new DocApiError("响应缺少 doc 字段", 500, value);
  }
  return {
    doc,
    revision: Number(raw.revision ?? 0)
  };
};

/**
 * 真实后端仓储实现：负责 HTTP 请求、协议解析与错误标准化。
 * 设计目标：让上层 UI 只面向 DocRepository，不关心 transport 细节。
 */
export class HttpDocRepository implements DocRepository {
  readonly source = "api" as const;

  constructor(private readonly baseUrl = "/api/v1") {}

  async listDocs(params: ListDocsParams = {}): Promise<DocPage> {
    const query = new URLSearchParams();
    if (params.type && params.type !== "all") {
      query.set("type", params.type);
    }
    if (params.status && params.status !== "all") {
      query.set("status", params.status);
    }
    if (params.q) {
      query.set("q", params.q);
    }
    query.set("page", String(params.page ?? 1));
    query.set("pageSize", String(params.pageSize ?? 20));
    const payload = await this.requestJson(`${this.baseUrl}/docs?${query.toString()}`, { method: "GET" });
    const raw = ensureObject(payload);
    const items = Array.isArray(raw.items) ? raw.items.map(parseDocMeta) : [];
    return {
      items,
      total: Number(raw.total ?? items.length),
      page: Number(raw.page ?? params.page ?? 1),
      pageSize: Number(raw.pageSize ?? params.pageSize ?? 20)
    };
  }

  async getDocMeta(docId: string): Promise<DocMeta> {
    const payload = await this.requestJson(`${this.baseUrl}/docs/${encodeURIComponent(docId)}`, { method: "GET" });
    return parseDocMeta(payload);
  }

  async getPublishedDoc(docId: string): Promise<DocContent> {
    const payload = await this.requestJson(`${this.baseUrl}/docs/${encodeURIComponent(docId)}/published`, { method: "GET" });
    return parseDocContent(payload);
  }

  async getDraftDoc(docId: string): Promise<DocContent> {
    const payload = await this.requestJson(`${this.baseUrl}/docs/${encodeURIComponent(docId)}/draft`, { method: "GET" });
    return parseDocContent(payload);
  }

  async createDoc(input: CreateDocInput): Promise<{ meta: DocMeta; draft: DocContent; published: DocContent }> {
    const payload = await this.requestJson(`${this.baseUrl}/docs`, {
      method: "POST",
      body: JSON.stringify(input)
    });
    const raw = ensureObject(payload);
    return {
      meta: parseDocMeta(raw.meta),
      draft: parseDocContent(raw.draft),
      published: parseDocContent(raw.published)
    };
  }

  async saveDraft(docId: string, input: SaveDraftInput): Promise<{ meta: DocMeta; draft: DocContent }> {
    const payload = await this.requestJson(`${this.baseUrl}/docs/${encodeURIComponent(docId)}/draft`, {
      method: "PUT",
      body: JSON.stringify({
        doc: input.doc,
        baseRevision: input.baseRevision
      })
    });
    const raw = ensureObject(payload);
    return {
      meta: parseDocMeta(raw.meta),
      draft: parseDocContent(raw.draft)
    };
  }

  async publishDraft(docId: string, input: PublishDraftInput = {}): Promise<PublishResult> {
    const payload = await this.requestJson(`${this.baseUrl}/docs/${encodeURIComponent(docId)}/publish`, {
      method: "POST",
      body: JSON.stringify({
        fromDraftRevision: input.fromDraftRevision
      })
    });
    const raw = ensureObject(payload);
    return {
      meta: parseDocMeta(raw.meta),
      published: parseDocContent(raw.published),
      draft: parseDocContent(raw.draft)
    };
  }

  async discardDraft(docId: string): Promise<{ meta: DocMeta; draft: DocContent }> {
    const payload = await this.requestJson(`${this.baseUrl}/docs/${encodeURIComponent(docId)}/discard-draft`, {
      method: "POST"
    });
    const raw = ensureObject(payload);
    return {
      meta: parseDocMeta(raw.meta),
      draft: parseDocContent(raw.draft)
    };
  }

  private async requestJson(url: string, init: RequestInit): Promise<unknown> {
    // 全部请求默认 JSON；外部可通过 init.headers 局部覆盖。
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
      // 允许空响应体，错误时用 HTTP 状态码兜底。
      payload = null;
    }
    if (!response.ok) {
      const message = ensureObject(payload).message ? String(ensureObject(payload).message) : `HTTP ${response.status}`;
      throw new DocApiError(message, response.status, payload);
    }
    return payload;
  }
}
