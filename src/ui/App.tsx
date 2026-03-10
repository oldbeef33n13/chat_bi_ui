import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Command, CommandPlan, DocType, TemplateVariableDef, VDoc, VNode } from "../core/doc/types";
import { CanvasPanel, preloadEditorChunk } from "./components/CanvasPanel";
import { ChatBridgePanel } from "./components/ChatBridgePanel";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { DataEndpointManagerPanel } from "./components/DataEndpointManagerPanel";
import { DocOutlinePanel } from "./components/DocOutlinePanel";
import { DocRuntimeView } from "./components/DocRuntimeView";
import { EditorTopToolbar } from "./components/EditorTopToolbar";
import { InspectorPanel } from "./components/InspectorPanel";
import { TemplateSchedulePanel } from "./components/TemplateSchedulePanel";
import { TemplateVariableForm } from "./components/TemplateVariableForm";
import { DocApiError, type DocContent, type DocMeta, type DocSeedTemplate, type EditorDocType } from "./api/doc-repository";
import { HttpTemplateRuntimeRepository } from "./api/http-template-runtime-repository";
import type { TemplateArtifact, TemplateRun } from "./api/template-runtime-repository";
import { templateOutputByDocType } from "./api/template-runtime-repository";
import { useDocLibrary } from "./hooks/use-doc-library";
import { EditorProvider, useEditorStore } from "./state/editor-context";
import { useSignalValue } from "./state/use-signal-value";
import { setEditorTelemetryContext } from "./telemetry/editor-telemetry";
import { createAiTraceId, emitAiTelemetry, setAiTelemetryContext } from "./telemetry/ai-telemetry";
import { explainPlan, inferCommandPlan } from "./utils/ai-command-plan";
import { buildAlignCommands, buildAlignToContainerCommandResult, type AlignKind } from "./utils/alignment";
import { buildTemplateVariableDefaults, coerceTemplateVariableValue } from "./utils/template-variables";
import {
  loadPresentationRuntimeSettings,
  savePresentationRuntimeSettings,
  type PresentationRuntimeSettings
} from "./utils/presentation-settings";
import type { Persona } from "./types/persona";

interface EditSession {
  docId: string;
  seed: VDoc;
  live: VDoc;
  baseRevision: number;
}

interface DocDetailState {
  meta: DocMeta;
  content: DocContent;
}

interface SchedulePanelTemplateContext {
  id: string;
  name: string;
  docType: EditorDocType;
  templateVariables?: TemplateVariableDef[];
  defaultVariables?: Record<string, unknown>;
}

interface BlankTemplateOption {
  id: string;
  label: string;
  description: string;
  docType: EditorDocType;
  icon: string;
  dashboardPreset?: "wallboard" | "workbench";
}

export type RouteState = { page: "library" } | { page: "detail"; docId: string; mode: "view" | "edit" | "present" };

const DOC_TYPES: EditorDocType[] = ["dashboard", "report", "ppt"];
const DOC_TYPE_LABELS: Record<EditorDocType, string> = {
  dashboard: "Dashboard",
  report: "Report",
  ppt: "PPT"
};
const BLANK_TEMPLATE_OPTIONS: BlankTemplateOption[] = [
  {
    id: "blank-dashboard-wallboard",
    label: "监控大屏",
    description: "空白全屏大屏，适合值班大盘和电视墙",
    docType: "dashboard",
    icon: "⛶",
    dashboardPreset: "wallboard"
  },
  {
    id: "blank-dashboard-workbench",
    label: "PC 工作台",
    description: "空白页面工作台，适合首页和运营工作台",
    docType: "dashboard",
    icon: "▤",
    dashboardPreset: "workbench"
  },
  {
    id: "blank-report",
    label: "空白报告",
    description: "创建仅含空章节的报告模板",
    docType: "report",
    icon: "📝"
  },
  {
    id: "blank-ppt",
    label: "空白汇报",
    description: "创建仅含空白页的汇报模板",
    docType: "ppt",
    icon: "▣"
  }
];
const cloneDoc = (doc: VDoc): VDoc => structuredClone(doc);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
const SESSION_DRAFT_PREFIX = "chatbi.template.sessionDraft";

const buildSessionDraftKey = (docId: string, baseRevision: number): string => `${SESSION_DRAFT_PREFIX}:${docId}:${baseRevision}`;

const loadSessionDraft = (docId: string, baseRevision: number): VDoc | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.sessionStorage.getItem(buildSessionDraftKey(docId, baseRevision));
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as VDoc;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const saveSessionDraft = (docId: string, baseRevision: number, doc: VDoc): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(buildSessionDraftKey(docId, baseRevision), JSON.stringify(doc));
};

const clearSessionDraft = (docId: string, baseRevision: number): void => {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.removeItem(buildSessionDraftKey(docId, baseRevision));
};

const clearAllSessionDrafts = (docId: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  const prefix = `${SESSION_DRAFT_PREFIX}:${docId}:`;
  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(prefix)) {
      window.sessionStorage.removeItem(key);
    }
  }
};

const pickPreferredArtifact = (docType: EditorDocType, artifacts: TemplateArtifact[]): TemplateArtifact | undefined => {
  if (docType === "report") {
    return artifacts.find((item) => item.artifactType === "report_docx") ?? artifacts[0];
  }
  if (docType === "ppt") {
    return artifacts.find((item) => item.artifactType === "ppt_pptx") ?? artifacts[0];
  }
  return artifacts.find((item) => item.artifactType === "dashboard_snapshot_json") ?? artifacts[0];
};

/**
 * 应用主壳：承接文档中心 -> 详情运行态 -> 编辑态完整闭环。
 * 关键职责：路由同步、详情加载、编辑会话管理、保存/发布流程。
 */
export function App(): JSX.Element {
  const [route, setRoute] = useState<RouteState>(() => parseRouteFromHash(window.location.hash));
  const { repo, page, loading: listLoading, error: listError, filters, refresh, createDoc } = useDocLibrary();
  const runtimeRepo = useMemo(() => new HttpTemplateRuntimeRepository("/api/v1"), []);
  const docs = page.items;
  const [advancedMode, setAdvancedMode] = useState(false);
  const [createTemplatePanelOpen, setCreateTemplatePanelOpen] = useState(false);
  const [dataEndpointPanelOpen, setDataEndpointPanelOpen] = useState(false);
  const [schedulePanelTemplate, setSchedulePanelTemplate] = useState<SchedulePanelTemplateContext | null>(null);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [detail, setDetail] = useState<DocDetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [runtimeHint, setRuntimeHint] = useState<string>();
  const [detailVariablePanelOpen, setDetailVariablePanelOpen] = useState(false);
  const [detailVariableValues, setDetailVariableValues] = useState<Record<string, unknown>>({});
  const [previewSnapshotDoc, setPreviewSnapshotDoc] = useState<VDoc | null>(null);
  const [previewResolvedVariables, setPreviewResolvedVariables] = useState<Record<string, unknown>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [lastExportRun, setLastExportRun] = useState<TemplateRun | null>(null);
  const [seedTemplates, setSeedTemplates] = useState<DocSeedTemplate[]>([]);
  const [seedTemplatesLoading, setSeedTemplatesLoading] = useState(false);
  const [seedTemplatesError, setSeedTemplatesError] = useState<string>();

  const currentRecord = route.page === "detail" ? detail?.meta ?? docs.find((item) => item.id === route.docId) : undefined;
  const currentDetailDoc = useMemo(() => {
    if (!detail) {
      return undefined;
    }
    if (route.page === "detail" && route.mode === "edit" && editSession?.docId === detail.meta.id) {
      return editSession.live;
    }
    return detail.content.doc;
  }, [detail, editSession, route]);
  const activeDetailDoc = route.page === "detail" && route.mode !== "edit" ? previewSnapshotDoc ?? currentDetailDoc : currentDetailDoc;
  const displayTitle = useMemo(() => {
    if (route.page !== "detail") {
      return "Visual Document OS";
    }
    const docTitle = route.mode === "edit" ? editSession?.live.title : activeDetailDoc?.title;
    if (typeof docTitle === "string" && docTitle.trim().length > 0) {
      return docTitle.trim();
    }
    return currentRecord?.name ?? "Visual Document OS";
  }, [activeDetailDoc?.title, currentRecord?.name, editSession?.live.title, route]);
  const isEditDirty = useMemo(
    () => (editSession ? JSON.stringify(editSession.live) !== JSON.stringify(editSession.seed) : false),
    [editSession]
  );

  const loadDetail = useCallback(
    async (docId: string): Promise<void> => {
      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const [meta, content] = await Promise.all([repo.getDocMeta(docId), repo.getDocContent(docId)]);
        setDetail({ meta, content });
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
    setActionError(undefined);
    setRuntimeHint(undefined);
    setDetailVariablePanelOpen(false);
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables({});
    setLastExportRun(null);
  }, [route.page === "detail" ? route.docId : "", route.page, route.page === "detail" ? route.mode : ""]);

  useEffect(() => {
    if (route.page !== "library") {
      setDataEndpointPanelOpen(false);
      setCreateTemplatePanelOpen(false);
    }
  }, [route.page]);

  const loadSeedTemplates = useCallback(async (): Promise<void> => {
    setSeedTemplatesLoading(true);
    setSeedTemplatesError(undefined);
    try {
      const items = await repo.listSeedTemplates();
      setSeedTemplates(items);
    } catch (error) {
      setSeedTemplatesError(toErrorText(error));
    } finally {
      setSeedTemplatesLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    if (route.page !== "library") {
      return;
    }
    void loadSeedTemplates();
  }, [loadSeedTemplates, route.page]);

  useEffect(() => {
    if (!currentDetailDoc || route.page !== "detail" || route.mode === "edit") {
      return;
    }
    setDetailVariableValues(buildTemplateVariableDefaults(currentDetailDoc.templateVariables));
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables({});
    setLastExportRun(null);
  }, [currentDetailDoc, route.page, route.page === "detail" ? route.mode : "view"]);

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
      setEditorTelemetryContext({
        docId: undefined,
        docType: undefined,
        routeMode: undefined,
        sectionId: undefined,
        slideId: undefined,
        rowId: undefined,
        nodeId: undefined,
        anchorId: undefined,
        presetId: undefined,
        selectionCount: undefined,
        trigger: undefined
      });
      return;
    }
    setAiTelemetryContext({
      docId: route.docId,
      docType: detail?.meta.docType,
      routeMode: route.mode
    });
    setEditorTelemetryContext({
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
    if (editSession?.docId === detail.meta.id && editSession.baseRevision === detail.content.revision) {
      return;
    }
    const seed = cloneDoc(detail.content.doc);
    const localDraft = loadSessionDraft(detail.meta.id, detail.content.revision);
    setEditSession({
      docId: detail.meta.id,
      seed,
      live: cloneDoc(localDraft ?? seed),
      baseRevision: detail.content.revision
    });
    setAdvancedMode(false);
    preloadEditorChunk(detail.meta.docType);
  }, [detail, editSession?.baseRevision, editSession?.docId, route]);

  useEffect(() => {
    if (!editSession) {
      return;
    }
    saveSessionDraft(editSession.docId, editSession.baseRevision, editSession.live);
  }, [editSession]);

  useEffect(() => {
    if (!isEditDirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isEditDirty]);

  const createDocByType = async (
    docType: EditorDocType,
    options?: {
      dashboardPreset?: "wallboard" | "workbench";
      seedTemplateId?: string;
    }
  ): Promise<void> => {
    setActionError(undefined);
    try {
      const created = await createDoc({
        docType,
        dashboardPreset: options?.dashboardPreset,
        seedTemplateId: options?.seedTemplateId
      });
      preloadEditorChunk(docType);
      setCreateTemplatePanelOpen(false);
      setRoute({ page: "detail", docId: created.id, mode: "edit" });
    } catch (error) {
      setActionError(`新建失败: ${toErrorText(error)}`);
    }
  };

  const onEditDocSnapshot = useCallback((doc: VDoc): void => {
    setEditSession((prev) => {
      if (!prev || route.page !== "detail") {
        return prev;
      }
      if (route.mode !== "edit" || prev.docId !== route.docId) {
        return prev;
      }
      return { ...prev, live: cloneDoc(doc) };
    });
  }, [route]);

  const publishDoc = async (docId: string): Promise<void> => {
    setActionError(undefined);
    setRuntimeHint(undefined);
    try {
      if (route.page !== "detail" || route.mode !== "edit" || !editSession || editSession.docId !== docId) {
        return;
      }
      const result = await repo.publishDoc(docId, {
        doc: editSession.live,
        baseRevision: editSession.baseRevision
      });
      clearAllSessionDrafts(docId);
      setDetail({ meta: result.meta, content: result.content });
      const snapshot = cloneDoc(result.content.doc);
      setEditSession({
        docId,
        seed: snapshot,
        live: cloneDoc(snapshot),
        baseRevision: result.content.revision
      });
      setRuntimeHint("已发布当前改动");
      await refresh();
    } catch (error) {
      setActionError(resolveActionError("发布", error));
    }
  };

  const restorePublished = (): void => {
    if (!editSession || !detail || editSession.docId !== detail.meta.id) {
      return;
    }
    clearAllSessionDrafts(editSession.docId);
    const snapshot = cloneDoc(detail.content.doc);
    setEditSession({
      docId: editSession.docId,
      seed: snapshot,
      live: cloneDoc(snapshot),
      baseRevision: detail.content.revision
    });
    setRuntimeHint("已恢复到发布版本");
  };

  const updateDetailVariableValue = useCallback(
    (key: string, value: unknown, variable?: TemplateVariableDef): void => {
      setDetailVariableValues((prev) => ({
        ...prev,
        [key]: variable ? coerceTemplateVariableValue(variable, value) : value
      }));
    },
    []
  );

  const openScheduleForTemplate = useCallback(
    (template: { id: string; name: string; docType: EditorDocType; templateVariables?: TemplateVariableDef[]; defaultVariables?: Record<string, unknown> }) => {
      setSchedulePanelTemplate(template);
    },
    []
  );

  const runTemplatePreview = useCallback(async (): Promise<void> => {
    if (!currentRecord || route.page !== "detail" || route.mode === "edit") {
      return;
    }
    setPreviewLoading(true);
    setActionError(undefined);
    setRuntimeHint(undefined);
    try {
      const result = await runtimeRepo.previewTemplate(currentRecord.id, detailVariableValues);
      setPreviewSnapshotDoc(result.snapshot);
      setPreviewResolvedVariables(result.resolvedVariables);
      setRuntimeHint("已生成动态预览");
    } catch (error) {
      setActionError(resolveActionError("动态预览", error));
    } finally {
      setPreviewLoading(false);
    }
  }, [currentRecord, detailVariableValues, route, runtimeRepo]);

  const clearTemplatePreview = useCallback((): void => {
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables({});
    setRuntimeHint("已还原模板视图");
  }, []);

  const runTemplateExport = useCallback(async (): Promise<void> => {
    if (!currentRecord || route.page !== "detail" || route.mode === "edit") {
      return;
    }
    setExportLoading(true);
    setActionError(undefined);
    setRuntimeHint(undefined);
    setLastExportRun(null);
    try {
      const accepted = await runtimeRepo.exportTemplate(currentRecord.id, {
        outputType: templateOutputByDocType[currentRecord.docType],
        variables: detailVariableValues
      });
      let latestRun: TemplateRun | null = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        latestRun = await runtimeRepo.getRun(accepted.runId);
        if (latestRun.status === "succeeded" || latestRun.status === "failed") {
          break;
        }
        await sleep(250);
      }
      if (!latestRun) {
        throw new Error("导出任务未返回执行结果");
      }
      setLastExportRun(latestRun);
      if (latestRun.status === "failed") {
        throw new Error(latestRun.errorMessage ?? "导出失败");
      }
      const artifact = pickPreferredArtifact(currentRecord.docType, latestRun.artifacts);
      if (artifact) {
        window.open(artifact.downloadUrl, "_blank", "noopener,noreferrer");
      }
      setRuntimeHint(`导出完成 · ${latestRun.id}`);
    } catch (error) {
      setActionError(resolveActionError("导出下载", error));
    } finally {
      setExportLoading(false);
    }
  }, [currentRecord, detailVariableValues, route, runtimeRepo]);

  if (route.page === "library") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
          <span className="chip">文档中心</span>
          <span className="chip">数据源: 后端 API</span>
          {actionError ? <span className="chip" style={{ color: "#b91c1c" }}>{actionError}</span> : null}
          <div className="row">
            <button className={`btn ${dataEndpointPanelOpen ? "primary" : ""}`} onClick={() => setDataEndpointPanelOpen((value) => !value)}>
              数据接口
            </button>
            <div className="tool-group tool-group-menu">
              <button className={`btn ${createTemplatePanelOpen ? "primary" : ""}`} onClick={() => setCreateTemplatePanelOpen((value) => !value)}>
                新建模板 ▾
              </button>
              {createTemplatePanelOpen ? (
                <CreateTemplatePanel
                  blankOptions={BLANK_TEMPLATE_OPTIONS}
                  seeds={seedTemplates}
                  seedsLoading={seedTemplatesLoading}
                  seedsError={seedTemplatesError}
                  onRetrySeeds={() => void loadSeedTemplates()}
                  onCreateBlank={(option) => void createDocByType(option.docType, { dashboardPreset: option.dashboardPreset })}
                  onCreateFromSeed={(seed) => void createDocByType(seed.docType, { seedTemplateId: seed.id })}
                />
              ) : null}
            </div>
          </div>
          <span className="chip">总数: {page.total}</span>
        </div>
        <LibraryPage
          docs={docs}
          loading={listLoading}
          error={listError}
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
          onOpenSchedule={(doc) => setSchedulePanelTemplate({ id: doc.id, name: doc.name, docType: doc.docType })}
        />
        <DataEndpointManagerPanel open={dataEndpointPanelOpen} onClose={() => setDataEndpointPanelOpen(false)} />
        <TemplateSchedulePanel open={Boolean(schedulePanelTemplate)} template={schedulePanelTemplate ?? undefined} onClose={() => setSchedulePanelTemplate(null)} />
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
          <span className="brand">{displayTitle}</span>
          <span className="chip">{currentRecord.docType}</span>
          <span className="chip status-published">已发布</span>
          <span className="chip">更新于 {formatUiTime(currentRecord.updatedAt)}</span>
          <span className="chip">当前查看: {previewSnapshotDoc ? "动态快照" : "发布版"}</span>
          {runtimeHint ? <span className="chip">{runtimeHint}</span> : null}
          {actionError ? <span className="chip" style={{ color: "#b91c1c" }}>{actionError}</span> : null}
          <div className="row">
            <button className="btn" onClick={() => void loadDetail(currentRecord.id)}>
              刷新
            </button>
            {currentDetailDoc.templateVariables?.length ? (
              <button className={`btn ${detailVariablePanelOpen ? "primary" : ""}`} onClick={() => setDetailVariablePanelOpen((value) => !value)}>
                运行变量
              </button>
            ) : null}
            <button className="btn" disabled={previewLoading} onClick={() => void runTemplatePreview()}>
              {previewLoading ? "预览中..." : "动态预览"}
            </button>
            {previewSnapshotDoc ? (
              <button className="btn" onClick={clearTemplatePreview}>
                还原模板视图
              </button>
            ) : null}
            <button className="btn" disabled={exportLoading} onClick={() => void runTemplateExport()}>
              {exportLoading ? "导出中..." : currentRecord.docType === "dashboard" ? "导出快照" : "生成并下载"}
            </button>
            <button
              className="btn"
              onClick={() =>
                openScheduleForTemplate({
                  id: currentRecord.id,
                  name: currentRecord.name,
                  docType: currentRecord.docType,
                  templateVariables: currentDetailDoc.templateVariables,
                  defaultVariables: detailVariableValues
                })
              }
            >
              定时任务
            </button>
            <button className="btn" onClick={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "present" })}>
              沉浸预览
            </button>
            <button className="btn primary" disabled={!canEdit} onClick={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "edit" })}>
              进入编辑
            </button>
            <button className="btn" onClick={() => setRoute({ page: "library" })}>
              返回列表
            </button>
          </div>
        </div>
        <DetailPage
          record={currentRecord}
          doc={activeDetailDoc!}
          variablePanelOpen={detailVariablePanelOpen}
          variableDefs={currentDetailDoc.templateVariables ?? []}
          variableValues={detailVariableValues}
          resolvedVariables={previewResolvedVariables}
          exportRun={lastExportRun}
          onVariableChange={updateDetailVariableValue}
        />
        <TemplateSchedulePanel open={Boolean(schedulePanelTemplate)} template={schedulePanelTemplate ?? undefined} onClose={() => setSchedulePanelTemplate(null)} />
      </div>
    );
  }

  if (route.mode === "present") {
    return (
      <PresentationPage
        record={currentRecord}
        doc={activeDetailDoc!}
        onBack={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "view" })}
      />
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
        <span className="brand">{displayTitle}</span>
        <span className="chip">{currentRecord.docType}</span>
        <span className="chip status-published">发布版本</span>
        <span className="chip">当前版本: r{currentRecord.currentRevision}</span>
        <span className={`chip ${isEditDirty ? "chip-warning" : ""}`}>{isEditDirty ? "本地未发布修改" : "与发布版本一致"}</span>
        <span className="chip">未发布修改仅保存在当前浏览器会话</span>
        {runtimeHint ? <span className="chip">{runtimeHint}</span> : null}
        {actionError ? <span className="chip" style={{ color: "#b91c1c" }}>{actionError}</span> : null}
        <div className="row">
          <button className="btn" onClick={restorePublished} disabled={!isEditDirty}>
            恢复发布版
          </button>
          <button className="btn primary" disabled={!canPublish} onClick={() => void publishDoc(currentRecord.id)}>
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
        key={`${editSession.docId}_${editSession.baseRevision}`}
        initialDoc={editSession.seed}
        onDocChange={onEditDocSnapshot}
      >
        <AppLayout advanced={advancedMode} />
      </EditorProvider>
    </div>
  );
}

function CreateTemplatePanel({
  blankOptions,
  seeds,
  seedsLoading,
  seedsError,
  onRetrySeeds,
  onCreateBlank,
  onCreateFromSeed
}: {
  blankOptions: BlankTemplateOption[];
  seeds: DocSeedTemplate[];
  seedsLoading: boolean;
  seedsError?: string;
  onRetrySeeds: () => void;
  onCreateBlank: (option: BlankTemplateOption) => void;
  onCreateFromSeed: (seed: DocSeedTemplate) => void;
}): JSX.Element {
  const groupedSeeds = useMemo(() => {
    return DOC_TYPES.map((docType) => ({
      docType,
      label: DOC_TYPE_LABELS[docType],
      items: seeds.filter((item) => item.docType === docType)
    })).filter((group) => group.items.length > 0);
  }, [seeds]);

  return (
    <div className="toolbar-pop create-template-pop">
      <div className="toolbar-pop-title">空白创建</div>
      <div className="create-template-grid">
        {blankOptions.map((option) => (
          <button key={option.id} className="create-template-card" onClick={() => onCreateBlank(option)}>
            <span className="create-template-icon">{option.icon}</span>
            <span className="create-template-name">{option.label}</span>
            <span className="create-template-desc">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-pop-title">从示例创建</div>
      {seedsLoading ? <div className="create-template-empty">正在加载示例模板...</div> : null}
      {seedsError ? (
        <div className="create-template-empty">
          <span>{seedsError}</span>
          <button className="btn" onClick={onRetrySeeds}>
            重试
          </button>
        </div>
      ) : null}
      {!seedsLoading && !seedsError ? (
        groupedSeeds.length > 0 ? (
          <div className="create-template-groups">
            {groupedSeeds.map((group) => (
              <div key={group.docType} className="create-template-group">
                <div className="create-template-group-title">{group.label}</div>
                <div className="create-template-grid create-template-grid-seed">
                  {group.items.map((seed) => (
                    <button key={seed.id} className="create-template-card create-template-card-seed" onClick={() => onCreateFromSeed(seed)}>
                      <span className="create-template-name">{seed.name}</span>
                      <span className="create-template-desc">{seed.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="create-template-empty">当前没有可用示例模板。</div>
        )
      ) : null}
    </div>
  );
}

function LibraryPage({
  docs,
  loading,
  error,
  filters,
  pageIndex,
  pageSize,
  total,
  onFiltersChange,
  onRetry,
  onOpen,
  onEdit,
  onOpenSchedule
}: {
  docs: DocMeta[];
  loading: boolean;
  error?: string;
  filters: { type: EditorDocType | "all"; q: string; page: number; pageSize: number };
  pageIndex: number;
  pageSize: number;
  total: number;
  onFiltersChange: (next: Partial<{ type: EditorDocType | "all"; q: string; page: number; pageSize: number }>) => void;
  onRetry: () => void;
  onOpen: (docId: string) => void;
  onEdit: (docId: string, docType: EditorDocType) => void;
  onOpenSchedule: (doc: Pick<DocMeta, "id" | "name" | "docType">) => void;
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
        <span className="chip">数据源: 后端 API</span>
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
              <span className="chip status-published">已发布</span>
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
              <button className="btn" onClick={() => onOpenSchedule(item)}>
                定时任务
              </button>
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

function DetailPage({
  record,
  doc,
  variablePanelOpen,
  variableDefs,
  variableValues,
  resolvedVariables,
  exportRun,
  onVariableChange
}: {
  record: DocMeta;
  doc: VDoc;
  variablePanelOpen: boolean;
  variableDefs: TemplateVariableDef[];
  variableValues: Record<string, unknown>;
  resolvedVariables: Record<string, unknown>;
  exportRun: TemplateRun | null;
  onVariableChange: (key: string, value: unknown, variable?: TemplateVariableDef) => void;
}): JSX.Element {
  const resolvedEntries = Object.entries(resolvedVariables);
  return (
    <div className="runtime-shell">
      <div className="runtime-header">
        <div className="col" style={{ gap: 4 }}>
          <strong>{record.name}</strong>
          <span className="muted">{record.description}</span>
        </div>
        <div className="row">
          <span className="chip">当前查看: 发布版</span>
          <span className="chip">类型: {record.docType}</span>
        </div>
      </div>
      {variablePanelOpen && variableDefs.length > 0 ? (
        <div className="runtime-variable-panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>运行变量</strong>
            <span className="muted">preview / export / schedule 共用同一套变量定义</span>
          </div>
          <TemplateVariableForm
            variables={variableDefs}
            values={variableValues}
            onChange={(key, value) => {
              const variable = variableDefs.find((item) => item.key === key);
              onVariableChange(key, value, variable);
            }}
            compact
          />
        </div>
      ) : null}
      {resolvedEntries.length > 0 ? (
        <div className="runtime-variable-panel" style={{ paddingTop: 0 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <strong>本次预览变量</strong>
            {resolvedEntries.map(([key, value]) => (
              <span key={key} className="chip">
                {key}={formatRuntimeValue(value)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {exportRun ? (
        <div className="runtime-variable-panel" style={{ paddingTop: 0 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>最近导出</strong>
            <span className="chip">状态: {exportRun.status}</span>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {exportRun.artifacts.map((artifact) => (
              <a key={artifact.id} className="runtime-artifact-link" href={artifact.downloadUrl} target="_blank" rel="noreferrer">
                <strong>{artifact.fileName}</strong>
                <span className="muted">{artifact.artifactType}</span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
      <div className="runtime-body">
        <DocRuntimeView doc={doc} />
      </div>
    </div>
  );
}

function PresentationPage({
  record,
  doc,
  onBack
}: {
  record: DocMeta;
  doc: VDoc;
  onBack: () => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [presentationSettings, setPresentationSettings] = useState<PresentationRuntimeSettings>(() => loadPresentationRuntimeSettings());
  const [tenFootMode, setTenFootMode] = useState<boolean>(() =>
    shouldUseTenFootLayout(typeof window === "undefined" ? 0 : window.innerWidth, typeof window === "undefined" ? 0 : window.innerHeight)
  );
  const hideTimerRef = useRef<number | null>(null);

  const clearToolbarTimer = useCallback((): void => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const armToolbarAutoHide = useCallback(
    (delayMs = 2600): void => {
      clearToolbarTimer();
      hideTimerRef.current = window.setTimeout(() => setToolbarVisible(false), delayMs);
    },
    [clearToolbarTimer]
  );

  const wakeToolbar = useCallback(
    (delayMs = 2600): void => {
      setToolbarVisible(true);
      armToolbarAutoHide(delayMs);
    },
    [armToolbarAutoHide]
  );

  const syncFullscreenState = useCallback((): void => {
    const host = hostRef.current;
    const element = typeof document !== "undefined" ? document.fullscreenElement : null;
    setFullscreen(!!host && element === host);
  }, []);

  useEffect(() => {
    syncFullscreenState();
    const onFullscreenChange = (): void => {
      syncFullscreenState();
      wakeToolbar(2600);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [syncFullscreenState, wakeToolbar]);

  useEffect(() => {
    const onResize = (): void => {
      setTenFootMode(shouldUseTenFootLayout(window.innerWidth, window.innerHeight));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => clearToolbarTimer, [clearToolbarTimer]);

  useEffect(() => {
    savePresentationRuntimeSettings(presentationSettings);
  }, [presentationSettings]);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const host = hostRef.current;
    if (!host || typeof document === "undefined") {
      return;
    }
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen();
      } else {
        await host.requestFullscreen();
      }
    } catch (error) {
      // 失败时只提示，不中断沉浸预览。
      console.warn(`[present] fullscreen 切换失败: ${toErrorText(error)}`);
    }
  }, []);

  const onTopPointerMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (event.clientY <= 24) {
        wakeToolbar(2600);
      }
    },
    [wakeToolbar]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Shift" && event.key !== "Control" && event.key !== "Alt" && event.key !== "Meta") {
        wakeToolbar(3200);
      }
      if (isTypingTarget(event.target as HTMLElement | null)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        onBack();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack, toggleFullscreen, wakeToolbar]);

  return (
    <div
      ref={hostRef}
      className={`presentation-shell doc-${doc.docType} fit-${presentationSettings.fitMode} pad-${presentationSettings.paddingMode} ${toolbarVisible ? "toolbar-visible" : "toolbar-hidden"} ${tenFootMode ? "ten-foot" : ""}`}
      onMouseMove={onTopPointerMove}
      onMouseLeave={() => armToolbarAutoHide(800)}
    >
      <div className="presentation-top-hitarea" onMouseEnter={() => wakeToolbar(2600)} onTouchStart={() => wakeToolbar(2600)} />
      <div className={`presentation-toolbar ${toolbarVisible ? "show" : "hide"}`} onMouseEnter={() => wakeToolbar(3400)} onMouseLeave={() => armToolbarAutoHide(1200)}>
        <div className="row">
          <strong>{record.name}</strong>
          <span className="chip">{record.docType}</span>
          <span className="chip">{tenFootMode ? "10ft 大屏模式" : "标准模式"}</span>
          <span className="chip">当前查看: 发布版</span>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPresentationSettings((current) => ({ ...current, fitMode: current.fitMode === "fill" ? "contain" : "fill" }))}>
            {presentationSettings.fitMode === "fill" ? "铺满优先" : "完整显示"}
          </button>
          <button className="btn" onClick={() => setPresentationSettings((current) => ({ ...current, paddingMode: current.paddingMode === "edge" ? "comfortable" : "edge" }))}>
            {presentationSettings.paddingMode === "edge" ? "贴边显示" : "标准边距"}
          </button>
          <button className="btn" onClick={() => void toggleFullscreen()}>
            {fullscreen ? "退出全屏(F)" : "全屏(F)"}
          </button>
          <button className="btn primary" onClick={onBack}>
            退出沉浸(Esc)
          </button>
        </div>
      </div>
      <div className="presentation-stage">
        <DocRuntimeView doc={doc} immersive presentationSettings={presentationSettings} />
      </div>
    </div>
  );
}

/**
 * 编辑态沉浸预览：
 * - 不切换路由，直接复用当前编辑中的文档快照；
 * - 复用运行态渲染链路，确保“所见即所得”。
 */
function EditorPresentationOverlay({
  doc,
  onClose
}: {
  doc: VDoc;
  onClose: () => void;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [presentationSettings, setPresentationSettings] = useState<PresentationRuntimeSettings>(() => loadPresentationRuntimeSettings());
  const [tenFootMode, setTenFootMode] = useState<boolean>(() =>
    shouldUseTenFootLayout(typeof window === "undefined" ? 0 : window.innerWidth, typeof window === "undefined" ? 0 : window.innerHeight)
  );
  const hideTimerRef = useRef<number | null>(null);

  const clearToolbarTimer = useCallback((): void => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const armToolbarAutoHide = useCallback(
    (delayMs = 2600): void => {
      clearToolbarTimer();
      hideTimerRef.current = window.setTimeout(() => setToolbarVisible(false), delayMs);
    },
    [clearToolbarTimer]
  );

  const wakeToolbar = useCallback(
    (delayMs = 2600): void => {
      setToolbarVisible(true);
      armToolbarAutoHide(delayMs);
    },
    [armToolbarAutoHide]
  );

  const syncFullscreenState = useCallback((): void => {
    const host = hostRef.current;
    const element = typeof document !== "undefined" ? document.fullscreenElement : null;
    setFullscreen(!!host && element === host);
  }, []);

  useEffect(() => {
    syncFullscreenState();
    const onFullscreenChange = (): void => {
      syncFullscreenState();
      wakeToolbar(2600);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [syncFullscreenState, wakeToolbar]);

  useEffect(() => {
    const onResize = (): void => {
      setTenFootMode(shouldUseTenFootLayout(window.innerWidth, window.innerHeight));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => clearToolbarTimer, [clearToolbarTimer]);

  useEffect(() => {
    savePresentationRuntimeSettings(presentationSettings);
  }, [presentationSettings]);

  const toggleFullscreen = useCallback(async (): Promise<void> => {
    const host = hostRef.current;
    if (!host || typeof document === "undefined") {
      return;
    }
    try {
      if (document.fullscreenElement === host) {
        await document.exitFullscreen();
      } else {
        await host.requestFullscreen();
      }
    } catch (error) {
      console.warn(`[editor-present] fullscreen 切换失败: ${toErrorText(error)}`);
    }
  }, []);

  const onTopPointerMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>): void => {
      if (event.clientY <= 24) {
        wakeToolbar(2600);
      }
    },
    [wakeToolbar]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Shift" && event.key !== "Control" && event.key !== "Alt" && event.key !== "Meta") {
        wakeToolbar(3200);
      }
      if (isTypingTarget(event.target as HTMLElement | null)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
        return;
      }
      if (key === "p" && event.shiftKey) {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        }
        onClose();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (document.fullscreenElement) {
          void document.exitFullscreen();
          return;
        }
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, toggleFullscreen, wakeToolbar]);

  return (
    <div
      ref={hostRef}
      className={`presentation-shell doc-${doc.docType} fit-${presentationSettings.fitMode} pad-${presentationSettings.paddingMode} ${toolbarVisible ? "toolbar-visible" : "toolbar-hidden"} ${tenFootMode ? "ten-foot" : ""}`}
      onMouseMove={onTopPointerMove}
      onMouseLeave={() => armToolbarAutoHide(800)}
    >
      <div className="presentation-top-hitarea" onMouseEnter={() => wakeToolbar(2600)} onTouchStart={() => wakeToolbar(2600)} />
      <div className={`presentation-toolbar ${toolbarVisible ? "show" : "hide"}`} onMouseEnter={() => wakeToolbar(3400)} onMouseLeave={() => armToolbarAutoHide(1200)}>
        <div className="row">
          <strong>{doc.title || "沉浸预览"}</strong>
          <span className="chip">{doc.docType}</span>
          <span className="chip">编辑态实时预览</span>
          <span className="chip">{tenFootMode ? "10ft 大屏模式" : "标准模式"}</span>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setPresentationSettings((current) => ({ ...current, fitMode: current.fitMode === "fill" ? "contain" : "fill" }))}>
            {presentationSettings.fitMode === "fill" ? "铺满优先" : "完整显示"}
          </button>
          <button className="btn" onClick={() => setPresentationSettings((current) => ({ ...current, paddingMode: current.paddingMode === "edge" ? "comfortable" : "edge" }))}>
            {presentationSettings.paddingMode === "edge" ? "贴边显示" : "标准边距"}
          </button>
          <button className="btn" onClick={() => void toggleFullscreen()}>
            {fullscreen ? "退出全屏(F)" : "全屏(F)"}
          </button>
          <button className="btn primary" onClick={onClose}>
            返回编辑(Shift+P / Esc)
          </button>
        </div>
      </div>
      <div className="presentation-stage">
        <DocRuntimeView doc={doc} immersive presentationSettings={presentationSettings} />
      </div>
    </div>
  );
}

const toErrorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 10ft 体验判定：宽屏或高分辨率时自动放大交互控件与间距。
 * 这里使用保守阈值，避免普通笔记本误进入大屏模式。
 */
export const shouldUseTenFootLayout = (width: number, height: number): boolean => width >= 1700 || (width >= 1440 && height >= 900);

const formatUiTime = (iso: string): string => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return iso;
  }
  return dt.toLocaleString("zh-CN", { hour12: false });
};

const formatRuntimeValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const resolveActionError = (action: string, error: unknown): string => {
  if (error instanceof DocApiError && error.status === 409) {
    return `${action}失败：版本冲突，请刷新后重试。`;
  }
  return `${action}失败：${toErrorText(error)}`;
};

const isTypingTarget = (target: HTMLElement | null): boolean =>
  !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

const INSPECTOR_WIDTH_STORAGE_KEY = "chatbi.editor.inspectorWidth";
const DEFAULT_INSPECTOR_WIDTH = 380;
const MIN_INSPECTOR_WIDTH = 340;
const MAX_INSPECTOR_WIDTH = 520;

const clampInspectorWidth = (value: number): number => Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, Math.round(value)));

const loadInspectorWidth = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_INSPECTOR_WIDTH;
  }
  const raw = window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? clampInspectorWidth(parsed) : DEFAULT_INSPECTOR_WIDTH;
};

function AppLayout({ advanced }: { advanced: boolean }): JSX.Element {
  // 产品策略：默认简化模式，开启“更多设置”后进入 analyst 能力层。
  const persona: Persona = advanced ? "analyst" : "novice";
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const pendingPlan = useSignalValue(store.pendingPlan);
  const preview = useSignalValue(store.pendingPlanDryRun);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"inspector" | "ai">("inspector");
  const [aiQuickDockOpen, setAiQuickDockOpen] = useState(false);
  const [aiQuickPrompt, setAiQuickPrompt] = useState("将当前图表改为折线并开启平滑与标签");
  const [aiQuickPlan, setAiQuickPlan] = useState("");
  const [aiQuickExplain, setAiQuickExplain] = useState("");
  const [presentPreviewOpen, setPresentPreviewOpen] = useState(false);
  const [inspectorWidth, setInspectorWidth] = useState(loadInspectorWidth);
  const [inspectorResizing, setInspectorResizing] = useState(false);
  const inspectorResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!advanced) {
      setShowFilterPanel(false);
      setShowBatchPanel(false);
    }
  }, [advanced]);

  useEffect(() => {
    setRightPanelTab("inspector");
    setAiQuickDockOpen(false);
    setAiQuickPlan("");
    setAiQuickExplain("");
    setPresentPreviewOpen(false);
  }, [doc?.docType, doc?.docId]);

  useEffect(() => {
    if (rightPanelTab === "ai") {
      setAiQuickDockOpen(false);
    }
  }, [rightPanelTab]);

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    if (!inspectorResizing) {
      return;
    }
    const handleMouseMove = (event: MouseEvent): void => {
      const state = inspectorResizeRef.current;
      if (!state) {
        return;
      }
      const delta = state.startX - event.clientX;
      setInspectorWidth(clampInspectorWidth(state.startWidth + delta));
    };
    const handleMouseUp = (): void => {
      inspectorResizeRef.current = null;
      setInspectorResizing(false);
    };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [inspectorResizing]);

  const beginInspectorResize = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    inspectorResizeRef.current = {
      startX: event.clientX,
      startWidth: inspectorWidth
    };
    setInspectorResizing(true);
  };

  const inferredQuickPlan = useMemo(
    () => inferCommandPlan(aiQuickPrompt, selection.primaryId, doc?.root),
    [aiQuickPrompt, doc?.root, selection.primaryId]
  );

  const aiQuickTelemetryContext = {
    docType: doc?.docType,
    nodeId: selection.primaryId
  };

  const generateQuickPlan = (): void => {
    setAiQuickPlan(JSON.stringify(inferredQuickPlan, null, 2));
    setAiQuickExplain(explainPlan(inferredQuickPlan));
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "success",
      surface: "ai_quick_dock",
      action: "generate_plan",
      source: "rule",
      context: aiQuickTelemetryContext,
      meta: {
        promptLength: aiQuickPrompt.trim().length,
        commandCount: inferredQuickPlan.commands.length
      }
    });
  };

  const previewQuickPlan = (): void => {
    const sourcePlan = aiQuickPlan || inferredQuickPlan;
    const ok = store.previewPlan(sourcePlan);
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "preview",
      surface: "ai_quick_dock",
      action: "preview_plan",
      source: "rule",
      context: aiQuickTelemetryContext,
      meta: {
        ok,
        promptLength: aiQuickPrompt.trim().length
      }
    });
  };

  const explainQuickPlan = (): void => {
    try {
      const plan = aiQuickPlan.trim() ? (JSON.parse(aiQuickPlan) as CommandPlan) : inferredQuickPlan;
      setAiQuickExplain(explainPlan(plan));
      emitAiTelemetry({
        traceId: createAiTraceId(),
        stage: "success",
        surface: "ai_quick_dock",
        action: "explain_plan",
        source: "rule",
        context: aiQuickTelemetryContext,
        meta: {
          fromRawPlan: Boolean(aiQuickPlan.trim()),
          commandCount: plan.commands.length
        }
      });
    } catch {
      setAiQuickExplain("命令解释失败：CommandPlan JSON 不合法。");
      emitAiTelemetry({
        traceId: createAiTraceId(),
        stage: "error",
        surface: "ai_quick_dock",
        action: "explain_plan",
        source: "rule",
        context: aiQuickTelemetryContext,
        errorCode: "invalid_plan_json",
        errorMessage: "CommandPlan JSON parse failed"
      });
    }
  };

  const acceptQuickPreview = (): void => {
    const ok = store.acceptPreview("ai");
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "accept",
      surface: "ai_quick_dock",
      action: "accept_preview",
      source: "rule",
      context: aiQuickTelemetryContext,
      meta: { ok }
    });
    if (ok) {
      setAiQuickDockOpen(false);
    }
  };

  const rejectQuickPreview = (): void => {
    const hadPending = Boolean(store.pendingPlan.value);
    store.rejectPreview();
    emitAiTelemetry({
      traceId: createAiTraceId(),
      stage: "reject",
      surface: "ai_quick_dock",
      action: "reject_preview",
      source: "rule",
      context: aiQuickTelemetryContext,
      meta: { hadPending }
    });
  };

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

  const applyContainerAlign = (kind: AlignKind, summary: string): void => {
    const doc = store.doc.value;
    if (!doc) {
      return;
    }
    const { commands } = buildAlignToContainerCommandResult(doc.root, store.selection.value.selectedIds, kind);
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
        id: "align.container.left",
        label: "贴左(容器)",
        shortcut: "Ctrl/Cmd+K → 容器贴左",
        keywords: ["container", "align", "left", "贴左", "容器"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyContainerAlign("left", "align container left")
      },
      {
        id: "align.container.hcenter",
        label: "水平居中(容器)",
        shortcut: "Ctrl/Cmd+K → 容器水平居中",
        keywords: ["container", "align", "center", "居中", "容器"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyContainerAlign("hcenter", "align container hcenter")
      },
      {
        id: "align.container.right",
        label: "贴右(容器)",
        shortcut: "Ctrl/Cmd+K → 容器贴右",
        keywords: ["container", "align", "right", "贴右", "容器"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyContainerAlign("right", "align container right")
      },
      {
        id: "align.container.top",
        label: "贴顶(容器)",
        shortcut: "Ctrl/Cmd+K → 容器贴顶",
        keywords: ["container", "align", "top", "贴顶", "容器"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyContainerAlign("top", "align container top")
      },
      {
        id: "align.container.vcenter",
        label: "垂直居中(容器)",
        shortcut: "Ctrl/Cmd+K → 容器垂直居中",
        keywords: ["container", "align", "middle", "垂直居中", "容器"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyContainerAlign("vcenter", "align container vcenter")
      },
      {
        id: "align.container.bottom",
        label: "贴底(容器)",
        shortcut: "Ctrl/Cmd+K → 容器贴底",
        keywords: ["container", "align", "bottom", "贴底", "容器"],
        group: "Layout",
        personas: ["designer", "analyst"],
        run: () => applyContainerAlign("bottom", "align container bottom")
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
        if (!isTyping && key === "p" && event.shiftKey) {
          event.preventDefault();
          setPresentPreviewOpen(true);
          return;
        }
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
      <div className="editor-shell">
        <EditorTopToolbar
          persona={persona}
          showFilterPanel={showFilterPanel}
          onToggleFilterPanel={() => setShowFilterPanel((value) => !value)}
          showBatchPanel={showBatchPanel}
          onToggleBatchPanel={() => setShowBatchPanel((value) => !value)}
          onOpenCommandPalette={() => setShowCommandPalette(true)}
          onOpenPresentPreview={() => setPresentPreviewOpen(true)}
        />
        <section
          className={`editor-workspace doc-${doc?.docType ?? "unknown"} ${inspectorResizing ? "is-resizing" : ""}`}
          style={{ ["--editor-side-right-width" as string]: `${inspectorWidth}px` }}
        >
          {doc?.docType === "dashboard" ? null : (
            <aside className="panel editor-side-left">
              <DocOutlinePanel />
            </aside>
          )}
          <section className="panel editor-main-stage">
            <CanvasPanel
              persona={persona}
              showFilterPanel={showFilterPanel}
              onToggleFilterPanel={() => setShowFilterPanel((value) => !value)}
              showBatchPanel={showBatchPanel}
              onToggleBatchPanel={() => setShowBatchPanel((value) => !value)}
              showInlineNavigator={doc?.docType !== "ppt"}
            />
          </section>
          <aside className="panel editor-side-right ai-side-panel">
            <div
              className={`editor-side-resizer ${inspectorResizing ? "active" : ""}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整属性面板宽度"
              onMouseDown={beginInspectorResize}
            />
            <div className="panel-header">
              <div className="tabs">
                <button className={`tab-btn ${rightPanelTab === "inspector" ? "active" : ""}`} onClick={() => setRightPanelTab("inspector")}>
                  属性
                </button>
                <button className={`tab-btn ${rightPanelTab === "ai" ? "active" : ""}`} onClick={() => setRightPanelTab("ai")}>
                  AI
                </button>
              </div>
            </div>
            <div className="right-panel-body">
              {rightPanelTab === "inspector" ? <InspectorPanel persona={persona} /> : <ChatBridgePanel persona={persona} />}
            </div>
            {rightPanelTab === "inspector" ? (
              <>
                <button
                  className={`ai-quick-fab ${aiQuickDockOpen ? "active" : ""}`}
                  title="AI 快捷入口"
                  onClick={() => setAiQuickDockOpen((value) => !value)}
                >
                  AI
                </button>
                {aiQuickDockOpen ? (
                  <div className="ai-quick-dock">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>AI 快捷入口</strong>
                      <button className="btn mini-btn" onClick={() => setAiQuickDockOpen(false)}>
                        收起
                      </button>
                    </div>
                    <div className="row">
                      <input className="input" value={aiQuickPrompt} onChange={(event) => setAiQuickPrompt(event.target.value)} placeholder="例如：把当前图表改成柱状图并开启标签" />
                    </div>
                    <div className="row">
                      <button className="btn" onClick={generateQuickPlan}>
                        生成
                      </button>
                      <button className="btn primary" onClick={previewQuickPlan}>
                        预览
                      </button>
                      <button className="btn" onClick={explainQuickPlan}>
                        解释
                      </button>
                    </div>
                    <label className="col">
                      <span className="muted" style={{ fontSize: 12 }}>
                        CommandPlan JSON
                      </span>
                      <textarea className="textarea ai-quick-plan-textarea" value={aiQuickPlan} onChange={(event) => setAiQuickPlan(event.target.value)} />
                    </label>
                    {preview ? (
                      <div className="col ai-quick-preview">
                        <strong>Diff Preview</strong>
                        <span className="muted">{preview.summary}</span>
                        <span className="muted">patches: {preview.patches.length}</span>
                        <span className="muted">risk: {pendingPlan?.preview?.risk ?? "low"}</span>
                        <ul className="diff-list">
                          {preview.changedPaths.slice(0, 12).map((path) => (
                            <li key={path}>{path}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {aiQuickExplain ? (
                      <div className="col ai-quick-preview">
                        <strong>命令解释</strong>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{aiQuickExplain}</pre>
                      </div>
                    ) : null}
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div className="row">
                        <button className="btn primary" disabled={!pendingPlan} onClick={acceptQuickPreview}>
                          应用
                        </button>
                        <button className="btn" disabled={!pendingPlan} onClick={rejectQuickPreview}>
                          取消
                        </button>
                      </div>
                      <button
                        className="btn"
                        onClick={() => {
                          setRightPanelTab("ai");
                          setAiQuickDockOpen(false);
                        }}
                      >
                        打开完整 AI
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
          </aside>
        </section>
      </div>
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} persona={persona} commands={commands} />
      {presentPreviewOpen && doc ? (
        <EditorPresentationOverlay doc={doc} onClose={() => setPresentPreviewOpen(false)} />
      ) : null}
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

export const parseRouteFromHash = (hash: string): RouteState => {
  // 支持 #/docs -> 列表；#/docs/{id} -> 运行态；#/docs/{id}/edit -> 编辑态；#/docs/{id}/present -> 沉浸态
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
  const mode = parts[2] === "edit" ? "edit" : parts[2] === "present" ? "present" : "view";
  return { page: "detail", docId, mode };
};

export const routeToHash = (route: RouteState): string => {
  if (route.page === "library") {
    return "#/docs";
  }
  const encoded = encodeURIComponent(route.docId);
  if (route.mode === "edit") {
    return `#/docs/${encoded}/edit`;
  }
  if (route.mode === "present") {
    return `#/docs/${encoded}/present`;
  }
  return `#/docs/${encoded}`;
};
