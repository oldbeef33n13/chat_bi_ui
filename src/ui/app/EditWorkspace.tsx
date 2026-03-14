import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Command, VDoc, VNode } from "../../core/doc/types";
import { CommandPalette, type PaletteCommand } from "../components/CommandPalette";
import { CanvasPanel } from "../components/CanvasPanel";
import { DocOutlinePanel } from "../components/DocOutlinePanel";
import { EditorTopToolbar } from "../components/EditorTopToolbar";
import { InspectorPanel } from "../components/InspectorPanel";
import { useEditorStore } from "../state/editor-context";
import { buildAlignCommands, buildAlignToContainerCommandResult, type AlignKind } from "../utils/alignment";
import type { Persona } from "../types/persona";
import { EditorPresentationOverlay } from "./PresentationShell";

const INSPECTOR_WIDTH_STORAGE_KEY = "chatbi.editor.inspectorWidth";
const DEFAULT_INSPECTOR_WIDTH = 380;
const MIN_INSPECTOR_WIDTH = 340;
const MAX_INSPECTOR_WIDTH = 520;

interface WorkspaceDocMeta {
  docId?: string;
  docType?: "dashboard" | "report" | "ppt" | "chart";
}

const sameWorkspaceDocMeta = (left: WorkspaceDocMeta, right: WorkspaceDocMeta): boolean =>
  left.docId === right.docId && left.docType === right.docType;

const readWorkspaceDocMeta = (doc: VDoc | null): WorkspaceDocMeta => ({
  docId: doc?.docId,
  docType: doc?.docType
});

const clampInspectorWidth = (value: number): number => Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, Math.round(value)));

const loadInspectorWidth = (): number => {
  if (typeof window === "undefined") {
    return DEFAULT_INSPECTOR_WIDTH;
  }
  const raw = window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? clampInspectorWidth(parsed) : DEFAULT_INSPECTOR_WIDTH;
};

export function EditWorkspace({ advanced }: { advanced: boolean }): JSX.Element {
  const persona: Persona = advanced ? "analyst" : "novice";
  const store = useEditorStore();
  const docRef = useRef(store.doc.value);
  const [docMeta, setDocMeta] = useState<WorkspaceDocMeta>(() => readWorkspaceDocMeta(docRef.current));
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [presentPreviewOpen, setPresentPreviewOpen] = useState(false);
  const [presentPreviewRevision, setPresentPreviewRevision] = useState(0);
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
    setPresentPreviewOpen(false);
  }, [docMeta.docId, docMeta.docType]);

  useEffect(() => {
    const unsubscribe = store.doc.subscribe(() => {
      const nextDoc = store.doc.value;
      docRef.current = nextDoc;
      const nextMeta = readWorkspaceDocMeta(nextDoc);
      setDocMeta((current) => (sameWorkspaceDocMeta(current, nextMeta) ? current : nextMeta));
      if (presentPreviewOpen) {
        setPresentPreviewRevision((value) => value + 1);
      }
    });
    return unsubscribe;
  }, [presentPreviewOpen, store.doc]);

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

  const applyAllChartsLabel = (): void => {
    const currentDoc = store.doc.value;
    if (!currentDoc) {
      return;
    }
    const chartIds = collectNodes(currentDoc.root, (node) => node.kind === "chart").map((node) => node.id);
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
      { summary: "all labels on" }
    );
  };

  const removeSelection = (): void => {
    const currentDoc = store.doc.value;
    const selected = store.selection.value.selectedIds;
    if (!currentDoc || selected.length === 0) {
      return;
    }
    const removable = pruneSelectedForRemoval(currentDoc.root, selected);
    const commands: Command[] = removable.map((nodeId) => ({ type: "RemoveNode", nodeId }));
    store.executeCommand({ type: "Transaction", commands }, { summary: "remove selection" });
    store.clearSelection();
  };

  const applyAlign = (kind: AlignKind, summary: string): void => {
    const currentDoc = store.doc.value;
    if (!currentDoc) {
      return;
    }
    const commands = buildAlignCommands(currentDoc.root, store.selection.value.selectedIds, kind);
    if (commands.length === 0) {
      return;
    }
    store.executeCommand({ type: "Transaction", commands }, { summary });
  };

  const applyContainerAlign = (kind: AlignKind, summary: string): void => {
    const currentDoc = store.doc.value;
    if (!currentDoc) {
      return;
    }
    const { commands } = buildAlignToContainerCommandResult(currentDoc.root, store.selection.value.selectedIds, kind);
    if (commands.length === 0) {
      return;
    }
    store.executeCommand({ type: "Transaction", commands }, { summary });
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
        run: applyAllChartsLabel
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
        applyAllChartsLabel();
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
          className={`editor-workspace doc-${docMeta.docType ?? "unknown"} ${inspectorResizing ? "is-resizing" : ""}`}
          style={{ ["--editor-side-right-width" as string]: `${inspectorWidth}px` }}
        >
          {docMeta.docType === "dashboard" ? null : (
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
              showInlineNavigator={docMeta.docType !== "ppt"}
            />
          </section>
          <aside className="panel editor-side-right">
            <div
              className={`editor-side-resizer ${inspectorResizing ? "active" : ""}`}
              role="separator"
              aria-orientation="vertical"
              aria-label="调整属性面板宽度"
              onMouseDown={beginInspectorResize}
            />
            <div className="panel-header">
              <span>属性</span>
            </div>
            <div className="right-panel-body">
              <InspectorPanel persona={persona} />
            </div>
          </aside>
        </section>
      </div>
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} persona={persona} commands={commands} />
      {presentPreviewOpen && docRef.current ? (
        <EditorPresentationOverlay
          key={`${docMeta.docId ?? "doc"}:${presentPreviewRevision}`}
          doc={docRef.current}
          onClose={() => setPresentPreviewOpen(false)}
        />
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
