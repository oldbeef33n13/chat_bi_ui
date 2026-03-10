import type { VDoc } from "../../core/doc/types";
import {
  DocApiError,
  type CreateDocInput,
  type DocContent,
  type DocDocument,
  type DocMeta,
  type DocPage,
  type DocRepository,
  type DocRevision,
  type DocSeedTemplate,
  type ListDocsParams,
  type PublishDocInput
} from "./doc-repository";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const parseDocMeta = (value: unknown): DocMeta => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    docType: String(raw.docType ?? raw.templateType ?? "dashboard") as DocMeta["docType"],
    name: String(raw.name ?? raw.title ?? ""),
    description: String(raw.description ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item)) : [],
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    currentRevision: Number(raw.currentRevision ?? 0),
    canEdit: raw.canEdit === undefined ? true : Boolean(raw.canEdit),
    canPublish: raw.canPublish === undefined ? true : Boolean(raw.canPublish)
  };
};

const parseSeedTemplate = (value: unknown): DocSeedTemplate => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    docType: String(raw.docType ?? raw.templateType ?? "dashboard") as DocSeedTemplate["docType"],
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item)) : []
  };
};

const parseDocContent = (value: unknown): DocContent => {
  const raw = ensureObject(value);
  const doc = (raw.doc ?? raw.dsl) as VDoc | undefined;
  if (!doc || typeof doc !== "object") {
    throw new DocApiError("响应缺少 dsl/doc 字段", 500, value);
  }
  return {
    doc,
    revision: Number(raw.revision ?? 0)
  };
};

const parseDocDocument = (value: unknown): DocDocument => {
  const raw = ensureObject(value);
  return {
    meta: parseDocMeta(raw.meta),
    content: parseDocContent(raw.content)
  };
};

const parseDocRevision = (value: unknown): DocRevision => {
  const raw = ensureObject(value);
  return {
    revision: Number(raw.revision ?? 0),
    createdAt: String(raw.createdAt ?? ""),
    createdBy: String(raw.createdBy ?? "system"),
    current: Boolean(raw.current)
  };
};

export class HttpDocRepository implements DocRepository {
  readonly source = "api" as const;

  constructor(private readonly baseUrl = "/api/v1") {}

  async listDocs(params: ListDocsParams = {}): Promise<DocPage> {
    const query = new URLSearchParams();
    if (params.type && params.type !== "all") {
      query.set("type", params.type);
    }
    if (params.q) {
      query.set("q", params.q);
    }
    query.set("page", String(params.page ?? 1));
    query.set("pageSize", String(params.pageSize ?? 20));
    const payload = await this.requestJson(`${this.baseUrl}/templates?${query.toString()}`, { method: "GET" });
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
    return parseDocMeta(await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(docId)}`, { method: "GET" }));
  }

  async getDocContent(docId: string): Promise<DocContent> {
    return parseDocContent(await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(docId)}/content`, { method: "GET" }));
  }

  async listDocRevisions(docId: string): Promise<DocRevision[]> {
    const payload = await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(docId)}/revisions`, { method: "GET" });
    return Array.isArray(payload) ? payload.map(parseDocRevision) : [];
  }

  async restoreDocRevision(docId: string, revision: number): Promise<DocDocument> {
    return parseDocDocument(
      await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(docId)}/restore/${revision}`, { method: "POST" })
    );
  }

  async listSeedTemplates(): Promise<DocSeedTemplate[]> {
    const payload = await this.requestJson(`${this.baseUrl}/templates/seeds`, { method: "GET" });
    const raw = ensureObject(payload);
    return Array.isArray(raw.items) ? raw.items.map(parseSeedTemplate) : [];
  }

  async createDoc(input: CreateDocInput): Promise<DocDocument> {
    return parseDocDocument(
      await this.requestJson(`${this.baseUrl}/templates`, {
        method: "POST",
        body: JSON.stringify({
          templateType: input.docType,
          name: input.title,
          seedTemplateId: input.seedTemplateId,
          dashboardPreset: input.dashboardPreset
        })
      })
    );
  }

  async publishDoc(docId: string, input: PublishDocInput): Promise<DocDocument> {
    return parseDocDocument(
      await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(docId)}/publish`, {
        method: "POST",
        body: JSON.stringify({
          dsl: input.doc,
          baseRevision: input.baseRevision
        })
      })
    );
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
