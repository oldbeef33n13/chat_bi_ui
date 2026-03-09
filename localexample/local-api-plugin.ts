import fs from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { createBuiltInDoc, resolveDocExampleId } from "../src/core/doc/examples";
import type { VDoc } from "../src/core/doc/types";
import { prefixedId } from "../src/core/utils/id";

type EditorDocType = "dashboard" | "report" | "ppt";
type WorkspaceStatus = "published" | "draft";

interface DocMeta {
  id: string;
  docType: EditorDocType;
  name: string;
  description: string;
  tags: string[];
  updatedAt: string;
  status: WorkspaceStatus;
  canEdit: boolean;
  canPublish: boolean;
  revisions: {
    published: number;
    draft: number;
  };
}

interface DocContent {
  doc: VDoc;
  revision: number;
}

interface LocalDocRecord {
  meta: DocMeta;
  published: DocContent;
  draft: DocContent;
}

interface LocalDocDbState {
  version: number;
  updatedAt: string;
  records: LocalDocRecord[];
}

interface SeedDocEntry {
  id?: string;
  docType: EditorDocType;
  name?: string;
  description?: string;
  tags?: string[];
  status?: WorkspaceStatus;
  templateId?: string;
}

interface SeedFile {
  version?: number;
  seedDocs?: SeedDocEntry[];
}

interface LocalExampleApiPluginOptions {
  enabled?: boolean;
  baseDir?: string;
}

const DEFAULT_SEED_DOCS: SeedDocEntry[] = [
  {
    id: "local-dashboard-noc",
    docType: "dashboard",
    name: "网络运维总览（本地）",
    description: "本地 mock 看板样例：告警趋势与处置效率。",
    tags: ["dashboard", "localexample"],
    status: "published",
    templateId: "dashboard.noc"
  },
  {
    id: "local-dashboard-capacity",
    docType: "dashboard",
    name: "容量与性能看板（本地）",
    description: "本地 mock 看板样例：容量、时延、丢包联动分析。",
    tags: ["dashboard", "localexample"],
    status: "published",
    templateId: "dashboard.capacity"
  },
  {
    id: "local-dashboard-command",
    docType: "dashboard",
    name: "运维指挥中心（本地）",
    description: "本地 mock 看板样例：趋势、占比、散点、日历与工单表格。",
    tags: ["dashboard", "localexample", "rich"],
    status: "published",
    templateId: "dashboard.command.center"
  },
  {
    id: "local-report-monthly",
    docType: "report",
    name: "月度运营报告（本地）",
    description: "本地 mock 报告样例：封面、目录、摘要与图文区块。",
    tags: ["report", "localexample"],
    status: "published",
    templateId: "report.monthly.enterprise"
  },
  {
    id: "local-report-rca",
    docType: "report",
    name: "故障复盘报告（本地）",
    description: "本地 mock 报告样例：时间线、根因和改进闭环。",
    tags: ["report", "localexample"],
    status: "draft",
    templateId: "report.rca"
  },
  {
    id: "local-report-playbook",
    docType: "report",
    name: "运维运营报告（本地）",
    description: "本地 mock 报告样例：图表、明细表、多级表头与透视矩阵。",
    tags: ["report", "localexample", "rich"],
    status: "published",
    templateId: "report.ops.table.playbook"
  },
  {
    id: "local-report-multi-chapter",
    docType: "report",
    name: "运维专题报告（章节多图）（本地）",
    description: "本地 mock 报告样例：单章节内多图表并列分析。",
    tags: ["report", "localexample", "rich", "multichart"],
    status: "published",
    templateId: "report.ops.multi.chapter"
  },
  {
    id: "local-report-subchapter",
    docType: "report",
    name: "运维深度分析（子章节多图）（本地）",
    description: "本地 mock 报告样例：2.1/2.2/2.3 子章节多图编排。",
    tags: ["report", "localexample", "rich", "multichart"],
    status: "published",
    templateId: "report.ops.subchapter.multichart"
  },
  {
    id: "local-ppt-board",
    docType: "ppt",
    name: "季度复盘（本地）",
    description: "本地 mock PPT 样例：封面、图表页、结论页。",
    tags: ["ppt", "localexample"],
    status: "published",
    templateId: "ppt.quarterly.board"
  },
  {
    id: "local-ppt-ops",
    docType: "ppt",
    name: "运营评审（本地）",
    description: "本地 mock PPT 样例：趋势、异常、行动计划。",
    tags: ["ppt", "localexample"],
    status: "draft",
    templateId: "ppt.ops.review"
  },
  {
    id: "local-ppt-story",
    docType: "ppt",
    name: "运维汇报（本地）",
    description: "本地 mock PPT 样例：封面、趋势、图表+表格与行动页。",
    tags: ["ppt", "localexample", "rich"],
    status: "published",
    templateId: "ppt.ops.table.story"
  }
];

const API_PREFIX = "/api/v1";
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" } as const;

const isEditorDocType = (value: unknown): value is EditorDocType =>
  value === "dashboard" || value === "report" || value === "ppt";

const clone = <T>(value: T): T => structuredClone(value);
const nowIso = (): string => new Date().toISOString();

const asNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return undefined;
  }
  return value;
};

const pickString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const toErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  res.statusCode = status;
  Object.entries(JSON_HEADERS).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
};

const decodeDocId = (raw: string): string => decodeURIComponent(raw);

const makeDocPrefix = (docType: EditorDocType): string => {
  if (docType === "dashboard") {
    return "dash";
  }
  if (docType === "report") {
    return "report";
  }
  return "deck";
};

const normalizeSeedDocs = (seedDocs?: SeedDocEntry[]): SeedDocEntry[] => {
  if (!Array.isArray(seedDocs) || seedDocs.length === 0) {
    return DEFAULT_SEED_DOCS;
  }
  return seedDocs.filter((entry) => isEditorDocType(entry?.docType));
};

const normalizeSeedVersion = (value: unknown): number => {
  if (typeof value !== "number" || Number.isNaN(value) || value < 1) {
    return 1;
  }
  return Math.floor(value);
};

const createRecordFromSeed = (seed: SeedDocEntry): LocalDocRecord => {
  const templateId = resolveDocExampleId(seed.docType, seed.templateId);
  const doc = createBuiltInDoc(seed.docType, templateId);
  const explicitId = pickString(seed.id);
  if (explicitId) {
    doc.docId = explicitId;
  }
  const seededName = pickString(seed.name);
  if (seededName) {
    doc.title = seededName;
  }
  const name = seededName ?? doc.title ?? `${seed.docType} 文档`;
  const description = pickString(seed.description) ?? "localexample 默认文档";
  const status: WorkspaceStatus = seed.status === "draft" ? "draft" : "published";
  const revision = 1;
  return {
    meta: {
      id: doc.docId,
      docType: seed.docType,
      name,
      description,
      tags: Array.isArray(seed.tags) && seed.tags.length > 0 ? seed.tags.map((tag) => String(tag)) : [seed.docType, "localexample"],
      updatedAt: nowIso(),
      status,
      canEdit: true,
      canPublish: true,
      revisions: { published: revision, draft: revision }
    },
    published: { doc: clone(doc), revision },
    draft: { doc: clone(doc), revision }
  };
};

const buildSeedState = (seedVersion: number, seeds: SeedDocEntry[]): LocalDocDbState => ({
  version: seedVersion,
  updatedAt: nowIso(),
  records: seeds.map(createRecordFromSeed)
});

const mergeSeededState = (existing: LocalDocDbState, seededState: LocalDocDbState): LocalDocDbState => {
  const seededIds = new Set(seededState.records.map((item) => item.meta.id));
  const preserved = existing.records.filter((item) => !seededIds.has(item.meta.id));
  return {
    version: seededState.version,
    updatedAt: nowIso(),
    records: [...seededState.records, ...preserved]
  };
};

const listFilter = (record: LocalDocRecord, type: string, status: string, q: string): boolean => {
  if (type !== "all" && record.meta.docType !== type) {
    return false;
  }
  if (status !== "all" && record.meta.status !== status) {
    return false;
  }
  if (!q) {
    return true;
  }
  const normalized = q.toLowerCase();
  const haystack = `${record.meta.name} ${record.meta.description} ${record.meta.tags.join(" ")}`.toLowerCase();
  return haystack.includes(normalized);
};

const parseBodyJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve());
    req.on("error", reject);
  });
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    throw new Error("请求体 JSON 解析失败");
  }
};

const parsePath = (
  pathname: string
): { scope: "docs-list" | "docs-item"; docId?: string; action?: "meta" | "published" | "draft" | "publish" | "discard-draft" } | null => {
  if (pathname === `${API_PREFIX}/docs`) {
    return { scope: "docs-list" };
  }
  const matched = pathname.match(/^\/api\/v1\/docs\/([^/]+)(?:\/(published|draft|publish|discard-draft))?$/);
  if (!matched) {
    return null;
  }
  const docId = decodeDocId(matched[1] ?? "");
  const action = (matched[2] ?? "meta") as "meta" | "published" | "draft" | "publish" | "discard-draft";
  return { scope: "docs-item", docId, action };
};

export const createLocalExampleApiPlugin = (options: LocalExampleApiPluginOptions = {}): Plugin => {
  const enabled = options.enabled ?? true;
  const baseDir = path.resolve(options.baseDir ?? process.cwd(), "localexample");
  const seedPath = path.resolve(baseDir, "docs.seed.json");
  const dbPath = path.resolve(baseDir, "docs.db.json");
  let statePromise: Promise<LocalDocDbState> | null = null;

  const loadSeedConfig = async (): Promise<{ seedVersion: number; seeds: SeedDocEntry[] }> => {
    try {
      const seedRaw = await fs.readFile(seedPath, "utf-8");
      const seedFile = JSON.parse(seedRaw) as SeedFile;
      return {
        seedVersion: normalizeSeedVersion(seedFile.version),
        seeds: normalizeSeedDocs(seedFile.seedDocs)
      };
    } catch {
      return { seedVersion: 1, seeds: DEFAULT_SEED_DOCS };
    }
  };

  const syncSeedIfNeeded = async (state: LocalDocDbState): Promise<LocalDocDbState> => {
    const { seedVersion, seeds } = await loadSeedConfig();
    if ((state.version ?? 1) >= seedVersion) {
      return state;
    }
    const seededState = buildSeedState(seedVersion, seeds);
    const upgraded = mergeSeededState(state, seededState);
    await fs.writeFile(dbPath, JSON.stringify(upgraded, null, 2), "utf-8");
    return upgraded;
  };

  const ensureState = async (): Promise<LocalDocDbState> => {
    if (statePromise) {
      const current = await statePromise;
      const synced = await syncSeedIfNeeded(current);
      if (synced !== current) {
        statePromise = Promise.resolve(synced);
      }
      return synced;
    }
    statePromise = (async () => {
      await fs.mkdir(baseDir, { recursive: true });
      const { seedVersion, seeds } = await loadSeedConfig();
      const seededState = buildSeedState(seedVersion, seeds);
      try {
        const existing = await fs.readFile(dbPath, "utf-8");
        const parsed = JSON.parse(existing) as LocalDocDbState;
        if (parsed && Array.isArray(parsed.records)) {
          if ((parsed.version ?? 1) >= seedVersion) {
            return parsed;
          }
          const upgraded = mergeSeededState(parsed, seededState);
          await fs.writeFile(dbPath, JSON.stringify(upgraded, null, 2), "utf-8");
          return upgraded;
        }
      } catch {
        // docs.db.json 不存在或损坏时，自动重建。
      }
      await fs.writeFile(dbPath, JSON.stringify(seededState, null, 2), "utf-8");
      return seededState;
    })();
    const initial = await statePromise;
    const synced = await syncSeedIfNeeded(initial);
    if (synced !== initial) {
      statePromise = Promise.resolve(synced);
    }
    return synced;
  };

  const persistState = async (state: LocalDocDbState): Promise<void> => {
    state.updatedAt = nowIso();
    await fs.writeFile(dbPath, JSON.stringify(state, null, 2), "utf-8");
  };

  const ensureUniqueDocId = (state: LocalDocDbState, docType: EditorDocType): string => {
    const used = new Set(state.records.map((record) => record.meta.id));
    let candidate = prefixedId(makeDocPrefix(docType));
    while (used.has(candidate)) {
      candidate = prefixedId(makeDocPrefix(docType));
    }
    return candidate;
  };

  const findRecord = (state: LocalDocDbState, docId: string): LocalDocRecord | undefined =>
    state.records.find((item) => item.meta.id === docId);

  return {
    name: "localexample-doc-api",
    apply: "serve",
    configureServer(server): void {
      if (!enabled) {
        return;
      }
      server.middlewares.use(async (req, res, next) => {
        const method = (req.method ?? "GET").toUpperCase();
        const currentUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        const route = parsePath(currentUrl.pathname);
        if (!route) {
          next();
          return;
        }
        res.setHeader("Cache-Control", "no-store");
        if (method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        try {
          const state = await ensureState();
          if (route.scope === "docs-list") {
            if (method === "GET") {
              const type = currentUrl.searchParams.get("type") ?? "all";
              const status = currentUrl.searchParams.get("status") ?? "all";
              const q = (currentUrl.searchParams.get("q") ?? "").trim();
              const page = Math.max(1, Number(currentUrl.searchParams.get("page") ?? "1") || 1);
              const pageSize = Math.max(1, Number(currentUrl.searchParams.get("pageSize") ?? "20") || 20);
              const sorted = [...state.records]
                .filter((record) => listFilter(record, type, status, q))
                .sort((a, b) => b.meta.updatedAt.localeCompare(a.meta.updatedAt));
              const start = (page - 1) * pageSize;
              const items = sorted.slice(start, start + pageSize).map((record) => clone(record.meta));
              sendJson(res, 200, { items, total: sorted.length, page, pageSize });
              return;
            }
            if (method === "POST") {
              const body = await parseBodyJson(req);
              const docType = body.docType;
              if (!isEditorDocType(docType)) {
                sendJson(res, 400, { message: "docType 非法，仅支持 dashboard/report/ppt" });
                return;
              }
              const seedTemplateId = pickString(body.seedTemplateId);
              const title = pickString(body.title);
              const doc = createBuiltInDoc(docType, seedTemplateId);
              doc.docId = ensureUniqueDocId(state, docType);
              if (title) {
                doc.title = title;
              }
              const revision = 1;
              const record: LocalDocRecord = {
                meta: {
                  id: doc.docId,
                  docType,
                  name: doc.title ?? `${docType} 新文档`,
                  description: "localexample 新建文档",
                  tags: [docType, "localexample", "new"],
                  updatedAt: nowIso(),
                  status: "draft",
                  canEdit: true,
                  canPublish: true,
                  revisions: { published: revision, draft: revision }
                },
                published: { doc: clone(doc), revision },
                draft: { doc: clone(doc), revision }
              };
              state.records.push(record);
              await persistState(state);
              sendJson(res, 200, {
                meta: clone(record.meta),
                draft: clone(record.draft),
                published: clone(record.published)
              });
              return;
            }
            sendJson(res, 405, { message: `method ${method} not allowed` });
            return;
          }

          const docId = route.docId ?? "";
          const record = findRecord(state, docId);
          if (!record) {
            sendJson(res, 404, { message: "文档不存在" });
            return;
          }

          if (route.action === "meta" && method === "GET") {
            sendJson(res, 200, clone(record.meta));
            return;
          }
          if (route.action === "published" && method === "GET") {
            sendJson(res, 200, clone(record.published));
            return;
          }
          if (route.action === "draft" && method === "GET") {
            sendJson(res, 200, clone(record.draft));
            return;
          }
          if (route.action === "draft" && method === "PUT") {
            const body = await parseBodyJson(req);
            const incomingDoc = body.doc;
            if (!incomingDoc || typeof incomingDoc !== "object") {
              sendJson(res, 400, { message: "请求缺少 doc 对象" });
              return;
            }
            const baseRevision = body.baseRevision;
            const expectedRevision = record.draft.revision;
            const actualRevision = asNumber(baseRevision);
            if (actualRevision !== undefined && actualRevision !== expectedRevision) {
              sendJson(res, 409, {
                message: "草稿已被更新，请刷新后重试",
                expected: expectedRevision,
                actual: actualRevision
              });
              return;
            }
            const nextRevision = expectedRevision + 1;
            record.draft = {
              doc: clone(incomingDoc as VDoc),
              revision: nextRevision
            };
            record.meta = {
              ...record.meta,
              name: record.draft.doc.title ?? record.meta.name,
              status: "draft",
              updatedAt: nowIso(),
              revisions: {
                published: record.published.revision,
                draft: nextRevision
              }
            };
            await persistState(state);
            sendJson(res, 200, { meta: clone(record.meta), draft: clone(record.draft) });
            return;
          }
          if (route.action === "publish" && method === "POST") {
            const body = await parseBodyJson(req);
            const fromDraftRevision = asNumber(body.fromDraftRevision);
            if (fromDraftRevision !== undefined && fromDraftRevision !== record.draft.revision) {
              sendJson(res, 409, {
                message: "发布失败，草稿版本已变化",
                expected: record.draft.revision,
                actual: fromDraftRevision
              });
              return;
            }
            const nextRevision = record.published.revision + 1;
            record.published = { doc: clone(record.draft.doc), revision: nextRevision };
            record.draft = { doc: clone(record.published.doc), revision: nextRevision };
            record.meta = {
              ...record.meta,
              name: record.published.doc.title ?? record.meta.name,
              status: "published",
              updatedAt: nowIso(),
              revisions: {
                published: nextRevision,
                draft: nextRevision
              }
            };
            await persistState(state);
            sendJson(res, 200, {
              meta: clone(record.meta),
              published: clone(record.published),
              draft: clone(record.draft)
            });
            return;
          }
          if (route.action === "discard-draft" && method === "POST") {
            record.draft = { doc: clone(record.published.doc), revision: record.published.revision };
            record.meta = {
              ...record.meta,
              status: "published",
              updatedAt: nowIso(),
              revisions: {
                published: record.published.revision,
                draft: record.draft.revision
              }
            };
            await persistState(state);
            sendJson(res, 200, {
              meta: clone(record.meta),
              draft: clone(record.draft)
            });
            return;
          }

          sendJson(res, 405, { message: `method ${method} not allowed` });
        } catch (error) {
          sendJson(res, 500, { message: `localexample API 错误: ${toErrorMessage(error)}` });
        }
      });
    }
  };
};
