import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ensureSampleChartRuntimeData } from "../core/doc/defaults";
import type { TemplateVariableDef, VDoc } from "../core/doc/types";
import { preloadEditorChunk } from "./components/CanvasPanel";
import { DataEndpointManagerPanel } from "./components/DataEndpointManagerPanel";
import { TemplateSchedulePanel } from "./components/TemplateSchedulePanel";
import { HttpTemplateRuntimeRepository } from "./api/http-template-runtime-repository";
import type { TemplateArtifact, TemplateRun } from "./api/template-runtime-repository";
import { templateOutputByDocType } from "./api/template-runtime-repository";
import { TemplateApiError, type EditorDocType, type TemplateContent, type TemplateMeta, type TemplateSeed } from "./api/template-repository";
import { CreateTemplatePanel } from "./app/CreateTemplatePanel";
import { DetailPage } from "./app/DetailPage";
import { EditWorkspace } from "./app/EditWorkspace";
import { LibraryPage } from "./app/LibraryPage";
import { PresentationPage } from "./app/PresentationShell";
import { BLANK_TEMPLATE_OPTIONS, formatUiTime, type RouteState } from "./app/shared";
import { useTemplateLibrary } from "./hooks/use-template-library";
import { CopilotEditorBridge } from "./copilot/CopilotEditorBridge";
import { CopilotShell } from "./copilot/CopilotShell";
import { CopilotProvider, useCopilot, useMaybeCopilot, type CopilotRouteScene } from "./copilot/copilot-context";
import { EditorProvider } from "./state/editor-context";
import { setEditorTelemetryContext } from "./telemetry/editor-telemetry";
import { setAiTelemetryContext } from "./telemetry/ai-telemetry";
import { buildTemplateVariableDefaults, coerceTemplateVariableValue } from "./utils/template-variables";

interface EditSession {
  docId: string;
  baselineDoc: VDoc;
  initialDoc: VDoc;
  liveTitle: string;
  baseRevision: number;
  dirty: boolean;
  instanceKey: number;
}

interface TemplateDetailState {
  meta: TemplateMeta;
  content: TemplateContent;
}

interface SchedulePanelTemplateContext {
  id: string;
  name: string;
  docType: EditorDocType;
  templateVariables?: TemplateVariableDef[];
  defaultVariables?: Record<string, unknown>;
}

const sameTemplateRunState = (left: TemplateRun | null, right: TemplateRun | null): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.id === right.id && left.status === right.status && left.errorMessage === right.errorMessage && left.artifacts.length === right.artifacts.length;
};

const cloneDoc = (doc: VDoc): VDoc => structuredClone(doc);
const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));
const SESSION_DRAFT_PREFIX = "chatbi.template.sessionDraft";
const EDIT_DRAFT_PERSIST_DEBOUNCE_MS = 180;
const EMPTY_VALUES: Record<string, unknown> = Object.freeze({});

const buildSessionDraftKey = (docId: string, baseRevision: number): string => `${SESSION_DRAFT_PREFIX}:${docId}:${baseRevision}`;

const requestIdleWork = (callback: () => void): number => {
  const idleWindow = window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback) {
    return idleWindow.requestIdleCallback(() => callback(), { timeout: 240 });
  }
  return window.setTimeout(callback, 0);
};

const cancelIdleWork = (handle: number | null): void => {
  if (handle === null || typeof window === "undefined") {
    return;
  }
  const idleWindow = window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.cancelIdleCallback) {
    idleWindow.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
};

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

const formatCopilotVariableSummary = (values: Record<string, unknown>): string[] =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim().length > 0)
    .slice(0, 3)
    .map(([key, value]) => `${key}=${String(value)}`);

const buildCopilotRouteScene = ({
  route,
  currentRecord,
  currentDoc,
  variableValues,
  docTitleOverride
}: {
  route: RouteState;
  currentRecord?: TemplateMeta;
  currentDoc?: VDoc;
  variableValues: Record<string, unknown>;
  docTitleOverride?: string;
}): CopilotRouteScene => {
  if (route.page === "library") {
    return {
      sceneId: "library",
      sceneKind: "library",
      title: "文档中心",
      routeMode: "library",
      variableSummary: [],
      capabilities: ["打开模板", "查看场景能力", "启动 Copilot"],
      supportsChat: false,
      supportsDropArtifacts: false
    };
  }
  const rawDocType = currentRecord?.docType ?? currentDoc?.docType;
  const docType = rawDocType === "dashboard" || rawDocType === "report" || rawDocType === "ppt" ? rawDocType : undefined;
  const docTitle = docTitleOverride ?? currentDoc?.title ?? currentRecord?.name ?? "未命名文档";
  if (route.mode === "edit" && docType === "dashboard") {
    return {
      sceneId: `detail:${route.docId}:edit`,
      sceneKind: "dashboard_edit",
      title: "Dashboard 编辑",
      routeMode: "edit",
      docId: route.docId,
      docType,
      docTitle,
      variableSummary: formatCopilotVariableSummary(variableValues),
      capabilities: ["改当前图表", "生成新图表", "调整布局", "生成总结"],
      supportsChat: true,
      supportsDropArtifacts: true
    };
  }
  if (route.mode === "edit" && docType === "report") {
    return {
      sceneId: `detail:${route.docId}:edit`,
      sceneKind: "report_edit",
      title: "Report 编辑",
      routeMode: "edit",
      docId: route.docId,
      docType,
      docTitle,
      variableSummary: formatCopilotVariableSummary(variableValues),
      capabilities: ["生成大纲", "生成章节", "重写本章", "插入图表"],
      supportsChat: true,
      supportsDropArtifacts: true
    };
  }
  if (route.mode === "edit" && docType === "ppt") {
    return {
      sceneId: `detail:${route.docId}:edit`,
      sceneKind: "ppt_edit",
      title: "PPT 编辑",
      routeMode: "edit",
      docId: route.docId,
      docType,
      docTitle,
      variableSummary: formatCopilotVariableSummary(variableValues),
      capabilities: ["生成页纲", "补下一页", "重写当前页", "优化表达"],
      supportsChat: true,
      supportsDropArtifacts: true
    };
  }
  if (docType === "dashboard") {
    return {
      sceneId: `detail:${route.docId}:${route.mode}`,
      sceneKind: "dashboard_runtime",
      title: "Dashboard 运行态",
      routeMode: route.mode,
      docId: route.docId,
      docType,
      docTitle,
      variableSummary: formatCopilotVariableSummary(variableValues),
      capabilities: ["解释当前图", "下钻分析", "转成模块草稿", "进入编辑态复用"],
      supportsChat: true,
      supportsDropArtifacts: false
    };
  }
  if (docType === "report") {
    return {
      sceneId: `detail:${route.docId}:${route.mode}`,
      sceneKind: "report_runtime",
      title: "Report 运行态",
      routeMode: route.mode,
      docId: route.docId,
      docType,
      docTitle,
      variableSummary: formatCopilotVariableSummary(variableValues),
      capabilities: ["总结本章", "全文总结", "继续分析", "保存为章节"],
      supportsChat: true,
      supportsDropArtifacts: false
    };
  }
  return {
    sceneId: `detail:${route.docId}:${route.mode}`,
    sceneKind: "ppt_runtime",
    title: "PPT 运行态",
    routeMode: route.mode,
    docId: route.docId,
    docType: docType ?? "ppt",
    docTitle,
    variableSummary: formatCopilotVariableSummary(variableValues),
    capabilities: ["当前页总结", "汇报摘要", "继续分析", "转为新页"],
    supportsChat: true,
    supportsDropArtifacts: false
  };
};

/**
 * 应用主壳：承接文档中心 -> 详情运行态 -> 编辑态完整闭环。
 * 当前只保留路由、数据加载、发布/预览/导出等编排逻辑。
 */
function AppContent(): JSX.Element {
  const { updateRouteScene } = useCopilot();
  const [route, setRoute] = useState<RouteState>(() => parseRouteFromHash(window.location.hash));
  const { repo, page, loading: listLoading, error: listError, filters, refresh, createTemplate } = useTemplateLibrary();
  const runtimeRepo = useMemo(() => new HttpTemplateRuntimeRepository("/api/v1"), []);
  const docs = page.items;
  const [advancedMode, setAdvancedMode] = useState(false);
  const [createTemplatePanelOpen, setCreateTemplatePanelOpen] = useState(false);
  const [dataEndpointPanelOpen, setDataEndpointPanelOpen] = useState(false);
  const [schedulePanelTemplate, setSchedulePanelTemplate] = useState<SchedulePanelTemplateContext | null>(null);
  const [editSession, setEditSession] = useState<EditSession | null>(null);
  const [detail, setDetail] = useState<TemplateDetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [actionErrorState, setActionErrorState] = useState<string>();
  const [runtimeHintState, setRuntimeHintState] = useState<string>();
  const [detailVariablePanelOpen, setDetailVariablePanelOpen] = useState(false);
  const [detailVariableValues, setDetailVariableValues] = useState<Record<string, unknown>>(EMPTY_VALUES);
  const [previewSnapshotDoc, setPreviewSnapshotDoc] = useState<VDoc | null>(null);
  const [previewResolvedVariables, setPreviewResolvedVariables] = useState<Record<string, unknown>>(EMPTY_VALUES);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [lastExportRunState, setLastExportRunState] = useState<TemplateRun | null>(null);
  const [seedTemplates, setSeedTemplates] = useState<TemplateSeed[]>([]);
  const [seedTemplatesLoading, setSeedTemplatesLoading] = useState(false);
  const [seedTemplatesError, setSeedTemplatesError] = useState<string>();
  const editLiveDocRef = useRef<VDoc | null>(null);
  const editLiveDocVersionRef = useRef(0);
  const persistedDraftVersionRef = useRef(0);
  const persistedDraftKeyRef = useRef<string | null>(null);
  const editSessionRef = useRef<EditSession | null>(null);
  const editDraftPersistTimerRef = useRef<number | null>(null);
  const editDraftPersistIdleRef = useRef<number | null>(null);
  const previewRequestSeqRef = useRef(0);
  const exportRequestSeqRef = useRef(0);
  const actionErrorRef = useRef<string | undefined>(undefined);
  const runtimeHintRef = useRef<string | undefined>(undefined);
  const lastExportRunRef = useRef<TemplateRun | null>(null);

  const currentRecord = route.page === "detail" ? detail?.meta ?? docs.find((item) => item.id === route.docId) : undefined;
  const currentDetailDoc = useMemo(() => {
    if (!detail) {
      return undefined;
    }
    if (route.page === "detail" && route.mode === "edit" && editSession?.docId === detail.meta.id) {
      return editSession.initialDoc;
    }
    return detail.content.doc;
  }, [detail, editSession, route]);
  const activeDetailDoc = route.page === "detail" && route.mode !== "edit" ? previewSnapshotDoc ?? currentDetailDoc : currentDetailDoc;
  const displayTitle = useMemo(() => {
    if (route.page !== "detail") {
      return "Visual Document OS";
    }
    const docTitle = route.mode === "edit" ? editSession?.liveTitle : activeDetailDoc?.title;
    if (typeof docTitle === "string" && docTitle.trim().length > 0) {
      return docTitle.trim();
    }
    return currentRecord?.name ?? "Visual Document OS";
  }, [activeDetailDoc?.title, currentRecord?.name, editSession?.liveTitle, route]);
  const isEditDirty = editSession?.dirty ?? false;
  const actionError = actionErrorState;
  const runtimeHint = runtimeHintState;
  const lastExportRun = lastExportRunState;

  const setActionError = useCallback((next?: string): void => {
    actionErrorRef.current = next;
    setActionErrorState((current) => (current === next ? current : next));
  }, []);

  const setRuntimeHint = useCallback((next?: string): void => {
    runtimeHintRef.current = next;
    setRuntimeHintState((current) => (current === next ? current : next));
  }, []);

  const setLastExportRun = useCallback((next: TemplateRun | null): void => {
    lastExportRunRef.current = next;
    setLastExportRunState((current) => (sameTemplateRunState(current, next) ? current : next));
  }, []);

  const flushEditSessionDraft = useCallback((): void => {
    const session = editSessionRef.current;
    if (!session) {
      return;
    }
    const draftKey = buildSessionDraftKey(session.docId, session.baseRevision);
    if (session.dirty && editLiveDocRef.current) {
      if (persistedDraftKeyRef.current === draftKey && persistedDraftVersionRef.current === editLiveDocVersionRef.current) {
        return;
      }
      saveSessionDraft(session.docId, session.baseRevision, editLiveDocRef.current);
      persistedDraftKeyRef.current = draftKey;
      persistedDraftVersionRef.current = editLiveDocVersionRef.current;
      return;
    }
    clearSessionDraft(session.docId, session.baseRevision);
    if (persistedDraftKeyRef.current === draftKey) {
      persistedDraftKeyRef.current = null;
      persistedDraftVersionRef.current = 0;
    }
  }, []);

  const scheduleEditSessionDraftPersist = useCallback(
    (immediate = false): void => {
      if (editDraftPersistTimerRef.current !== null) {
        window.clearTimeout(editDraftPersistTimerRef.current);
        editDraftPersistTimerRef.current = null;
      }
      cancelIdleWork(editDraftPersistIdleRef.current);
      editDraftPersistIdleRef.current = null;
      if (immediate) {
        flushEditSessionDraft();
        return;
      }
      editDraftPersistTimerRef.current = window.setTimeout(() => {
        editDraftPersistTimerRef.current = null;
        editDraftPersistIdleRef.current = requestIdleWork(() => {
          editDraftPersistIdleRef.current = null;
          flushEditSessionDraft();
        });
      }, EDIT_DRAFT_PERSIST_DEBOUNCE_MS);
    },
    [flushEditSessionDraft]
  );

  const loadDetail = useCallback(
    async (docId: string): Promise<void> => {
      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const [meta, content] = await Promise.all([repo.getTemplateMeta(docId), repo.getTemplateContent(docId)]);
        setDetail({
          meta,
          content: {
            ...content,
            doc: ensureSampleChartRuntimeData(content.doc)
          }
        });
      } catch (error) {
        setDetail(null);
        setDetailError(toErrorText(error));
      } finally {
        setDetailLoading(false);
      }
    },
    [repo]
  );

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
    previewRequestSeqRef.current += 1;
    exportRequestSeqRef.current += 1;
    setActionError(undefined);
    setRuntimeHint(undefined);
    setDetailVariablePanelOpen(false);
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables(EMPTY_VALUES);
    setLastExportRun(null);
  }, [route.page === "detail" ? route.docId : "", route.page, route.page === "detail" ? route.mode : ""]);

  useEffect(() => {
    if (route.page !== "library") {
      setDataEndpointPanelOpen(false);
      setCreateTemplatePanelOpen(false);
    }
  }, [route.page]);

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
    setPreviewResolvedVariables(EMPTY_VALUES);
    setLastExportRun(null);
  }, [currentDetailDoc, route.page, route.page === "detail" ? route.mode : "view"]);

  useEffect(() => {
    editSessionRef.current = editSession;
  }, [editSession]);

  useEffect(
    () => () => {
      if (editDraftPersistTimerRef.current !== null) {
        window.clearTimeout(editDraftPersistTimerRef.current);
      }
      cancelIdleWork(editDraftPersistIdleRef.current);
    },
    []
  );

  useEffect(() => {
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
    updateRouteScene(
      buildCopilotRouteScene({
        route,
        currentRecord,
        currentDoc: currentDetailDoc,
        variableValues: detailVariableValues,
        docTitleOverride: route.page === "detail" && route.mode === "edit" ? editSession?.liveTitle : undefined
      })
    );
  }, [currentDetailDoc, currentRecord, detailVariableValues, editSession?.liveTitle, route, updateRouteScene]);

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
      flushEditSessionDraft();
      if (editDraftPersistTimerRef.current !== null) {
        window.clearTimeout(editDraftPersistTimerRef.current);
        editDraftPersistTimerRef.current = null;
      }
      cancelIdleWork(editDraftPersistIdleRef.current);
      editDraftPersistIdleRef.current = null;
      editLiveDocRef.current = null;
      editLiveDocVersionRef.current = 0;
      persistedDraftVersionRef.current = 0;
      persistedDraftKeyRef.current = null;
      editSessionRef.current = null;
      setEditSession(null);
      return;
    }
    if (route.mode !== "edit" || !detail) {
      flushEditSessionDraft();
      if (editDraftPersistTimerRef.current !== null) {
        window.clearTimeout(editDraftPersistTimerRef.current);
        editDraftPersistTimerRef.current = null;
      }
      cancelIdleWork(editDraftPersistIdleRef.current);
      editDraftPersistIdleRef.current = null;
      editLiveDocRef.current = null;
      editLiveDocVersionRef.current = 0;
      persistedDraftVersionRef.current = 0;
      persistedDraftKeyRef.current = null;
      editSessionRef.current = null;
      setEditSession(null);
      return;
    }
    if (editSession?.docId === detail.meta.id && editSession.baseRevision === detail.content.revision) {
      return;
    }
    const baselineDoc = detail.content.doc;
    const localDraft = loadSessionDraft(detail.meta.id, detail.content.revision);
    const initialDoc = localDraft ? cloneDoc(localDraft) : baselineDoc;
    editLiveDocRef.current = initialDoc;
    editLiveDocVersionRef.current = 1;
    persistedDraftVersionRef.current = localDraft ? 1 : 0;
    persistedDraftKeyRef.current = localDraft ? buildSessionDraftKey(detail.meta.id, detail.content.revision) : null;
    const nextSession = {
      docId: detail.meta.id,
      baselineDoc,
      initialDoc,
      liveTitle: initialDoc.title ?? detail.meta.name,
      baseRevision: detail.content.revision,
      dirty: Boolean(localDraft),
      instanceKey: Date.now()
    };
    editSessionRef.current = nextSession;
    setEditSession(nextSession);
    setAdvancedMode(false);
    preloadEditorChunk(detail.meta.docType);
  }, [detail, editSession?.baseRevision, editSession?.docId, flushEditSessionDraft, route]);

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
      const created = await createTemplate({
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

  const onEditDocSnapshot = useCallback(
    (doc: VDoc): void => {
      editLiveDocRef.current = doc;
      editLiveDocVersionRef.current += 1;
      scheduleEditSessionDraftPersist();
      setEditSession((prev) => {
        if (!prev || route.page !== "detail") {
          return prev;
        }
        if (route.mode !== "edit" || prev.docId !== route.docId) {
          return prev;
        }
        const nextTitle = typeof doc.title === "string" ? doc.title : prev.liveTitle;
        if (nextTitle === prev.liveTitle) {
          return prev;
        }
        return { ...prev, liveTitle: nextTitle };
      });
    },
    [route, scheduleEditSessionDraftPersist]
  );

  const onEditDirtyChange = useCallback((dirty: boolean): void => {
    setEditSession((prev) => {
      if (!prev || prev.dirty === dirty) {
        return prev;
      }
      const next = { ...prev, dirty };
      editSessionRef.current = next;
      return next;
    });
    scheduleEditSessionDraftPersist(!dirty);
  }, [scheduleEditSessionDraftPersist]);

  const publishDoc = async (docId: string): Promise<void> => {
    setActionError(undefined);
    setRuntimeHint(undefined);
    try {
      if (route.page !== "detail" || route.mode !== "edit" || !editSession || editSession.docId !== docId) {
        return;
      }
      const liveDoc = editLiveDocRef.current ?? editSession.initialDoc;
      const result = await repo.publishTemplate(docId, {
        doc: liveDoc,
        baseRevision: editSession.baseRevision
      });
      clearAllSessionDrafts(docId);
      setDetail({ meta: result.meta, content: result.content });
      const snapshot = result.content.doc;
      editLiveDocRef.current = snapshot;
      editLiveDocVersionRef.current = 1;
      persistedDraftVersionRef.current = 0;
      persistedDraftKeyRef.current = null;
      const nextSession = {
        docId,
        baselineDoc: snapshot,
        initialDoc: snapshot,
        liveTitle: snapshot.title ?? result.meta.name,
        baseRevision: result.content.revision,
        dirty: false,
        instanceKey: Date.now()
      };
      editSessionRef.current = nextSession;
      setEditSession(nextSession);
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
    const snapshot = detail.content.doc;
    editLiveDocRef.current = snapshot;
    editLiveDocVersionRef.current = 1;
    persistedDraftVersionRef.current = 0;
    persistedDraftKeyRef.current = null;
    const nextSession = {
      docId: editSession.docId,
      baselineDoc: snapshot,
      initialDoc: snapshot,
      liveTitle: snapshot.title ?? detail.meta.name,
      baseRevision: detail.content.revision,
      dirty: false,
      instanceKey: Date.now()
    };
    editSessionRef.current = nextSession;
    setEditSession(nextSession);
    setRuntimeHint("已恢复到发布版本");
  };

  const updateDetailVariableValue = useCallback((key: string, value: unknown, variable?: TemplateVariableDef): void => {
    setDetailVariableValues((prev) => ({
      ...prev,
      [key]: variable ? coerceTemplateVariableValue(variable, value) : value
    }));
  }, []);

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
    const requestSeq = ++previewRequestSeqRef.current;
    setPreviewLoading(true);
    setActionError(undefined);
    setRuntimeHint(undefined);
    try {
      const result = await runtimeRepo.previewTemplate(currentRecord.id, detailVariableValues);
      if (requestSeq !== previewRequestSeqRef.current) {
        return;
      }
      setPreviewSnapshotDoc(result.snapshot);
      setPreviewResolvedVariables(result.resolvedVariables);
      setRuntimeHint("已生成动态预览");
    } catch (error) {
      if (requestSeq !== previewRequestSeqRef.current) {
        return;
      }
      setActionError(resolveActionError("动态预览", error));
    } finally {
      if (requestSeq === previewRequestSeqRef.current) {
        setPreviewLoading(false);
      }
    }
  }, [currentRecord, detailVariableValues, route, runtimeRepo]);

  const clearTemplatePreview = useCallback((): void => {
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables(EMPTY_VALUES);
    setRuntimeHint("已还原模板视图");
  }, []);

  const runTemplateExport = useCallback(async (): Promise<void> => {
    if (!currentRecord || route.page !== "detail" || route.mode === "edit") {
      return;
    }
    const requestSeq = ++exportRequestSeqRef.current;
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
        if (requestSeq !== exportRequestSeqRef.current) {
          return;
        }
        latestRun = await runtimeRepo.getRun(accepted.runId);
        if (latestRun.status === "succeeded" || latestRun.status === "failed") {
          break;
        }
        await sleep(250);
      }
      if (!latestRun) {
        throw new Error("导出任务未返回执行结果");
      }
      if (requestSeq !== exportRequestSeqRef.current) {
        return;
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
      if (requestSeq !== exportRequestSeqRef.current) {
        return;
      }
      setActionError(resolveActionError("导出下载", error));
    } finally {
      if (requestSeq === exportRequestSeqRef.current) {
        setExportLoading(false);
      }
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
        <CopilotShell templates={docs} />
      </div>
    );
  }

  if (detailLoading) {
    return (
      <StateShell onBack={() => setRoute({ page: "library" })}>
        <div className="doc-empty">正在加载文档详情...</div>
        <CopilotShell templates={docs} />
      </StateShell>
    );
  }

  if (detailError) {
    return (
      <StateShell onBack={() => setRoute({ page: "library" })}>
        <div className="doc-empty">{detailError}</div>
        <div className="row" style={{ justifyContent: "center" }}>
          {route.page === "detail" ? (
            <button className="btn" onClick={() => void loadDetail(route.docId)}>
              重试
            </button>
          ) : null}
        </div>
        <CopilotShell templates={docs} />
      </StateShell>
    );
  }

  if (!currentRecord || !currentDetailDoc || !detail) {
    return (
      <StateShell onBack={() => setRoute({ page: "library" })}>
        <div className="doc-empty">文档不存在或已被移除。</div>
        <CopilotShell templates={docs} />
      </StateShell>
    );
  }

  const canEdit = currentRecord.canEdit ?? true;
  const canPublish = currentRecord.canPublish ?? true;
  const detailDocForDisplay = activeDetailDoc as VDoc;

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
          doc={detailDocForDisplay}
          variablePanelOpen={detailVariablePanelOpen}
          variableDefs={currentDetailDoc.templateVariables ?? []}
          variableValues={detailVariableValues}
          resolvedVariables={previewResolvedVariables}
          exportRun={lastExportRun}
          onVariableChange={updateDetailVariableValue}
        />
        <TemplateSchedulePanel open={Boolean(schedulePanelTemplate)} template={schedulePanelTemplate ?? undefined} onClose={() => setSchedulePanelTemplate(null)} />
        <CopilotShell doc={detailDocForDisplay} templates={docs} />
      </div>
    );
  }

  if (route.mode === "present") {
    return (
      <>
        <PresentationPage
          record={currentRecord}
          doc={detailDocForDisplay}
          variableDefs={currentDetailDoc.templateVariables ?? []}
          variableValues={detailVariableValues}
          resolvedVariables={previewResolvedVariables}
          previewLoading={previewLoading}
          previewSnapshotActive={Boolean(previewSnapshotDoc)}
          onVariableChange={updateDetailVariableValue}
          onApplyVariables={() => void runTemplatePreview()}
          onResetPreview={previewSnapshotDoc ? clearTemplatePreview : undefined}
          onBack={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "view" })}
        />
        <CopilotShell doc={detailDocForDisplay} templates={docs} />
      </>
    );
  }

  if (!canEdit) {
    return (
      <StateShell onBack={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "view" })} backLabel="返回运行态">
        <div className="doc-empty">当前账号没有该文档的编辑权限。</div>
        <CopilotShell templates={docs} />
      </StateShell>
    );
  }

  if (!editSession) {
    return (
      <StateShell hideBack>
        <div className="doc-empty">正在初始化编辑器...</div>
        <CopilotShell templates={docs} />
      </StateShell>
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
        key={`${editSession.docId}_${editSession.baseRevision}_${editSession.instanceKey}`}
        initialDoc={editSession.initialDoc}
        baselineDoc={editSession.baselineDoc}
        baseRevision={editSession.baseRevision}
        onDocChange={onEditDocSnapshot}
        onDirtyChange={onEditDirtyChange}
      >
        <CopilotEditorBridge />
        <EditWorkspace advanced={advancedMode} />
        <CopilotShell templates={docs} />
      </EditorProvider>
    </div>
  );
}

export function App(): JSX.Element {
  const copilot = useMaybeCopilot();
  if (!copilot) {
    return (
      <CopilotProvider>
        <AppContent />
      </CopilotProvider>
    );
  }
  return <AppContent />;
}

function StateShell({
  children,
  onBack,
  backLabel = "返回列表",
  hideBack = false
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  hideBack?: boolean;
}): JSX.Element {
  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">Visual Document OS</span>
        {!hideBack && onBack ? (
          <button className="btn" onClick={onBack}>
            {backLabel}
          </button>
        ) : null}
      </div>
      <div className="library-shell">{children}</div>
    </div>
  );
}

const toErrorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const resolveActionError = (action: string, error: unknown): string => {
  if (error instanceof TemplateApiError && error.status === 409) {
    return `${action}失败：版本冲突，请刷新后重试。`;
  }
  return `${action}失败：${toErrorText(error)}`;
};

export const parseRouteFromHash = (hash: string): RouteState => {
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

export { shouldUseTenFootLayout } from "./app/shared";
export type { RouteState } from "./app/shared";
