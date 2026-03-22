import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ensureSampleChartRuntimeData } from "../../core/doc/defaults";
import type { TemplateVariableDef, VDoc } from "../../core/doc/types";
import type { RouteState } from "../app/shared";
import type { TemplateRuntimeRepository, TemplateArtifact, TemplateRun } from "../api/template-runtime-repository";
import { templateOutputByDocType } from "../api/template-runtime-repository";
import type { TemplateContent, TemplateMeta, TemplateRepository } from "../api/template-repository";
import { TemplateApiError } from "../api/template-repository";
import { buildTemplateVariableDefaults, coerceTemplateVariableValue } from "../utils/template-variables";

interface TemplateDetailState {
  meta: TemplateMeta;
  content: TemplateContent;
}

interface UseTemplateDetailControllerArgs {
  route: RouteState;
  docs: TemplateMeta[];
  repo: TemplateRepository;
  runtimeRepo: TemplateRuntimeRepository;
}

interface UseTemplateDetailControllerResult {
  detail: TemplateDetailState | null;
  detailLoading: boolean;
  detailError?: string;
  currentRecord?: TemplateMeta;
  actionError?: string;
  runtimeHint?: string;
  detailVariablePanelOpen: boolean;
  detailVariableValues: Record<string, unknown>;
  previewSnapshotDoc: VDoc | null;
  previewResolvedVariables: Record<string, unknown>;
  previewLoading: boolean;
  exportLoading: boolean;
  lastExportRun: TemplateRun | null;
  setDetail: Dispatch<SetStateAction<TemplateDetailState | null>>;
  setActionError: (next?: string) => void;
  setRuntimeHint: (next?: string) => void;
  setDetailVariablePanelOpen: Dispatch<SetStateAction<boolean>>;
  setLastExportRun: (next: TemplateRun | null) => void;
  loadDetail: (docId: string) => Promise<void>;
  updateDetailVariableValue: (key: string, value: unknown, variable?: TemplateVariableDef) => void;
  runTemplatePreview: () => Promise<void>;
  clearTemplatePreview: () => void;
  runTemplateExport: () => Promise<void>;
}

const EMPTY_VALUES: Record<string, unknown> = Object.freeze({});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

const toErrorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const resolveActionError = (action: string, error: unknown): string => {
  if (error instanceof TemplateApiError && error.status === 409) {
    return `${action}失败：版本冲突，请刷新后重试。`;
  }
  return `${action}失败：${toErrorText(error)}`;
};

const sameTemplateRunState = (left: TemplateRun | null, right: TemplateRun | null): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.id === right.id && left.status === right.status && left.errorMessage === right.errorMessage && left.artifacts.length === right.artifacts.length;
};

const pickPreferredArtifact = (docType: TemplateMeta["docType"], artifacts: TemplateArtifact[]): TemplateArtifact | undefined => {
  if (docType === "report") {
    return artifacts.find((item) => item.artifactType === "report_docx") ?? artifacts[0];
  }
  if (docType === "ppt") {
    return artifacts.find((item) => item.artifactType === "ppt_pptx") ?? artifacts[0];
  }
  return artifacts.find((item) => item.artifactType === "dashboard_snapshot_json") ?? artifacts[0];
};

export const useTemplateDetailController = ({
  route,
  docs,
  repo,
  runtimeRepo
}: UseTemplateDetailControllerArgs): UseTemplateDetailControllerResult => {
  const [detail, setDetail] = useState<TemplateDetailState | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string>();
  const [actionError, setActionErrorState] = useState<string>();
  const [runtimeHint, setRuntimeHintState] = useState<string>();
  const [detailVariablePanelOpen, setDetailVariablePanelOpen] = useState(false);
  const [detailVariableValues, setDetailVariableValues] = useState<Record<string, unknown>>(EMPTY_VALUES);
  const [previewSnapshotDoc, setPreviewSnapshotDoc] = useState<VDoc | null>(null);
  const [previewResolvedVariables, setPreviewResolvedVariables] = useState<Record<string, unknown>>(EMPTY_VALUES);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [lastExportRun, setLastExportRunState] = useState<TemplateRun | null>(null);
  const detailRequestSeqRef = useRef(0);
  const previewRequestSeqRef = useRef(0);
  const exportRequestSeqRef = useRef(0);

  const currentRecord = useMemo(
    () => (route.page === "detail" ? detail?.meta ?? docs.find((item) => item.id === route.docId) : undefined),
    [detail?.meta, docs, route]
  );

  const setActionError = useCallback((next?: string): void => {
    setActionErrorState((current) => (current === next ? current : next));
  }, []);

  const setRuntimeHint = useCallback((next?: string): void => {
    setRuntimeHintState((current) => (current === next ? current : next));
  }, []);

  const setLastExportRun = useCallback((next: TemplateRun | null): void => {
    setLastExportRunState((current) => (sameTemplateRunState(current, next) ? current : next));
  }, []);

  const loadDetail = useCallback(
    async (docId: string): Promise<void> => {
      const requestSeq = ++detailRequestSeqRef.current;
      setDetailLoading(true);
      setDetailError(undefined);
      try {
        const [meta, content] = await Promise.all([repo.getTemplateMeta(docId), repo.getTemplateContent(docId)]);
        if (requestSeq !== detailRequestSeqRef.current) {
          return;
        }
        setDetail({
          meta,
          content: {
            ...content,
            doc: ensureSampleChartRuntimeData(content.doc)
          }
        });
      } catch (error) {
        if (requestSeq !== detailRequestSeqRef.current) {
          return;
        }
        setDetail(null);
        setDetailError(toErrorText(error));
      } finally {
        if (requestSeq === detailRequestSeqRef.current) {
          setDetailLoading(false);
        }
      }
    },
    [repo]
  );

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
    if (!detail?.content.doc || route.page !== "detail" || route.mode === "edit") {
      return;
    }
    setDetailVariableValues(buildTemplateVariableDefaults(detail.content.doc.templateVariables));
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables(EMPTY_VALUES);
    setLastExportRun(null);
  }, [detail?.content.doc, route.page, route.page === "detail" ? route.mode : "view", setLastExportRun]);

  useEffect(() => {
    if (route.page !== "detail") {
      detailRequestSeqRef.current += 1;
      setDetail(null);
      setDetailError(undefined);
      setDetailLoading(false);
      return;
    }
    void loadDetail(route.docId);
  }, [loadDetail, route]);

  const updateDetailVariableValue = useCallback((key: string, value: unknown, variable?: TemplateVariableDef): void => {
    setDetailVariableValues((prev) => ({
      ...prev,
      [key]: variable ? coerceTemplateVariableValue(variable, value) : value
    }));
  }, []);

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
  }, [currentRecord, detailVariableValues, route, runtimeRepo, setActionError, setRuntimeHint]);

  const clearTemplatePreview = useCallback((): void => {
    setPreviewSnapshotDoc(null);
    setPreviewResolvedVariables(EMPTY_VALUES);
    setRuntimeHint("已还原模板视图");
  }, [setRuntimeHint]);

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
  }, [currentRecord, detailVariableValues, route, runtimeRepo, setActionError, setLastExportRun, setRuntimeHint]);

  return {
    detail,
    detailLoading,
    detailError,
    currentRecord,
    actionError,
    runtimeHint,
    detailVariablePanelOpen,
    detailVariableValues,
    previewSnapshotDoc,
    previewResolvedVariables,
    previewLoading,
    exportLoading,
    lastExportRun,
    setDetail,
    setActionError,
    setRuntimeHint,
    setDetailVariablePanelOpen,
    setLastExportRun,
    loadDetail,
    updateDetailVariableValue,
    runTemplatePreview,
    clearTemplatePreview,
    runTemplateExport
  };
};
