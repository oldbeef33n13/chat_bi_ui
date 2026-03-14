import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { TemplateVariableDef, VDoc } from "../../core/doc/types";
import type { TemplateMeta } from "../api/template-repository";
import { DocRuntimeView } from "../components/DocRuntimeView";
import { TemplateVariableForm } from "../components/TemplateVariableForm";
import {
  loadPresentationRuntimeSettings,
  savePresentationRuntimeSettings,
  type PresentationRuntimeSettings
} from "../utils/presentation-settings";
import { isTypingTarget, shouldUseTenFootLayout } from "./shared";

export function PresentationPage({
  record,
  doc,
  variableDefs = [],
  variableValues = {},
  resolvedVariables = {},
  previewLoading = false,
  previewSnapshotActive = false,
  onVariableChange,
  onApplyVariables,
  onResetPreview,
  onBack
}: {
  record: TemplateMeta;
  doc: VDoc;
  variableDefs?: TemplateVariableDef[];
  variableValues?: Record<string, unknown>;
  resolvedVariables?: Record<string, unknown>;
  previewLoading?: boolean;
  previewSnapshotActive?: boolean;
  onVariableChange?: (key: string, value: unknown, variable?: TemplateVariableDef) => void;
  onApplyVariables?: () => void;
  onResetPreview?: () => void;
  onBack: () => void;
}): JSX.Element {
  return (
    <PresentationFrame
      title={record.name}
      doc={doc}
      chips={[
        <span key="doctype" className="chip">
          {record.docType}
        </span>,
        <span key="mode" className="chip">
          当前查看: {previewSnapshotActive ? "动态快照" : "发布版"}
        </span>
      ]}
      variableDefs={variableDefs}
      variableValues={variableValues}
      resolvedVariables={resolvedVariables}
      previewLoading={previewLoading}
      previewSnapshotActive={previewSnapshotActive}
      onVariableChange={onVariableChange}
      onApplyVariables={onApplyVariables}
      onResetPreview={onResetPreview}
      exitLabel="退出沉浸(Esc)"
      onClose={onBack}
    />
  );
}

export function EditorPresentationOverlay({
  doc,
  onClose
}: {
  doc: VDoc;
  onClose: () => void;
}): JSX.Element {
  return (
    <PresentationFrame
      title={doc.title || "沉浸预览"}
      doc={doc}
      chips={[
        <span key="doctype" className="chip">
          {doc.docType}
        </span>,
        <span key="mode" className="chip">
          编辑态实时预览
        </span>
      ]}
      exitLabel="返回编辑(Shift+P / Esc)"
      onClose={onClose}
      closeOnShiftP
      fullscreenWarnPrefix="[editor-present]"
    />
  );
}

function PresentationFrame({
  title,
  doc,
  chips,
  variableDefs = [],
  variableValues = {},
  resolvedVariables = {},
  previewLoading = false,
  previewSnapshotActive = false,
  onVariableChange,
  onApplyVariables,
  onResetPreview,
  exitLabel,
  onClose,
  closeOnShiftP = false,
  fullscreenWarnPrefix = "[present]"
}: {
  title: string;
  doc: VDoc;
  chips: JSX.Element[];
  variableDefs?: TemplateVariableDef[];
  variableValues?: Record<string, unknown>;
  resolvedVariables?: Record<string, unknown>;
  previewLoading?: boolean;
  previewSnapshotActive?: boolean;
  onVariableChange?: (key: string, value: unknown, variable?: TemplateVariableDef) => void;
  onApplyVariables?: () => void;
  onResetPreview?: () => void;
  exitLabel: string;
  onClose: () => void;
  closeOnShiftP?: boolean;
  fullscreenWarnPrefix?: string;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(closeOnShiftP);
  const [presentationSettings, setPresentationSettings] = useState<PresentationRuntimeSettings>(() => loadPresentationRuntimeSettings());
  const [tenFootMode, setTenFootMode] = useState<boolean>(() =>
    shouldUseTenFootLayout(typeof window === "undefined" ? 0 : window.innerWidth, typeof window === "undefined" ? 0 : window.innerHeight)
  );
  const [variablePanelOpen, setVariablePanelOpen] = useState(false);
  const hideTimerRef = useRef<number | null>(null);
  const resolvedEntries = useMemo(() => Object.entries(resolvedVariables), [resolvedVariables]);
  const hasRuntimeVariables = variableDefs.length > 0 && Boolean(onVariableChange) && Boolean(onApplyVariables);

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
      console.warn(`${fullscreenWarnPrefix} fullscreen 切换失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [fullscreenWarnPrefix]);

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
      if (closeOnShiftP && key === "p" && event.shiftKey) {
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
  }, [closeOnShiftP, onClose, toggleFullscreen, wakeToolbar]);

  return (
    <div
      ref={hostRef}
      className={`presentation-shell doc-${doc.docType} fit-${presentationSettings.fitMode} pad-${presentationSettings.paddingMode} ${toolbarVisible ? "toolbar-visible" : "toolbar-hidden"} ${tenFootMode ? "ten-foot" : ""}`}
      onMouseMove={onTopPointerMove}
      onMouseLeave={() => armToolbarAutoHide(800)}
    >
      <div className="presentation-top-hitarea" onMouseEnter={() => wakeToolbar(2600)} onTouchStart={() => wakeToolbar(2600)} />
      <div className={`presentation-toolbar ${toolbarVisible ? "show" : "hide"}`} onMouseEnter={() => wakeToolbar(3400)} onMouseLeave={() => armToolbarAutoHide(1200)}>
        <div className="presentation-toolbar-main">
          <div className="row presentation-toolbar-group">
            <strong>{title}</strong>
            {chips}
            <span className="chip">{tenFootMode ? "10ft 大屏模式" : "标准模式"}</span>
            {resolvedEntries.map(([key, value]) => (
              <span key={key} className="chip">
                {key}={String(value)}
              </span>
            ))}
          </div>
          <div className="row presentation-toolbar-group presentation-toolbar-controls">
            {hasRuntimeVariables ? (
              <button className={`btn ${variablePanelOpen ? "primary" : ""}`} onClick={() => setVariablePanelOpen((current) => !current)}>
                {variablePanelOpen ? "收起参数" : "运行参数"}
              </button>
            ) : null}
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
              {exitLabel}
            </button>
          </div>
        </div>
        {hasRuntimeVariables && variablePanelOpen ? (
          <div className="presentation-toolbar-panel">
            <div className="row presentation-toolbar-panel-head" style={{ justifyContent: "space-between" }}>
              <strong>运行参数</strong>
              <span className="muted">时间、区域等运行变量统一在沉浸态顶部维护</span>
            </div>
            <TemplateVariableForm
              variables={variableDefs}
              values={variableValues}
              compact
              showHint={false}
              onChange={(key, value) => {
                const variable = variableDefs.find((item) => item.key === key);
                onVariableChange?.(key, value, variable);
              }}
            />
            <div className="row presentation-toolbar-panel-actions">
              <button className="btn primary" disabled={previewLoading} onClick={() => onApplyVariables?.()}>
                {previewLoading ? "更新中..." : "更新预览"}
              </button>
              {previewSnapshotActive ? (
                <button className="btn" onClick={() => onResetPreview?.()}>
                  恢复模板
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      <div className="presentation-stage">
        <DocRuntimeView doc={doc} immersive presentationSettings={presentationSettings} />
      </div>
    </div>
  );
}
