import type { VDoc } from "../../core/doc/types";
import {
  TemplateApiError,
  type CreateTemplateInput,
  type ListTemplatesParams,
  type PublishTemplateInput,
  type TemplateContent,
  type TemplateDocument,
  type TemplateMeta,
  type TemplatePage,
  type TemplateRepository,
  type TemplateRevision,
  type TemplateSeed
} from "./template-repository";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const parseTemplateMeta = (value: unknown): TemplateMeta => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    docType: String(raw.docType ?? raw.templateType ?? "dashboard") as TemplateMeta["docType"],
    name: String(raw.name ?? raw.title ?? ""),
    description: String(raw.description ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item)) : [],
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
    currentRevision: Number(raw.currentRevision ?? 0),
    canEdit: raw.canEdit === undefined ? true : Boolean(raw.canEdit),
    canPublish: raw.canPublish === undefined ? true : Boolean(raw.canPublish)
  };
};

const parseSeedTemplate = (value: unknown): TemplateSeed => {
  const raw = ensureObject(value);
  return {
    id: String(raw.id ?? ""),
    docType: String(raw.docType ?? raw.templateType ?? "dashboard") as TemplateSeed["docType"],
    name: String(raw.name ?? ""),
    description: String(raw.description ?? ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item)) : []
  };
};

const parseTemplateContent = (value: unknown): TemplateContent => {
  const raw = ensureObject(value);
  const doc = (raw.doc ?? raw.dsl) as VDoc | undefined;
  if (!doc || typeof doc !== "object") {
    throw new TemplateApiError("响应缺少 dsl/doc 字段", 500, value);
  }
  return {
    doc,
    revision: Number(raw.revision ?? 0)
  };
};

const parseTemplateDocument = (value: unknown): TemplateDocument => {
  const raw = ensureObject(value);
  return {
    meta: parseTemplateMeta(raw.meta),
    content: parseTemplateContent(raw.content)
  };
};

const parseTemplateRevision = (value: unknown): TemplateRevision => {
  const raw = ensureObject(value);
  return {
    revision: Number(raw.revision ?? 0),
    createdAt: String(raw.createdAt ?? ""),
    createdBy: String(raw.createdBy ?? "system"),
    current: Boolean(raw.current)
  };
};

export class HttpTemplateRepository implements TemplateRepository {
  readonly source = "api" as const;

  constructor(private readonly baseUrl = "/api/v1") {}

  async listTemplates(params: ListTemplatesParams = {}): Promise<TemplatePage> {
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
    const items = Array.isArray(raw.items) ? raw.items.map(parseTemplateMeta) : [];
    return {
      items,
      total: Number(raw.total ?? items.length),
      page: Number(raw.page ?? params.page ?? 1),
      pageSize: Number(raw.pageSize ?? params.pageSize ?? 20)
    };
  }

  async getTemplateMeta(templateId: string): Promise<TemplateMeta> {
    return parseTemplateMeta(await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}`, { method: "GET" }));
  }

  async getTemplateContent(templateId: string): Promise<TemplateContent> {
    return parseTemplateContent(await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}/content`, { method: "GET" }));
  }

  async listTemplateRevisions(templateId: string): Promise<TemplateRevision[]> {
    const payload = await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}/revisions`, { method: "GET" });
    return Array.isArray(payload) ? payload.map(parseTemplateRevision) : [];
  }

  async restoreTemplateRevision(templateId: string, revision: number): Promise<TemplateDocument> {
    return parseTemplateDocument(
      await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}/restore/${revision}`, { method: "POST" })
    );
  }

  async listSeedTemplates(): Promise<TemplateSeed[]> {
    const payload = await this.requestJson(`${this.baseUrl}/templates/seeds`, { method: "GET" });
    const raw = ensureObject(payload);
    return Array.isArray(raw.items) ? raw.items.map(parseSeedTemplate) : [];
  }

  async createTemplate(input: CreateTemplateInput): Promise<TemplateDocument> {
    return parseTemplateDocument(
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

  async publishTemplate(templateId: string, input: PublishTemplateInput): Promise<TemplateDocument> {
    return parseTemplateDocument(
      await this.requestJson(`${this.baseUrl}/templates/${encodeURIComponent(templateId)}/publish`, {
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
      throw new TemplateApiError(message, response.status, payload);
    }
    return payload;
  }
}
