import { useCallback, useEffect, useMemo, useState } from "react";
import type { Command, DocType, VDoc, VNode } from "../core/doc/types";
import { CanvasPanel, preloadEditorChunk } from "./components/CanvasPanel";
import { ChatBridgePanel } from "./components/ChatBridgePanel";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { DocRuntimeView } from "./components/DocRuntimeView";
import { InspectorPanel } from "./components/InspectorPanel";
import { TreePanel } from "./components/TreePanel";
import { DocApiError, type DocContent, type DocMeta, type EditorDocType } from "./api/doc-repository";
import { useDocLibrary } from "./hooks/use-doc-library";
import { EditorProvider, useEditorStore } from "./state/editor-context";
import { setAiTelemetryContext } from "./telemetry/ai-telemetry";
import { buildAlignCommands, type AlignKind } from "./utils/alignment";
import type { Persona } from "./types/persona";

interface EditSession {
  docId: string;
  seed: VDoc;
  saved: VDoc;
  live: VDoc;
  draftRevision: number | null;
}

interface DocDetailState {
  meta: DocMeta;
  published: DocContent;
  draft: DocContent;
}

type RouteState = { page: "library" } | { page: "detail"; docId: string; mode: "view" | "edit" };

const DOC_TYPES: EditorDocType[] = ["dashboard", "report", "ppt"];
const cloneDoc = (doc: VDoc): VDoc => structuredClone(doc);

/**
 * 应用主壳：承接文档中心 -> 详情运行态 -> 编辑态完整闭环。
 * 关键职责：路由同步、详情加载、编辑会话管理、保存/发布流程。
 */
export function App(): JSX.Element {
  const [route, setRoute] = useState<RouteState>(() => parseRouteFromHash(window.location.hash));
  const { repo, source, page, loading: listLoading, error: listError, filters, refresh, createDoc } = useDocLibrary();
  const docs = page.items;
  const [advancedMode, setAdvancedMode] = useState(false);
  const [previewDraft, setPreviewDraft] = useState(false);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [detail, setDetail] = useState<DocDetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [actionError, setActionError] = useState<string>();

  const currentRecord = route.page === "detail" ? detail?.meta ?? docs.find((item) => item.id === route.docId) : undefined;
  const currentDetailDoc = useMemo(() => {
    if (!detail) {
      return undefined;
    }
    if (route.page === "detail" && route.mode === "edit" && editSession?.docId === detail.meta.id) {
      return editSession.live;
    }
    return previewDraft ? detail.draft.doc : detail.published.doc;
  }, [detail, editSession, previewDraft, route]);
  const isEditDirty = useMemo(
    () => (editSession ? JSON.stringify(editSession.live) !== JSON.stringify(editSession.saved) : false),
    [editSession]
  );

  const loadDetail = useCallback(
    async (docId: string): Promise<void> => {
      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const [meta, published, draft] = await Promise.all([
          repo.getDocMeta(docId),
          repo.getPublishedDoc(docId),
          repo.getDraftDoc(docId)
        ]);
        setDetail({ meta, published, draft });
      } catch (error) {
        setDetail(null);
        setDetailError(toErrorText(error));
      } finally {
        setDetailLoading(false);
      }
    },
    [repo]
  );

  useEffect(() => {
    const onHashChange = (): void => {
      setRoute(parseRouteFromHash(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const nextHash = routeToHash(route);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [route]);

  useEffect(() => {
    setPreviewDraft(false);
    setActionError(undefined);
  }, [route.page === "detail" ? route.docId : "", route.page, route.page === "detail" ? route.mode : ""]);

  useEffect(() => {
    // 把文档上下文注入 AI 埋点全局上下文，避免每个组件重复传参。
    if (route.page !== "detail") {
      setAiTelemetryContext({
        docId: undefined,
        docType: undefined,
        routeMode: undefined,
        nodeId: undefined,
        sourceId: undefined,
        trigger: undefined
      });
      return;
    }
    setAiTelemetryContext({
      docId: route.docId,
      docType: detail?.meta.docType,
      routeMode: route.mode
    });
  }, [detail?.meta.docType, route]);

  useEffect(() => {
    if (route.page !== "detail") {
      setDetail(null);
      setDetailError(undefined);
      setDetailLoading(false);
      return;
    }
    let active = true;
    void (async () => {
      await loadDetail(route.docId);
      if (!active) {
        return;
      }
    })();
    return () => {
      active = false;
    };
  }, [loadDetail, route]);

  useEffect(() => {
    if (route.page !== "detail") {
      setEditSession(null);
      return;
    }
    if (route.mode !== "edit" || !detail) {
      setEditSession(null);
      return;
    }
    if (editSession?.docId === detail.meta.id) {
      return;
    }
    const seed = cloneDoc(detail.draft.doc);
    setEditSession({
      docId: detail.meta.id,
      seed,
      saved: cloneDoc(seed),
      live: cloneDoc(seed),
      draftRevision: detail.draft.revision
    });
    setAdvancedMode(false);
    preloadEditorChunk(detail.meta.docType);
  }, [detail, editSession?.docId, route]);

  const createDocByType = async (docType: EditorDocType): Promise<void> => {
    setActionError(undefined);
    try {
      const created = await createDoc({ docType });
      preloadEditorChunk(docType);
      setRoute({ page: "detail", docId: created.id, mode: "edit" });
    } catch (error) {
      setActionError(`新建失败: ${toErrorText(error)}`);
    }
  };

  const onEditDocSnapshot = (doc: VDoc): void => {
    setEditSession((prev) => {
      if (!prev || route.page !== "detail") {
        return prev;
      }
      if (route.mode !== "edit" || prev.docId !== route.docId) {
        return prev;
      }
      return { ...prev, live: cloneDoc(doc) };
    });
  };

  const saveDraft = async (): Promise<void> => {
    if (!editSession) {
      return;
    }
    setActionError(undefined);
    try {
      const saved = await repo.saveDraft(editSession.docId, {
        doc: editSession.live,
        baseRevision: editSession.draftRevision
      });
      setDetail((prev) => {
        if (!prev || prev.meta.id !== editSession.docId) {
          return prev;
        }
        return {
          ...prev,
          meta: saved.meta,
          draft: saved.draft
        };
      });
      setEditSession((prev) => (prev ? { ...prev, saved: cloneDoc(prev.live), draftRevision: saved.draft.revision } : prev));
      await refresh();
    } catch (error) {
      setActionError(resolveActionError("保存草稿", error));
    }
  };

  const publishDraft = async (docId: string): Promise<void> => {
    // 优先使用编辑态最新草稿版本，避免发布旧 revision。
    const draftRevision =
      route.page === "detail" && route.mode === "edit" && editSession?.docId === docId ? editSession.draftRevision : detail?.draft.revision;
    if (draftRevision === undefined || draftRevision === null) {
      return;
    }
    setActionError(undefined);
    try {
      const result = await repo.publishDraft(docId, { fromDraftRevision: draftRevision });
      setDetail({
        meta: result.meta,
        published: result.published,
        draft: result.draft
      });
      setEditSession((prev) => {
        if (!prev || prev.docId !== docId) {
          return prev;
        }
        const snapshot = cloneDoc(result.draft.doc);
        return {
          ...prev,
          seed: snapshot,
          saved: cloneDoc(snapshot),
          live: cloneDoc(snapshot),
          draftRevision: result.draft.revision
        };
      });
      setPreviewDraft(false);
      await refresh();
    } catch (error) {
      setActionError(resolveActionError("发布草稿", error));
    }
  };

  const discardDraft = async (docId: string): Promise<void> => {
    setActionError(undefined);
    try {
      const discarded = await repo.discardDraft(docId);
      const published = detail?.meta.id === docId ? detail.published : await repo.getPublishedDoc(docId);
      setDetail({
        meta: discarded.meta,
        published,
        draft: discarded.draft
      });
      setEditSession((prev) => {
        if (!prev || prev.docId !== docId) {
          return prev;
        }
        const snapshot = cloneDoc(discarded.draft.doc);
        return {
          ...prev,
          seed: snapshot,
          saved: cloneDoc(snapshot),
          live: cloneDoc(snapshot),
          draftRevision: discarded.draft.revision
        };
      });
      await refresh();
    } catch (error) {
      setActionError(resolveActionError("放弃草稿", error));
    }
  };

  if (route.page === "library") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
          <span className="chip">文档中心</span>
          <span className="chip">数据源: {source === "api" ? "后端 API" : "本地兜底"}</span>
          {actionError ? <span className="chip" style={{ color: "#b91c1c" }}>{actionError}</span> : null}
          <div className="row">
            <button className="btn" onClick={() => void createDocByType("dashboard")}>
              新建 Dashboard
            </button>
            <button className="btn" onClick={() => void createDocByType("report")}>
              新建 Report
            </button>
            <button className="btn" onClick={() => void createDocByType("ppt")}>
              新建 PPT
            </button>
          </div>
          <span className="chip">总数: {page.total}</span>
        </div>
        <LibraryPage
          docs={docs}
          loading={listLoading}
          error={listError}
          source={source}
          filters={filters}
          pageIndex={page.page}
          pageSize={page.pageSize}
          total={page.total}
          onFiltersChange={(next) => void refresh(next)}
          onRetry={() => void refresh()}
          onOpen={(docId) => setRoute({ page: "detail", docId, mode: "view" })}
          onEdit={(docId, docType) => {
            preloadEditorChunk(docType);
            setRoute({ page: "detail", docId, mode: "edit" });
          }}
        />
      </div>
    );
  }

  if (detailLoading) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
          <button className="btn" onClick={() => setRoute({ page: "library" })}>
            返回列表
          </button>
        </div>
        <div className="library-shell">
          <div className="doc-empty">正在加载文档详情...</div>
        </div>
      </div>
    );
  }

  if (detailError) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
          <button className="btn" onClick={() => setRoute({ page: "library" })}>
            返回列表
          </button>
        </div>
        <div className="library-shell">
          <div className="doc-empty">{detailError}</div>
          <div className="row" style={{ justifyContent: "center" }}>
            {route.page === "detail" ? (
              <button className="btn" onClick={() => void loadDetail(route.docId)}>
                重试
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!currentRecord || !currentDetailDoc || !detail) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
          <button className="btn" onClick={() => setRoute({ page: "library" })}>
            返回列表
          </button>
        </div>
        <div className="library-shell">
          <div className="doc-empty">文档不存在或已被移除。</div>
        </div>
      </div>
    );
  }

  const canEdit = currentRecord.canEdit ?? true;
  const canPublish = currentRecord.canPublish ?? true;

  if (route.mode === "view") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">{currentRecord.name}</span>
          <span className="chip">{currentRecord.docType}</span>
          <span className={`chip status-${currentRecord.status}`}>{currentRecord.status === "published" ? "已发布" : "草稿中"}</span>
          <span className="chip">更新于 {formatUiTime(currentRecord.updatedAt)}</span>
          {actionError ? <span className="chip" style={{ color: "#b91c1c" }}>{actionError}</span> : null}
          <div className="row">
            {currentRecord.status === "draft" ? (
              <button className="btn" onClick={() => setPreviewDraft((value) => !value)}>
                {previewDraft ? "查看发布版" : "查看草稿版"}
              </button>
            ) : null}
            {currentRecord.status === "draft" ? (
              <button className="btn" disabled={!canPublish} onClick={() => void publishDraft(currentRecord.id)}>
                发布草稿
              </button>
            ) : null}
            {currentRecord.status === "draft" ? (
              <button className="btn danger" disabled={!canPublish} onClick={() => void discardDraft(currentRecord.id)}>
                放弃草稿
              </button>
            ) : null}
            <button className="btn" onClick={() => void loadDetail(currentRecord.id)}>
              刷新
            </button>
            <button className="btn primary" disabled={!canEdit} onClick={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "edit" })}>
              进入编辑
            </button>
            <button className="btn" onClick={() => setRoute({ page: "library" })}>
              返回列表
            </button>
          </div>
        </div>
        <DetailPage record={currentRecord} doc={currentDetailDoc} previewDraft={previewDraft} />
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">{currentRecord.name}</span>
          <span className="chip">无编辑权限</span>
          <button className="btn" onClick={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "view" })}>
            返回运行态
          </button>
          <button className="btn" onClick={() => setRoute({ page: "library" })}>
            返回列表
          </button>
        </div>
        <div className="library-shell">
          <div className="doc-empty">当前账号没有该文档的编辑权限。</div>
        </div>
      </div>
    );
  }

  if (!editSession) {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
        </div>
        <div className="library-shell">
          <div className="doc-empty">正在初始化编辑器...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">{currentRecord.name}</span>
        <span className="chip">{currentRecord.docType}</span>
        <span className={`chip status-${currentRecord.status}`}>{currentRecord.status === "published" ? "已发布" : "草稿中"}</span>
        <span className="chip">草稿版本: r{editSession.draftRevision ?? "-"}</span>
        <span className={`chip ${isEditDirty ? "chip-warning" : ""}`}>{isEditDirty ? "有未保存改动" : "已保存"}</span>
        {actionError ? <span className="chip" style={{ color: "#b91c1c" }}>{actionError}</span> : null}
        <div className="row">
          <button className="btn" onClick={() => void saveDraft()}>
            保存草稿
          </button>
          <button className="btn primary" disabled={!canPublish} onClick={() => void publishDraft(currentRecord.id)}>
            发布
          </button>
          <button className="btn" onClick={() => void loadDetail(currentRecord.id)}>
            刷新
          </button>
          <button className={`btn ${advancedMode ? "primary" : ""}`} onClick={() => setAdvancedMode((value) => !value)}>
            {advancedMode ? "收起高级设置" : "更多设置"}
          </button>
          <button className="btn" onClick={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "view" })}>
            返回运行态
          </button>
          <button className="btn" onClick={() => setRoute({ page: "library" })}>
            返回列表
          </button>
        </div>
      </div>
      <EditorProvider
        key={`${editSession.docId}_${editSession.draftRevision ?? 0}`}
        initialDoc={editSession.seed}
        onDocChange={onEditDocSnapshot}
      >
        <AppLayout advanced={advancedMode} />
      </EditorProvider>
    </div>
  );
}

function LibraryPage({
  docs,
  loading,
  error,
  source,
  filters,
  pageIndex,
  pageSize,
  total,
  onFiltersChange,
  onRetry,
  onOpen,
  onEdit
}: {
  docs: DocMeta[];
  loading: boolean;
  error?: string;
  source: "api" | "local";
  filters: { type: EditorDocType | "all"; status: "published" | "draft" | "all"; q: string; page: number; pageSize: number };
  pageIndex: number;
  pageSize: number;
  total: number;
  onFiltersChange: (next: Partial<{ type: EditorDocType | "all"; status: "published" | "draft" | "all"; q: string; page: number; pageSize: number }>) => void;
  onRetry: () => void;
  onOpen: (docId: string) => void;
  onEdit: (docId: string, docType: EditorDocType) => void;
}): JSX.Element {
  const [keywordInput, setKeywordInput] = useState(filters.q);
  useEffect(() => {
    setKeywordInput(filters.q);
  }, [filters.q]);

  // 简单分页控制，后续若接游标分页可在这里替换。
  const canPrev = pageIndex > 1;
  const canNext = pageIndex * pageSize < total;

  return (
    <div className="library-shell">
      <div className="library-toolbar">
        <div className="tabs">
          {["all", ...DOC_TYPES].map((type) => (
            <button
              key={type}
              className={`tab-btn ${filters.type === type ? "active" : ""}`}
              onClick={() => onFiltersChange({ type: type as "all" | EditorDocType, page: 1 })}
            >
              {type === "all" ? "全部" : type}
            </button>
          ))}
        </div>
        <div className="row">
          <select
            className="select"
            value={filters.status}
            onChange={(event) => onFiltersChange({ status: event.target.value as "all" | "published" | "draft", page: 1 })}
            style={{ width: 120 }}
          >
            <option value="all">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿中</option>
          </select>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            value={keywordInput}
            onChange={(event) => {
              const next = event.target.value;
              setKeywordInput(next);
              onFiltersChange({ q: next, page: 1 });
            }}
            placeholder="搜索标题、描述、标签"
          />
          <button className="btn" onClick={onRetry}>
            刷新
          </button>
        </div>
      </div>
      {error ? <div className="doc-empty">{error}</div> : null}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="chip">数据源: {source === "api" ? "后端 API" : "本地兜底"}</span>
        <span className="chip">
          第 {pageIndex} 页 / 共 {Math.max(1, Math.ceil(total / pageSize))} 页
        </span>
      </div>
      <div className="doc-grid">
        {loading ? <div className="doc-empty">文档列表加载中...</div> : null}
        {!loading && docs.length === 0 ? <div className="doc-empty">没有匹配文档</div> : null}
        {docs.map((item) => (
          <article key={item.id} className="doc-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{item.name}</strong>
              <span className={`chip status-${item.status}`}>{item.status === "published" ? "已发布" : "草稿中"}</span>
            </div>
            <div className="muted">{item.description}</div>
            <div className="row">
              <span className="chip">{item.docType}</span>
              <span className="chip">更新于 {formatUiTime(item.updatedAt)}</span>
            </div>
            <div className="row">
              {item.tags.map((tag) => (
                <span key={`${item.id}_${tag}`} className="chip">
                  {tag}
                </span>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => onOpen(item.id)}>
                查看详情
              </button>
              <button className="btn primary" onMouseEnter={() => preloadEditorChunk(item.docType)} onClick={() => onEdit(item.id, item.docType)}>
                进入编辑
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "center" }}>
        <button className="btn" disabled={!canPrev} onClick={() => onFiltersChange({ page: pageIndex - 1 })}>
          上一页
        </button>
        <button className="btn" disabled={!canNext} onClick={() => onFiltersChange({ page: pageIndex + 1 })}>
          下一页
        </button>
      </div>
    </div>
  );
}

function DetailPage({ record, doc, previewDraft }: { record: DocMeta; doc: VDoc; previewDraft: boolean }): JSX.Element {
  return (
    <div className="runtime-shell">
      <div className="runtime-header">
        <div className="col" style={{ gap: 4 }}>
          <strong>{record.name}</strong>
          <span className="muted">{record.description}</span>
        </div>
        <div className="row">
          {record.status === "draft" ? <span className="chip">当前查看: {previewDraft ? "草稿版" : "发布版"}</span> : null}
          <span className="chip">类型: {record.docType}</span>
        </div>
      </div>
      <div className="runtime-body">
        <DocRuntimeView doc={doc} />
      </div>
    </div>
  );
}

const toErrorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const formatUiTime = (iso: string): string => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return iso;
  }
  return dt.toLocaleString("zh-CN", { hour12: false });
};

const resolveActionError = (action: string, error: unknown): string => {
  if (error instanceof DocApiError && error.status === 409) {
    return `${action}失败：版本冲突，请刷新后重试。`;
  }
  return `${action}失败：${toErrorText(error)}`;
};
function AppLayout({ advanced }: { advanced: boolean }): JSX.Element {
  // 产品策略：默认简化模式，开启“更多设置”后进入 analyst 能力层。
  const persona: Persona = advanced ? "analyst" : "novice";
  const store = useEditorStore();
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    if (!advanced) {
      setShowFilterPanel(false);
      setShowBatchPanel(false);
    }
  }, [advanced]);

  const applyAllChartsLabel = (labelShow: boolean): void => {
    const doc = store.doc.value;
    if (!doc) {
      return;
    }
    const chartIds = collectNodes(doc.root, (node) => node.kind === "chart").map((node) => node.id);
    if (chartIds.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: chartIds.map((nodeId) => ({
          type: "UpdateProps",
          nodeId,
          props: { labelShow }
        }))
      },
      { summary: labelShow ? "all labels on" : "all labels off" }
    );
  };

  const removeSelection = (): void => {
    const doc = store.doc.value;
    const selected = store.selection.value.selectedIds;
    if (!doc || selected.length === 0) {
      return;
    }
    const removable = pruneSelectedForRemoval(doc.root, selected);
    const commands: Command[] = removable.map((nodeId) => ({ type: "RemoveNode", nodeId }));
    store.executeCommand({ type: "Transaction", commands }, { summary: "remove selection" });
    store.clearSelection();
  };

  const applyAlign = (kind: AlignKind, summary: string): void => {
    const doc = store.doc.value;
    if (!doc) {
      return;
    }
    const commands = buildAlignCommands(doc.root, store.selection.value.selectedIds, kind);
    if (commands.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands
      },
      { summary }
    );
  };

  const commands = useMemo<PaletteCommand[]>(
    () => [
      { id: "undo", label: "撤销", shortcut: "Ctrl/Cmd+Z", keywords: ["回退", "undo"], run: () => store.undo() },
      { id: "redo", label: "重做", shortcut: "Ctrl/Cmd+Y", keywords: ["redo"], run: () => store.redo() },
      {
        id: "panel.batch",
        label: "切换批量修改面板",
        shortcut: "Ctrl/Cmd+K → 批量",
        keywords: ["batch", "批量", "面板"],
        group: "Panels",
        personas: ["analyst", "designer", "ai"],
        run: () => setShowBatchPanel((value) => !value)
      },
      {
        id: "panel.filter",
        label: "切换高级过滤面板",
        shortcut: "Ctrl/Cmd+K → 过滤",
        keywords: ["filter", "过滤"],
        group: "Panels",
        personas: ["analyst", "designer", "ai"],
        run: () => setShowFilterPanel((value) => !value)
      },
      {
        id: "theme.doc.dark",
        label: "应用文档暗色主题",
        shortcut: "Ctrl/Cmd+K → 暗色",
        keywords: ["主题", "dark"],
        group: "Theme",
        personas: ["novice", "analyst", "designer", "ai"],
        run: () => store.executeCommand({ type: "ApplyTheme", scope: "doc", themeId: "theme.tech.dark" }, { summary: "doc dark theme" })
      },
      {
        id: "chart.labels.on",
        label: "所有图表开启数据标签",
        shortcut: "Ctrl/Cmd+Shift+L",
        keywords: ["标签", "chart", "label"],
        group: "Chart",
        personas: ["analyst", "ai"],
        run: () => applyAllChartsLabel(true)
      },
      {
        id: "chart.labels.off",
        label: "所有图表关闭数据标签",
        shortcut: "Ctrl/Cmd+K → 关标签",
        keywords: ["标签", "关闭"],
        group: "Chart",
        personas: ["analyst", "ai"],
        run: () => applyAllChartsLabel(false)
      },
      {
        id: "group",
        label: "编组选中节点",
        shortcut: "Ctrl/Cmd+G",
        keywords: ["group", "编组"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () =>
          store.executeCommand(
            {
              type: "Group",
              nodeIds: store.selection.value.selectedIds
            },
            { summary: "group selection" }
          )
      },
      {
        id: "ungroup",
        label: "解组选中节点",
        shortcut: "Ctrl/Cmd+Shift+G",
        keywords: ["ungroup", "解组"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () =>
          store.executeCommand(
            {
              type: "Ungroup",
              nodeIds: store.selection.value.selectedIds
            },
            { summary: "ungroup selection" }
          )
      },
      {
        id: "align.left",
        label: "左对齐",
        shortcut: "Ctrl/Cmd+K → 左对齐",
        keywords: ["align", "left", "左对齐"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("left", "align left")
      },
      {
        id: "align.hcenter",
        label: "水平居中对齐",
        shortcut: "Ctrl/Cmd+K → 居中",
        keywords: ["align", "center", "居中"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("hcenter", "align hcenter")
      },
      {
        id: "align.right",
        label: "右对齐",
        shortcut: "Ctrl/Cmd+K → 右对齐",
        keywords: ["align", "right", "右对齐"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("right", "align right")
      },
      {
        id: "align.top",
        label: "顶对齐",
        shortcut: "Ctrl/Cmd+K → 顶对齐",
        keywords: ["align", "top", "顶对齐"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("top", "align top")
      },
      {
        id: "align.vcenter",
        label: "垂直居中对齐",
        shortcut: "Ctrl/Cmd+K → 中线",
        keywords: ["align", "middle", "中线"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("vcenter", "align vcenter")
      },
      {
        id: "align.bottom",
        label: "底对齐",
        shortcut: "Ctrl/Cmd+K → 底对齐",
        keywords: ["align", "bottom", "底对齐"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("bottom", "align bottom")
      },
      {
        id: "align.hdistribute",
        label: "水平分布",
        shortcut: "Ctrl/Cmd+K → 水平均分",
        keywords: ["distribute", "horizontal", "水平分布"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("hdistribute", "distribute horizontal")
      },
      {
        id: "align.vdistribute",
        label: "垂直分布",
        shortcut: "Ctrl/Cmd+K → 垂直均分",
        keywords: ["distribute", "vertical", "垂直分布"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyAlign("vdistribute", "distribute vertical")
      },
      {
        id: "remove",
        label: "删除选中节点",
        shortcut: "Delete",
        keywords: ["删除", "remove"],
        group: "Edit",
        personas: ["novice", "analyst", "designer", "ai"],
        run: removeSelection
      }
    ],
    [store]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      const withCtrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (withCtrl && key === "k") {
        event.preventDefault();
        setShowCommandPalette(true);
        return;
      }
      if (!withCtrl) {
        if (!isTyping && event.key === "Delete") {
          event.preventDefault();
          removeSelection();
        }
        return;
      }
      if (isTyping && key !== "z" && key !== "y") {
        return;
      }
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        store.undo();
      }
      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        store.redo();
      }
      if (key === "g" && !event.shiftKey) {
        event.preventDefault();
        store.executeCommand(
          {
            type: "Group",
            nodeIds: store.selection.value.selectedIds
          },
          { summary: "group selection hotkey" }
        );
      }
      if (key === "g" && event.shiftKey) {
        event.preventDefault();
        store.executeCommand(
          {
            type: "Ungroup",
            nodeIds: store.selection.value.selectedIds
          },
          { summary: "ungroup selection hotkey" }
        );
      }
      if (key === "l" && event.shiftKey) {
        event.preventDefault();
        applyAllChartsLabel(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store]);

  return (
    <>
      <div className="layout">
        <section className="panel">
          <TreePanel persona={persona} />
        </section>
        <section className="panel">
          <CanvasPanel
            persona={persona}
            showFilterPanel={showFilterPanel}
            onToggleFilterPanel={() => setShowFilterPanel((value) => !value)}
            showBatchPanel={showBatchPanel}
            onToggleBatchPanel={() => setShowBatchPanel((value) => !value)}
          />
        </section>
        <section className="panel">
          <div style={{ height: "58%" }}>
            <InspectorPanel persona={persona} />
          </div>
          <div style={{ height: "42%", borderTop: "1px solid var(--line)" }}>
            <ChatBridgePanel persona={persona} />
          </div>
        </section>
      </div>
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} persona={persona} commands={commands} />
    </>
  );
}

const collectNodes = (root: VNode, matcher: (node: VNode) => boolean): VNode[] => {
  const nodes: VNode[] = [];
  const walk = (node: VNode): void => {
    if (matcher(node)) {
      nodes.push(node);
    }
    node.children?.forEach(walk);
  };
  walk(root);
  return nodes;
};

const pruneSelectedForRemoval = (root: VNode, selectedIds: string[]): string[] => {
  const selected = new Set(selectedIds);
  const keep: string[] = [];
  const dfs = (node: VNode, hasSelectedAncestor: boolean): void => {
    const isSelected = selected.has(node.id);
    if (isSelected && !hasSelectedAncestor && node.id !== "root") {
      keep.push(node.id);
    }
    node.children?.forEach((child) => dfs(child, hasSelectedAncestor || isSelected));
  };
  dfs(root, false);
  return keep;
};

const parseRouteFromHash = (hash: string): RouteState => {
  // 支持 #/docs -> 列表；#/docs/{id} -> 运行态；#/docs/{id}/edit -> 编辑态
  const cleaned = hash.replace(/^#\/?/, "");
  const [path = ""] = cleaned.split("?");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] !== "docs") {
    return { page: "library" };
  }
  if (parts.length < 2) {
    return { page: "library" };
  }
  const docId = decodeURIComponent(parts[1] ?? "");
  if (!docId) {
    return { page: "library" };
  }
  const mode = parts[2] === "edit" ? "edit" : "view";
  return { page: "detail", docId, mode };
};

const routeToHash = (route: RouteState): string => {
  if (route.page === "library") {
    return "#/docs";
  }
  const encoded = encodeURIComponent(route.docId);
  if (route.mode === "edit") {
    return `#/docs/${encoded}/edit`;
  }
  return `#/docs/${encoded}`;
};
