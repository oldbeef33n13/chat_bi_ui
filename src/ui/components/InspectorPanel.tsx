import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VDoc } from "../../core/doc/types";
import { ChartInspector } from "./inspector/ChartInspector";
import { DocumentInspector } from "./inspector/DocumentInspector";
import { LayoutEditor } from "./inspector/LayoutEditor";
import { TableInspector } from "./inspector/TableInspector";
import { formatMetaValue, inspectorTabLabel, type InspectorTab, tabsByNode } from "./inspector/shared";
import { findNodeById, findParentAndIndex } from "./inspector/node-helpers";
import { NodeStyleInspector } from "./NodeStyleInspector";
import { useDataEndpoints } from "../hooks/use-data-endpoints";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { Persona } from "../types/persona";

/**
 * 属性面板（统一分层）：
 * - 无选中或选中根节点：展示文档级全局属性；
 * - 选中具体节点：展示节点级基础/数据/样式/高级配置。
 */
export function InspectorPanel({ persona: _persona = "analyst" }: { persona?: Persona }): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const error = useSignalValue(store.lastError);
  const { items: dataEndpoints } = useDataEndpoints();
  const [activeTab, setActiveTab] = useState<InspectorTab>("basic");
  const [metaOpen, setMetaOpen] = useState(false);
  const metaButtonRef = useRef<HTMLButtonElement>(null);
  const metaPopRef = useRef<HTMLDivElement>(null);
  const [metaPos, setMetaPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });

  if (!doc) {
    return <div className="panel-body muted">No document loaded.</div>;
  }

  const node = selection.primaryId ? findNodeById(doc.root, selection.primaryId) : undefined;
  const isDocScope = !node || node.id === doc.root.id;
  const availableTabs = isDocScope ? (["basic", "style", "advanced"] as InspectorTab[]) : tabsByNode(node);
  const activeTabSafe = availableTabs.includes(activeTab) ? activeTab : (availableTabs[0] ?? "basic");
  const text = !isDocScope && node?.kind === "text" ? String((node.props as Record<string, unknown>)?.text ?? "") : "";
  const nodeLocation = !isDocScope && node ? findParentAndIndex(doc.root, node.id) : undefined;
  const metaItems = buildMetaItems(doc, node, nodeLocation);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0] ?? "basic");
    }
  }, [activeTab, availableTabs]);

  useEffect(() => {
    setActiveTab("basic");
  }, [node?.id]);

  useEffect(() => {
    setMetaOpen(false);
  }, [doc.docId, node?.id]);

  const updateMetaPosition = (): void => {
    const btn = metaButtonRef.current;
    if (!btn) {
      return;
    }
    const rect = btn.getBoundingClientRect();
    const width = Math.min(340, Math.max(260, window.innerWidth - 48));
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    const top = Math.min(window.innerHeight - 16, rect.bottom + 8);
    setMetaPos({ top, left, width });
  };

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      const inButton = Boolean(metaButtonRef.current && target && metaButtonRef.current.contains(target));
      const inPop = Boolean(metaPopRef.current && target && metaPopRef.current.contains(target));
      if (!inButton && !inPop) {
        setMetaOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!metaOpen) {
      return;
    }
    updateMetaPosition();
    const onReflow = (): void => updateMetaPosition();
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [metaOpen]);

  return (
    <div className="inspector-panel">
      <div className="panel-header inspector-panel-header">
        <div className="row inspector-header-row">
          <span>Inspector</span>
          <span className="muted">{isDocScope ? `doc · ${doc.docType}` : `${node.kind} · ${node.id}`}</span>
        </div>
        <div className="inspector-meta-wrap">
          <button
            ref={metaButtonRef}
            className={`tool-icon-btn inspector-meta-btn ${metaOpen ? "active" : ""}`}
            aria-label="技术信息"
            title="技术信息"
            onClick={() => {
              setMetaOpen((value) => !value);
              setTimeout(() => updateMetaPosition(), 0);
            }}
          >
            <span className="tool-icon">i</span>
          </button>
        </div>
      </div>
      {metaOpen
        ? createPortal(
            <div ref={metaPopRef} className="inspector-meta-pop inspector-meta-pop-layer" style={{ top: metaPos.top, left: metaPos.left, width: metaPos.width }}>
              <div className="inspector-meta-title">技术信息</div>
              {metaItems.map((item) => (
                <div key={`${item.label}_${String(item.value)}`} className="row inspector-meta-row">
                  <span className="muted">{item.label}</span>
                  <code className="inspector-meta-value">{formatMetaValue(item.value)}</code>
                </div>
              ))}
            </div>,
            document.body
          )
        : null}
      <div className="inspector-panel-body">
        {error ? (
          <div className="col" style={{ marginBottom: 10 }}>
            <div className="chip" style={{ color: "#b91c1c" }}>
              {error}
            </div>
            <button className="btn" onClick={() => store.clearError()}>
              清除
            </button>
          </div>
        ) : null}

        {isDocScope ? (
          <div className="col inspector-body">
            <InspectorTabs availableTabs={availableTabs} activeTab={activeTabSafe} onChange={setActiveTab} />
            <DocumentInspector doc={doc} activeTab={activeTabSafe} />
          </div>
        ) : node ? (
          <div className="col inspector-body">
            <InspectorTabs availableTabs={availableTabs} activeTab={activeTabSafe} onChange={setActiveTab} />

            {activeTabSafe === "basic" ? (
              <div className="col">
                {node.kind === "text" ? (
                  <label className="col">
                    <span>Text</span>
                    <textarea
                      className="textarea"
                      value={text}
                      onChange={(event) =>
                        store.executeCommand(
                          {
                            type: "UpdateProps",
                            nodeId: node.id,
                            props: { text: event.target.value }
                          },
                          { summary: "edit text", mergeWindowMs: 140 }
                        )
                      }
                    />
                  </label>
                ) : (
                  <div className="muted inspector-help-text">该元素的主要可编辑项在“数据 / 样式 / 高级”中。</div>
                )}
              </div>
            ) : null}

            {node.kind === "chart" ? <ChartInspector doc={doc} node={node} activeTab={activeTabSafe} endpoints={dataEndpoints} /> : null}
            {node.kind === "table" ? <TableInspector doc={doc} node={node} activeTab={activeTabSafe} endpoints={dataEndpoints} /> : null}

            {activeTabSafe === "advanced" ? <LayoutEditor node={node} /> : null}
            {activeTabSafe === "style" ? <NodeStyleInspector node={node} /> : null}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn danger" onClick={() => store.executeCommand({ type: "RemoveNode", nodeId: node.id }, { summary: "remove in inspector" })}>
                删除节点
              </button>
            </div>
          </div>
        ) : (
          <div className="muted">选择一个节点后可编辑属性。</div>
        )}
      </div>
    </div>
  );
}

function InspectorTabs({
  availableTabs,
  activeTab,
  onChange
}: {
  availableTabs: InspectorTab[];
  activeTab: InspectorTab;
  onChange: (tab: InspectorTab) => void;
}): JSX.Element {
  return (
    <div className="tabs inspector-content-tabs">
      {availableTabs.map((tab) => (
        <button key={tab} className={`tab-btn ${activeTab === tab ? "active" : ""}`} onClick={() => onChange(tab)}>
          {inspectorTabLabel[tab]}
        </button>
      ))}
    </div>
  );
}

function buildMetaItems(
  doc: VDoc,
  node: ReturnType<typeof findNodeById>,
  nodeLocation?: { parent: VDoc["root"]; index: number }
): Array<{ label: string; value: unknown }> {
  if (!node || node.id === doc.root.id) {
    return [
      { label: "文档ID", value: doc.docId },
      { label: "文档类型", value: doc.docType },
      { label: "Schema版本", value: doc.schemaVersion },
      { label: "根节点ID", value: doc.root.id },
      { label: "数据源数量", value: doc.dataSources?.length ?? 0 },
      { label: "查询数量", value: doc.queries?.length ?? 0 },
      { label: "过滤器数量", value: doc.filters?.length ?? 0 }
    ];
  }
  return [
    { label: "元素ID", value: node.id },
    { label: "元素类型", value: node.kind },
    { label: "元素名称", value: node.name ?? "-" },
    { label: "父节点", value: nodeLocation?.parent.id ?? "-" },
    { label: "序号", value: nodeLocation ? `${nodeLocation.index + 1}/${(nodeLocation.parent.children ?? []).length}` : "-" },
    { label: "布局模式", value: node.layout?.mode ?? "-" },
    { label: "数据接口", value: node.data?.endpointId ?? "-" },
    { label: "数据源", value: node.data?.sourceId ?? "-" },
    { label: "查询", value: node.data?.queryId ?? "-" }
  ];
}
