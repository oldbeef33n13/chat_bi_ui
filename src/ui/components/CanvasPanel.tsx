import { lazy, Suspense, useState } from "react";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { DocType } from "../../core/doc/types";
import { AdvancedFilterPanel } from "./AdvancedFilterPanel";
import { BatchOpsPanel } from "./BatchOpsPanel";
import type { Persona } from "../types/persona";

// 场景级懒加载：按文档类型拆分 Dashboard/Report/PPT 编辑器 chunk。
const loadDashboardEditor = () => import("../editors/DashboardEditor");
const loadReportEditor = () => import("../editors/ReportEditor");
const loadPptEditor = () => import("../editors/PptEditor");

const DashboardEditorLazy = lazy(async () => {
  const mod = await loadDashboardEditor();
  return { default: mod.DashboardEditor };
});

const ReportEditorLazy = lazy(async () => {
  const mod = await loadReportEditor();
  return { default: mod.ReportEditor };
});

const PptEditorLazy = lazy(async () => {
  const mod = await loadPptEditor();
  return { default: mod.PptEditor };
});

export const preloadEditorChunk = (docType: DocType): void => {
  if (docType === "dashboard") {
    void loadDashboardEditor();
    return;
  }
  if (docType === "report") {
    void loadReportEditor();
    return;
  }
  if (docType === "ppt") {
    void loadPptEditor();
  }
};

interface CanvasPanelProps {
  persona?: Persona;
  showFilterPanel?: boolean;
  onToggleFilterPanel?: () => void;
  showBatchPanel?: boolean;
  onToggleBatchPanel?: () => void;
  showInlineNavigator?: boolean;
}

export function CanvasPanel({
  persona = "analyst",
  showFilterPanel: externalShowFilterPanel,
  onToggleFilterPanel,
  showBatchPanel: externalShowBatchPanel,
  onToggleBatchPanel,
  showInlineNavigator = true
}: CanvasPanelProps): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const [internalShowFilterPanel, setInternalShowFilterPanel] = useState(false);
  const [internalShowBatchPanel, setInternalShowBatchPanel] = useState(false);
  const showFilterPanel = externalShowFilterPanel ?? internalShowFilterPanel;
  const showBatchPanel = externalShowBatchPanel ?? internalShowBatchPanel;
  const toggleFilterPanel = onToggleFilterPanel ?? (() => setInternalShowFilterPanel((value) => !value));
  const toggleBatchPanel = onToggleBatchPanel ?? (() => setInternalShowBatchPanel((value) => !value));

  if (!doc) {
    return <div className="panel-body muted">empty document</div>;
  }

  return (
    <div className="canvas-studio">
      {showBatchPanel && persona !== "novice" ? (
        <div style={{ marginBottom: 10 }}>
          <BatchOpsPanel />
        </div>
      ) : null}
      {showFilterPanel && persona !== "novice" ? (
        <div style={{ marginBottom: 10 }}>
          <AdvancedFilterPanel />
        </div>
      ) : null}
      <Suspense fallback={<EditorLoading docType={doc.docType} />}>
        {doc.docType === "dashboard" ? <DashboardEditorLazy doc={doc} /> : null}
        {doc.docType === "report" ? <ReportEditorLazy doc={doc} /> : null}
        {doc.docType === "ppt" ? <PptEditorLazy doc={doc} showNavigator={showInlineNavigator} /> : null}
      </Suspense>
      {persona !== "novice" ? (
        <div className="canvas-studio-hints">
          <button className={`btn ${showBatchPanel ? "primary" : ""}`} onClick={toggleBatchPanel}>
            批量修改
          </button>
          <button className={`btn ${showFilterPanel ? "primary" : ""}`} onClick={toggleFilterPanel}>
            高级过滤
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EditorLoading({ docType }: { docType: DocType }): JSX.Element {
  return (
    <div className="col" style={{ minHeight: 220, justifyContent: "center", alignItems: "center" }}>
      <div className="chip">正在加载 {docType} 编辑器...</div>
      <div className="muted" style={{ fontSize: 12 }}>
        已启用场景级分块加载
      </div>
    </div>
  );
}
