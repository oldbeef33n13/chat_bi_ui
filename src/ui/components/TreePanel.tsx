import { useEffect, useState } from "react";
import type { ChartType, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { buildChartNode, chartTypeOptions, extractSourceFields, recommendChartConfig } from "../utils/chart-recommend";
import { listTemplatesForDocType, personaLabel } from "../../runtime/template/templates";
import type { Persona } from "../types/persona";

const canHaveChildren = (node: VNode): boolean => node.kind === "container" || node.kind === "section" || node.kind === "slide";

export function TreePanel({ persona = "analyst" }: { persona?: Persona }): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const [newChartType, setNewChartType] = useState<ChartType>("line");
  const [newSourceId, setNewSourceId] = useState<string>("");
  const [panelMode, setPanelMode] = useState<"structure" | "template">(panelByPersona(persona));
  const [templateKeyword, setTemplateKeyword] = useState("");
  const [lastTemplateName, setLastTemplateName] = useState<string>("");

  useEffect(() => {
    setPanelMode(panelByPersona(persona));
  }, [persona]);

  if (!doc) {
    return <div className="panel-body muted">No document</div>;
  }

  const sourceOptions = doc.dataSources ?? [];
  const activeSourceId = newSourceId || sourceOptions[0]?.id || "";
  const sourceFieldPreview = extractSourceFields(sourceOptions.find((item) => item.id === activeSourceId));
  const recommendPreview = recommendChartConfig(newChartType, sourceFieldPreview);
  const selectedNodes = selection.selectedIds.map((id) => findNode(doc.root, id)).filter((node): node is VNode => !!node);
  const selectedGroupNodes = selectedNodes.filter((node) => !!node.layout?.group);
  const selectedGroupIds = [...new Set(selectedGroupNodes.map((node) => node.layout?.group).filter((id): id is string => !!id))];
  const currentGroupConstraint = (selectedGroupNodes[0]?.layout?.groupConstraint as "free" | "x" | "y" | undefined) ?? "free";
  const primaryParent = selection.primaryId ? findParent(doc.root, selection.primaryId) : undefined;
  const layerNodes = (primaryParent?.children ?? []).filter((node) => node.layout?.mode === "absolute");

  const addNode = (kind: "chart" | "text" | "section" | "slide"): void => {
    const current = selection.primaryId ? findNode(doc.root, selection.primaryId) : undefined;
    const parent =
      current && canHaveChildren(current)
        ? current
        : doc.docType === "report"
          ? findFirstKind(doc.root, "section") ?? doc.root
          : doc.docType === "ppt"
            ? findFirstKind(doc.root, "slide") ?? doc.root
            : doc.root;

    const node: VNode =
      kind === "chart"
        ? buildChartNode({
            doc,
            parent,
            chartType: newChartType,
            sourceId: activeSourceId || undefined,
            title: "新图表"
          })
        : kind === "section"
          ? { id: prefixedId("section"), kind: "section", props: { title: "新章节" }, children: [] }
          : kind === "slide"
            ? { id: prefixedId("slide"), kind: "slide", props: { title: "新页面" }, layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 }, children: [] }
            : { id: prefixedId("text"), kind: "text", props: { text: "请输入内容", format: "plain" }, layout: parent.kind === "slide" ? { mode: "absolute", x: 60, y: 60, w: 280, h: 120 } : undefined };

    store.executeCommand(
      {
        type: "InsertNode",
        parentId: parent.id,
        node
      },
      { summary: `insert ${kind}` }
    );
  };

  const removeSelected = (): void => {
    if (!selection.primaryId || selection.primaryId === "root") {
      return;
    }
    store.executeCommand({ type: "RemoveNode", nodeId: selection.primaryId }, { summary: "remove node" });
    store.clearSelection();
  };

  const setZForSelection = (resolver: (currentZ: number, maxZ: number, index: number) => number, summary: string): void => {
    if (selectedNodes.length === 0) {
      return;
    }
    const maxZ = Math.max(0, ...layerNodes.map((node) => Number(node.layout?.z ?? 0)));
    store.executeCommand(
      {
        type: "Transaction",
        commands: selectedNodes.map((node, index) => ({
          type: "UpdateLayout",
          nodeId: node.id,
          layout: {
            z: resolver(Number(node.layout?.z ?? 0), maxZ, index)
          }
        }))
      },
      { summary }
    );
  };

  const toggleLockSelection = (): void => {
    if (selectedNodes.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: selectedNodes.map((node) => ({
          type: "UpdateLayout",
          nodeId: node.id,
          layout: {
            lock: !Boolean(node.layout?.lock)
          }
        }))
      },
      { summary: "toggle lock selection" }
    );
  };

  const groupSelection = (): void => {
    if (selection.selectedIds.length < 2) {
      return;
    }
    store.executeCommand(
      {
        type: "Group",
        nodeIds: selection.selectedIds
      },
      { summary: "group selection" }
    );
  };

  const ungroupSelection = (): void => {
    if (selection.selectedIds.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Ungroup",
        nodeIds: selection.selectedIds
      },
      { summary: "ungroup selection" }
    );
  };

  const setGroupConstraint = (constraint: "free" | "x" | "y"): void => {
    if (selectedGroupNodes.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: selectedGroupNodes.map((node) => ({
          type: "UpdateLayout",
          nodeId: node.id,
          layout: { groupConstraint: constraint }
        }))
      },
      { summary: `set group constraint ${constraint}` }
    );
  };

  const templates = listTemplatesForDocType(doc.docType)
    .filter((tpl) => {
      if (!templateKeyword.trim()) {
        return true;
      }
      const key = templateKeyword.trim().toLowerCase();
      const text = `${tpl.name} ${tpl.description} ${(tpl.tags ?? []).join(" ")}`.toLowerCase();
      return text.includes(key);
    })
    .sort((a, b) => Number(b.personas.includes(persona)) - Number(a.personas.includes(persona)));

  const applyTemplate = (templateId: string, templateTarget: "dashboard" | "report" | "ppt" | "slide" | "section", templateName: string): void => {
    const parentId = resolveTemplateParentId(doc.root, selection.primaryId, doc.docType, templateTarget);
    const ok = store.executeCommand(
      {
        type: "ApplyTemplate",
        parentId,
        templateId,
        templateTarget
      },
      { summary: `apply template ${templateName}` }
    );
    if (ok) {
      setLastTemplateName(templateName);
    }
  };

  return (
    <>
      <div className="panel-header">
        <div className="tabs">
          <button className={`tab-btn ${panelMode === "structure" ? "active" : ""}`} onClick={() => setPanelMode("structure")}>
            结构
          </button>
          <button className={`tab-btn ${panelMode === "template" ? "active" : ""}`} onClick={() => setPanelMode("template")}>
            模板市场
          </button>
        </div>
        <div className="row">
          {panelMode === "structure" ? (
            <>
              <button className="btn" onClick={() => addNode("text")}>
                +文本
              </button>
              {doc.docType === "report" ? (
                <button className="btn" onClick={() => addNode("section")}>
                  +章节
                </button>
              ) : null}
              {doc.docType === "ppt" ? (
                <button className="btn" onClick={() => addNode("slide")}>
                  +页面
                </button>
              ) : null}
              <button className="btn danger" onClick={removeSelected} disabled={!selection.primaryId || selection.primaryId === "root"}>
                删除
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => store.undo()}>
              回退上一步
            </button>
          )}
        </div>
      </div>
      <div className="panel-body">
        {panelMode === "structure" ? (
          <div className="col">
            <div className="chip">当前用户模式: {personaLabel(persona)}</div>
            <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
              <strong>新建图表向导</strong>
              <div className="row">
                <select className="select" value={newChartType} onChange={(event) => setNewChartType(event.target.value as ChartType)}>
                  {chartTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      图表: {type}
                    </option>
                  ))}
                </select>
                <select className="select" value={activeSourceId} onChange={(event) => setNewSourceId(event.target.value)} disabled={sourceOptions.length === 0}>
                  {sourceOptions.length > 0 ? (
                    sourceOptions.map((source) => (
                      <option key={source.id} value={source.id}>
                        数据源: {source.id}
                      </option>
                    ))
                  ) : (
                    <option value="">无数据源</option>
                  )}
                </select>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                自动字段推荐: {sourceFieldPreview.slice(0, 4).map((field) => `${field.name}:${field.type}`).join(", ") || "暂无字段"}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                推荐说明: {recommendPreview.reasons[0] ?? "-"}
              </div>
              <button className="btn primary" onClick={() => addNode("chart")}>
                新建图表
              </button>
            </div>
            <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>图层与组合</strong>
                <span className="muted">{selection.selectedIds.length} 已选中</span>
              </div>
              <div className="row">
                <button className="btn" onClick={() => setZForSelection((_, maxZ, idx) => maxZ + 1 + idx, "bring front")}>
                  置顶
                </button>
                <button className="btn" onClick={() => setZForSelection((_z, _max, idx) => idx, "send back")}>
                  置底
                </button>
                <button className="btn" onClick={() => setZForSelection((z) => z + 1, "move layer up")}>
                  上移一层
                </button>
                <button className="btn" onClick={() => setZForSelection((z) => Math.max(0, z - 1), "move layer down")}>
                  下移一层
                </button>
              </div>
              <div className="row">
                <button className="btn" onClick={toggleLockSelection}>
                  锁定/解锁
                </button>
                <button className="btn" onClick={groupSelection} disabled={selection.selectedIds.length < 2}>
                  编组
                </button>
                <button className="btn" onClick={ungroupSelection} disabled={selection.selectedIds.length === 0}>
                  解组
                </button>
              </div>
              <label className="col">
                <span>组内约束</span>
                <select className="select" value={currentGroupConstraint} onChange={(event) => setGroupConstraint(event.target.value as "free" | "x" | "y")} disabled={selectedGroupNodes.length === 0}>
                  <option value="free">自由</option>
                  <option value="x">仅X轴联动</option>
                  <option value="y">仅Y轴联动</option>
                </select>
              </label>
              <div className="muted" style={{ fontSize: 12 }}>
                当前图层容器元素数: {layerNodes.length} | 当前组: {selectedGroupIds.join(", ") || "-"}
              </div>
            </div>
            <TreeNode node={doc.root} depth={0} selectedIds={new Set(selection.selectedIds)} onSelect={(nodeId, multi) => store.setSelection(nodeId, multi)} />
          </div>
        ) : (
          <div className="col">
            <input
              className="input"
              placeholder="搜索模板（名称/标签/描述）"
              value={templateKeyword}
              onChange={(event) => setTemplateKeyword(event.target.value)}
            />
            {lastTemplateName ? (
              <div className="row" style={{ justifyContent: "space-between", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                <span className="muted">已应用模板: {lastTemplateName}</span>
                <button className="btn" onClick={() => store.undo()}>
                  一键回退
                </button>
              </div>
            ) : null}
            {templates.length === 0 ? <div className="muted">未找到匹配模板</div> : null}
            {templates.map((tpl) => (
              <div key={tpl.id} className="block" style={{ margin: 0 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{tpl.name}</strong>
                  <div className="row">
                    {tpl.personas.includes(persona) ? <span className="chip">推荐</span> : null}
                    <span className="chip">{tpl.target}</span>
                  </div>
                </div>
                <div className="muted">{tpl.description}</div>
                <div className="row">
                  {tpl.personas.map((p) => (
                    <span key={p} className="chip">
                      {personaLabel(p)}
                    </span>
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  标签: {(tpl.tags ?? []).join(", ") || "-"}
                </div>
                <button className="btn primary" onClick={() => applyTemplate(tpl.id, tpl.target, tpl.name)}>
                  一键应用
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function TreeNode({
  node,
  depth,
  selectedIds,
  onSelect
}: {
  node: VNode;
  depth: number;
  selectedIds: Set<string>;
  onSelect: (nodeId: string, multi: boolean) => void;
}): JSX.Element {
  const active = selectedIds.has(node.id);
  return (
    <div>
      <div
        className={`tree-item ${active ? "active" : ""}`}
        style={{ marginLeft: depth * 12 }}
        onClick={(event) => onSelect(node.id, event.ctrlKey || event.metaKey)}
      >
        {node.kind} <span className="muted">{node.id}</span>
      </div>
      {node.children?.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} selectedIds={selectedIds} onSelect={onSelect} />
      ))}
    </div>
  );
}

const findNode = (root: VNode, nodeId: string): VNode | undefined => {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
};

const findFirstKind = (root: VNode, kind: string): VNode | undefined => {
  if (root.kind === kind) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findFirstKind(child, kind);
    if (found) {
      return found;
    }
  }
  return undefined;
};

const findParent = (root: VNode, targetId: string): VNode | undefined => {
  for (const child of root.children ?? []) {
    if (child.id === targetId) {
      return root;
    }
    const nested = findParent(child, targetId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
};

const resolveTemplateParentId = (
  root: VNode,
  selectedId: string | undefined,
  docType: "chart" | "dashboard" | "report" | "ppt",
  target: "dashboard" | "report" | "ppt" | "slide" | "section"
): string => {
  if (docType === "dashboard") {
    return root.id;
  }
  if (docType === "report") {
    return root.id;
  }
  if (docType === "ppt" && target === "slide") {
    if (selectedId) {
      const selected = findNode(root, selectedId);
      if (selected?.kind === "slide") {
        return selected.id;
      }
      const parentSlide = findAncestorKind(root, selectedId, "slide");
      if (parentSlide) {
        return parentSlide.id;
      }
    }
    return findFirstKind(root, "slide")?.id ?? root.id;
  }
  return root.id;
};

const findAncestorKind = (root: VNode, targetId: string, kind: string): VNode | undefined => {
  const dfs = (node: VNode, stack: VNode[]): VNode | undefined => {
    if (node.id === targetId) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.kind === kind) {
          return stack[i];
        }
      }
      return node.kind === kind ? node : undefined;
    }
    for (const child of node.children ?? []) {
      const found = dfs(child, [...stack, node]);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return dfs(root, []);
};

const panelByPersona = (persona: Persona): "structure" | "template" => (persona === "novice" || persona === "ai" ? "template" : "structure");
