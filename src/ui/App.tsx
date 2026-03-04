import { useEffect, useMemo, useState } from "react";
import type { Command, DocType, VDoc, VNode } from "../core/doc/types";
import { createBuiltInDoc, listBuiltInDocExamples, resolveDocExampleId } from "../core/doc/examples";
import { CanvasPanel, preloadEditorChunk } from "./components/CanvasPanel";
import { ChatBridgePanel } from "./components/ChatBridgePanel";
import { CommandPalette, type PaletteCommand } from "./components/CommandPalette";
import { DocRuntimeView } from "./components/DocRuntimeView";
import { InspectorPanel } from "./components/InspectorPanel";
import { TreePanel } from "./components/TreePanel";
import { EditorProvider, useEditorStore } from "./state/editor-context";
import { buildAlignCommands, type AlignKind } from "./utils/alignment";
import type { Persona } from "./types/persona";

type EditorDocType = Extract<DocType, "dashboard" | "report" | "ppt">;
type WorkspaceStatus = "published" | "draft";

interface WorkspaceDocRecord {
  id: string;
  docType: EditorDocType;
  name: string;
  description: string;
  tags: string[];
  updatedAt: string;
  status: WorkspaceStatus;
  publishedDoc: VDoc;
  draftDoc: VDoc;
}

interface EditSession {
  docId: string;
  seed: VDoc;
  saved: VDoc;
  live: VDoc;
}

type RouteState = { page: "library" } | { page: "detail"; docId: string; mode: "view" | "edit" };

const DOC_TYPES: EditorDocType[] = ["dashboard", "report", "ppt"];

const nowText = (): string => new Date().toLocaleString("zh-CN", { hour12: false });
const cloneDoc = (doc: VDoc): VDoc => structuredClone(doc);

const createWorkspaceSeed = (): WorkspaceDocRecord[] => {
  const now = nowText();
  return DOC_TYPES.flatMap((docType) =>
    listBuiltInDocExamples(docType).map((example) => {
      const built = example.build();
      const id = built.docId;
      return {
        id,
        docType,
        name: built.title ?? example.name,
        description: example.description,
        tags: [docType, "内置样例"],
        updatedAt: now,
        status: "published",
        publishedDoc: cloneDoc(built),
        draftDoc: cloneDoc(built)
      };
    })
  );
};

export function App(): JSX.Element {
  const [route, setRoute] = useState<RouteState>(() => parseRouteFromHash(window.location.hash));
  const [docs, setDocs] = useState<WorkspaceDocRecord[]>(() => createWorkspaceSeed());
  const [advancedMode, setAdvancedMode] = useState(false);
  const [previewDraft, setPreviewDraft] = useState(false);
  const [editSession, setEditSession] = useState<EditSession | null>(null);

  const currentRecord = route.page === "detail" ? docs.find((item) => item.id === route.docId) : undefined;
  const currentDetailDoc = useMemo(() => {
    if (!currentRecord) {
      return undefined;
    }
    if (route.page === "detail" && route.mode === "edit" && editSession?.docId === currentRecord.id) {
      return editSession.live;
    }
    return previewDraft ? currentRecord.draftDoc : currentRecord.publishedDoc;
  }, [currentRecord, editSession, previewDraft, route]);

  const isEditDirty = useMemo(() => {
    if (!editSession) {
      return false;
    }
    return JSON.stringify(editSession.live) !== JSON.stringify(editSession.saved);
  }, [editSession]);

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
  }, [route.page === "detail" ? route.docId : "", route.page, route.page === "detail" ? route.mode : ""]);

  useEffect(() => {
    if (route.page !== "detail") {
      setEditSession(null);
      return;
    }
    if (route.mode !== "edit" || !currentRecord) {
      setEditSession(null);
      return;
    }
    if (editSession?.docId === currentRecord.id) {
      return;
    }
    const seed = cloneDoc(currentRecord.draftDoc);
    setEditSession({
      docId: currentRecord.id,
      seed,
      saved: cloneDoc(seed),
      live: cloneDoc(seed)
    });
    setAdvancedMode(false);
    preloadEditorChunk(currentRecord.docType);
  }, [currentRecord, editSession?.docId, route]);

  const createDoc = (docType: EditorDocType): void => {
    const exampleId = resolveDocExampleId(docType);
    const example = listBuiltInDocExamples(docType).find((item) => item.id === exampleId);
    const built = createBuiltInDoc(docType, exampleId);
    const now = nowText();
    const record: WorkspaceDocRecord = {
      id: built.docId,
      docType,
      name: built.title ?? example?.name ?? `${docType} 新文档`,
      description: example?.description ?? "新建文档",
      tags: [docType, "新建"],
      updatedAt: now,
      status: "draft",
      publishedDoc: cloneDoc(built),
      draftDoc: cloneDoc(built)
    };
    setDocs((prev) => [record, ...prev]);
    setRoute({ page: "detail", docId: record.id, mode: "edit" });
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

  const saveDraft = (): void => {
    if (!editSession) {
      return;
    }
    const next = cloneDoc(editSession.live);
    const updatedAt = nowText();
    setDocs((prev) =>
      prev.map((item) =>
        item.id === editSession.docId
          ? {
              ...item,
              draftDoc: next,
              status: "draft",
              updatedAt,
              name: next.title ?? item.name
            }
          : item
      )
    );
    setEditSession((prev) => (prev ? { ...prev, saved: cloneDoc(prev.live) } : prev));
  };

  const publishDraft = (docId: string): void => {
    const sourceDoc = route.page === "detail" && route.mode === "edit" && editSession?.docId === docId ? editSession.live : currentRecord?.draftDoc;
    if (!sourceDoc) {
      return;
    }
    const next = cloneDoc(sourceDoc);
    const updatedAt = nowText();
    setDocs((prev) =>
      prev.map((item) =>
        item.id === docId
          ? {
              ...item,
              publishedDoc: next,
              draftDoc: next,
              status: "published",
              updatedAt,
              name: next.title ?? item.name
            }
          : item
      )
    );
    setEditSession((prev) => (prev && prev.docId === docId ? { ...prev, saved: cloneDoc(prev.live) } : prev));
    setPreviewDraft(false);
  };

  const discardDraft = (docId: string): void => {
    setDocs((prev) =>
      prev.map((item) =>
        item.id === docId
          ? {
              ...item,
              draftDoc: cloneDoc(item.publishedDoc),
              status: "published",
              updatedAt: nowText()
            }
          : item
      )
    );
    if (editSession?.docId === docId) {
      const published = docs.find((item) => item.id === docId)?.publishedDoc;
      if (published) {
        const snapshot = cloneDoc(published);
        setEditSession({
          docId,
          seed: snapshot,
          saved: cloneDoc(snapshot),
          live: cloneDoc(snapshot)
        });
      }
    }
  };

  if (route.page === "library") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">Visual Document OS</span>
          <span className="chip">文档中心</span>
          <div className="row">
            <button className="btn" onClick={() => createDoc("dashboard")}>
              新建 Dashboard
            </button>
            <button className="btn" onClick={() => createDoc("report")}>
              新建 Report
            </button>
            <button className="btn" onClick={() => createDoc("ppt")}>
              新建 PPT
            </button>
          </div>
          <span className="chip">总数: {docs.length}</span>
        </div>
        <LibraryPage
          docs={docs}
          onOpen={(docId) => setRoute({ page: "detail", docId, mode: "view" })}
          onEdit={(docId, docType) => {
            preloadEditorChunk(docType);
            setRoute({ page: "detail", docId, mode: "edit" });
          }}
        />
      </div>
    );
  }

  if (!currentRecord || !currentDetailDoc) {
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

  if (route.mode === "view") {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="brand">{currentRecord.name}</span>
          <span className="chip">{currentRecord.docType}</span>
          <span className={`chip status-${currentRecord.status}`}>{currentRecord.status === "published" ? "已发布" : "草稿中"}</span>
          <span className="chip">更新于 {currentRecord.updatedAt}</span>
          <div className="row">
            {currentRecord.status === "draft" ? (
              <button className="btn" onClick={() => setPreviewDraft((value) => !value)}>
                {previewDraft ? "查看发布版" : "查看草稿版"}
              </button>
            ) : null}
            {currentRecord.status === "draft" ? (
              <button className="btn" onClick={() => publishDraft(currentRecord.id)}>
                发布草稿
              </button>
            ) : null}
            {currentRecord.status === "draft" ? (
              <button className="btn danger" onClick={() => discardDraft(currentRecord.id)}>
                放弃草稿
              </button>
            ) : null}
            <button className="btn primary" onClick={() => setRoute({ page: "detail", docId: currentRecord.id, mode: "edit" })}>
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
        <span className={`chip ${isEditDirty ? "chip-warning" : ""}`}>{isEditDirty ? "有未保存改动" : "已保存"}</span>
        <div className="row">
          <button className="btn" onClick={saveDraft}>
            保存草稿
          </button>
          <button className="btn primary" onClick={() => publishDraft(currentRecord.id)}>
            发布
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
      <EditorProvider key={editSession.docId} initialDoc={editSession.seed} onDocChange={onEditDocSnapshot}>
        <AppLayout advanced={advancedMode} />
      </EditorProvider>
    </div>
  );
}

function LibraryPage({
  docs,
  onOpen,
  onEdit
}: {
  docs: WorkspaceDocRecord[];
  onOpen: (docId: string) => void;
  onEdit: (docId: string, docType: EditorDocType) => void;
}): JSX.Element {
  const [typeFilter, setTypeFilter] = useState<"all" | EditorDocType>("all");
  const [keyword, setKeyword] = useState("");

  const visibleDocs = useMemo(() => {
    const key = keyword.trim().toLowerCase();
    return docs.filter((item) => {
      if (typeFilter !== "all" && item.docType !== typeFilter) {
        return false;
      }
      if (!key) {
        return true;
      }
      const haystack = `${item.name} ${item.description} ${item.tags.join(" ")}`.toLowerCase();
      return haystack.includes(key);
    });
  }, [docs, keyword, typeFilter]);

  return (
    <div className="library-shell">
      <div className="library-toolbar">
        <div className="tabs">
          {["all", ...DOC_TYPES].map((type) => (
            <button
              key={type}
              className={`tab-btn ${typeFilter === type ? "active" : ""}`}
              onClick={() => setTypeFilter(type as "all" | EditorDocType)}
            >
              {type === "all" ? "全部" : type}
            </button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 320 }} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、描述、标签" />
      </div>
      <div className="doc-grid">
        {visibleDocs.length === 0 ? <div className="doc-empty">没有匹配文档</div> : null}
        {visibleDocs.map((item) => (
          <article key={item.id} className="doc-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{item.name}</strong>
              <span className={`chip status-${item.status}`}>{item.status === "published" ? "已发布" : "草稿中"}</span>
            </div>
            <div className="muted">{item.description}</div>
            <div className="row">
              <span className="chip">{item.docType}</span>
              <span className="chip">更新于 {item.updatedAt}</span>
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
    </div>
  );
}

function DetailPage({ record, doc, previewDraft }: { record: WorkspaceDocRecord; doc: VDoc; previewDraft: boolean }): JSX.Element {
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

function AppLayout({ advanced }: { advanced: boolean }): JSX.Element {
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
