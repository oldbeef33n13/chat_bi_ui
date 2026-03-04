import { lazy, Suspense, useState } from "react";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { DocType } from "../../core/doc/types";
import { themes } from "../../runtime/theme/themes";
import { AdvancedFilterPanel } from "./AdvancedFilterPanel";
import { BatchOpsPanel } from "./BatchOpsPanel";
import { buildAlignCommands, type AlignKind } from "../utils/alignment";
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
}

export function CanvasPanel({
  persona = "analyst",
  showFilterPanel: externalShowFilterPanel,
  onToggleFilterPanel,
  showBatchPanel: externalShowBatchPanel,
  onToggleBatchPanel
}: CanvasPanelProps): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const [internalShowFilterPanel, setInternalShowFilterPanel] = useState(false);
  const [internalShowBatchPanel, setInternalShowBatchPanel] = useState(false);
  const showFilterPanel = externalShowFilterPanel ?? internalShowFilterPanel;
  const showBatchPanel = externalShowBatchPanel ?? internalShowBatchPanel;
  const toggleFilterPanel = onToggleFilterPanel ?? (() => setInternalShowFilterPanel((value) => !value));
  const toggleBatchPanel = onToggleBatchPanel ?? (() => setInternalShowBatchPanel((value) => !value));

  if (!doc) {
    return (
      <>
        <div className="panel-header">Canvas</div>
        <div className="panel-body muted">empty document</div>
      </>
    );
  }

  const applyTheme = (themeId: string): void => {
    store.executeCommand({ type: "ApplyTheme", scope: "doc", themeId }, { summary: `apply theme ${themeId}` });
  };

  const selectionTheme = (themeId: string): void => {
    if (selection.selectedIds.length === 0) {
      return;
    }
    store.executeCommand({ type: "ApplyTheme", scope: "selection", themeId }, { summary: `apply selection theme ${themeId}` });
  };

  const toggleAllLabels = (): void => {
    const chartIds = collectChartIds(doc.root);
    if (chartIds.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: chartIds.map((nodeId) => ({
          type: "UpdateProps",
          nodeId,
          props: { labelShow: true }
        }))
      },
      { summary: "all charts label on" }
    );
  };

  const alignSelection = (kind: AlignKind, summary: string): void => {
    // 对齐命令统一走 command 链，保证可撤销/审计一致。
    const commands = buildAlignCommands(doc.root, selection.selectedIds, kind);
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

  return (
    <>
      <div className="panel-header">
        <span>Canvas</span>
        <span className="muted">
          {doc.docType} | {doc.docId}
        </span>
      </div>
      <div className="toolbar">
        <button className="btn" onClick={() => store.undo()}>
          Undo
        </button>
        <button className="btn" onClick={() => store.redo()}>
          Redo
        </button>
        <button className="btn" onClick={toggleAllLabels}>
          全图表开标签
        </button>
        <button className="btn" onClick={() => alignSelection("left", "align left")}>
          左对齐
        </button>
        <button className="btn" onClick={() => alignSelection("hcenter", "align hcenter")}>
          居中
        </button>
        <button className="btn" onClick={() => alignSelection("right", "align right")}>
          右对齐
        </button>
        <button className="btn" onClick={() => alignSelection("top", "align top")}>
          顶对齐
        </button>
        <button className="btn" onClick={() => alignSelection("vcenter", "align vcenter")}>
          中线
        </button>
        <button className="btn" onClick={() => alignSelection("bottom", "align bottom")}>
          底对齐
        </button>
        <button className="btn" onClick={() => alignSelection("hdistribute", "distribute horizontal")}>
          水平均分
        </button>
        <button className="btn" onClick={() => alignSelection("vdistribute", "distribute vertical")}>
          垂直均分
        </button>
        {persona !== "novice" ? (
          <button className={`btn ${showBatchPanel ? "primary" : ""}`} onClick={toggleBatchPanel}>
            批量修改
          </button>
        ) : null}
        {persona !== "novice" ? (
          <button className={`btn ${showFilterPanel ? "primary" : ""}`} onClick={toggleFilterPanel}>
            高级过滤
          </button>
        ) : null}
        <select className="select" defaultValue={doc.themeId} onChange={(event) => applyTheme(event.target.value)}>
          {themes.map((theme) => (
            <option key={theme.id} value={theme.id}>
              主题: {theme.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={() => {
            const themeId = themes[1]?.id;
            if (themeId) {
              selectionTheme(themeId);
            }
          }}
        >
          选中应用暗色
        </button>
      </div>
      <div className="panel-body" style={{ height: "calc(100% - 88px)", paddingTop: 8 }}>
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
          {doc.docType === "ppt" ? <PptEditorLazy doc={doc} /> : null}
        </Suspense>
      </div>
    </>
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

const collectChartIds = (node: { id: string; kind: string; children?: any[] }): string[] => {
  const ids: string[] = [];
  const walk = (item: typeof node): void => {
    if (item.kind === "chart") {
      ids.push(item.id);
    }
    item.children?.forEach((child) => walk(child));
  };
  walk(node);
  return ids;
};
