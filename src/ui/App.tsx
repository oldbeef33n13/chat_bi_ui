import { useEffect, useMemo, useState } from "react";
import type { Command, DocType, VNode } from "../core/doc/types";
import { listBuiltInDocExamples, resolveDocExampleId } from "../core/doc/examples";
import { CanvasPanel, preloadEditorChunk } from "./components/CanvasPanel";
import { ChatBridgePanel } from "./components/ChatBridgePanel";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { InspectorPanel } from "./components/InspectorPanel";
import { TreePanel } from "./components/TreePanel";
import { EditorProvider, useEditorStore } from "./state/editor-context";
import { buildAlignCommands, type AlignKind } from "./utils/alignment";
import type { Persona } from "./types/persona";

const docTypes: Array<{ label: string; value: DocType }> = [
  { label: "Dashboard", value: "dashboard" },
  { label: "Report", value: "report" },
  { label: "PPT", value: "ppt" }
];

export function App(): JSX.Element {
  const [docType, setDocType] = useState<DocType>(() => parseRouteFromHash(window.location.hash).docType);
  const [exampleId, setExampleId] = useState<string>(() => {
    const route = parseRouteFromHash(window.location.hash);
    return resolveDocExampleId(route.docType, route.exampleId);
  });
  const [persona, setPersona] = useState<Persona>("analyst");
  const exampleOptions = listBuiltInDocExamples(docType);

  useEffect(() => {
    const onHashChange = (): void => {
      const route = parseRouteFromHash(window.location.hash);
      setDocType(route.docType);
      setExampleId(resolveDocExampleId(route.docType, route.exampleId));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const resolved = resolveDocExampleId(docType, exampleId);
    if (resolved !== exampleId) {
      setExampleId(resolved);
    }
  }, [docType, exampleId]);

  useEffect(() => {
    const nextHash = docTypeToHash(docType, exampleId);
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, [docType, exampleId]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="brand">Visual Document OS</span>
        <div className="tabs">
          {docTypes.map((tab) => (
            <button
              key={tab.value}
              className={`tab-btn ${docType === tab.value ? "active" : ""}`}
              onMouseEnter={() => preloadEditorChunk(tab.value)}
              onFocus={() => preloadEditorChunk(tab.value)}
              onClick={() => {
                setDocType(tab.value);
                setExampleId(resolveDocExampleId(tab.value));
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <select className="select" value={exampleId} onChange={(event) => setExampleId(event.target.value)} style={{ minWidth: 220 }}>
          {exampleOptions.map((item) => (
            <option key={item.id} value={item.id}>
              样例: {item.name}
            </option>
          ))}
        </select>
        <select className="select" value={persona} onChange={(event) => setPersona(event.target.value as Persona)} style={{ maxWidth: 140 }}>
          <option value="novice">小白模式</option>
          <option value="analyst">分析模式</option>
          <option value="designer">设计模式</option>
          <option value="ai">AI协作模式</option>
        </select>
        <span className="chip">React + Signals + ECharts</span>
      </div>
      <EditorProvider docType={docType} exampleId={exampleId}>
        <AppLayout persona={persona} />
      </EditorProvider>
    </div>
  );
}

function AppLayout({ persona }: { persona: Persona }): JSX.Element {
  const store = useEditorStore();
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

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
      if ((key === "y") || (key === "z" && event.shiftKey)) {
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

const parseRouteFromHash = (hash: string): { docType: DocType; exampleId?: string } => {
  const cleaned = hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = cleaned.split("?");
  const rawType = path.toLowerCase();
  const docType: DocType = rawType === "dashboard" || rawType === "report" || rawType === "ppt" ? rawType : "dashboard";
  const params = new URLSearchParams(query);
  const exampleId = params.get("example") ?? undefined;
  return { docType, exampleId };
};

const docTypeToHash = (docType: DocType, exampleId?: string): string => {
  if (!exampleId) {
    return `#/${docType}`;
  }
  return `#/${docType}?example=${encodeURIComponent(exampleId)}`;
};
