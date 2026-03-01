import { useMemo, useState } from "react";
import type { ChartSpec, VNode } from "../../core/doc/types";
import { themes } from "../../runtime/theme/themes";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";

type BatchScope = "selection" | "all-charts" | "kind" | "group";

export function BatchOpsPanel(): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const [scope, setScope] = useState<BatchScope>("selection");
  const [kindFilter, setKindFilter] = useState("chart");
  const [groupFilter, setGroupFilter] = useState("all");
  const [chartType, setChartType] = useState<ChartSpec["chartType"]>("line");
  const [themeRef, setThemeRef] = useState("theme.tech.dark");
  const [paletteRef, setPaletteRef] = useState("palette.tech.dark");
  const [nodeTokenId, setNodeTokenId] = useState("theme.tech.light");
  const [agg, setAgg] = useState<NonNullable<ChartSpec["bindings"][number]["agg"]>>("sum");

  if (!doc) {
    return <div className="muted">No document</div>;
  }

  const allNodes = useMemo(() => listNodes(doc.root), [doc]);
  const uniqueKinds = [...new Set(allNodes.map((node) => node.kind))];
  const uniqueGroups = [...new Set(allNodes.map((node) => node.layout?.group).filter((item): item is string => !!item))];
  const targets = resolveTargets(allNodes, selection.selectedIds, scope, kindFilter, groupFilter);
  const chartTargets = targets.filter((node) => node.kind === "chart");
  const primarySelected = selection.selectedIds.length > 0 ? allNodes.find((node) => node.id === selection.selectedIds[0]) : undefined;

  const runOnCharts = (summary: string, mapper: (node: VNode) => Record<string, unknown>): void => {
    if (chartTargets.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: chartTargets.map((node) => ({
          type: "UpdateProps",
          nodeId: node.id,
          props: mapper(node)
        }))
      },
      { summary }
    );
  };

  const runStyle = (summary: string, style: Record<string, unknown>): void => {
    if (targets.length === 0) {
      return;
    }
    store.executeCommand(
      {
        type: "Transaction",
        commands: targets.map((node) => ({
          type: "UpdateStyle",
          nodeId: node.id,
          style
        }))
      },
      { summary }
    );
  };

  const applyAgg = (): void => {
    runOnCharts("batch update agg", (node) => {
      const spec = (node.props ?? {}) as ChartSpec;
      const bindings = (spec.bindings ?? []).map((binding, idx) =>
        (binding.role === "y" || binding.role === "value") && idx === findFirstYIndex(spec.bindings ?? [])
          ? { ...binding, agg }
          : binding
      );
      return { bindings };
    });
  };

  return (
    <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>批量修改中心</strong>
        <span className="chip">
          目标: {targets.length} 节点 / {chartTargets.length} 图表
        </span>
      </div>
      <div className="row">
        <label className="col" style={{ minWidth: 180 }}>
          <span>作用域</span>
          <select className="select" value={scope} onChange={(event) => setScope(event.target.value as BatchScope)}>
            <option value="selection">选中节点</option>
            <option value="all-charts">全图表</option>
            <option value="kind">按类型</option>
            <option value="group">按组</option>
          </select>
        </label>
        {scope === "kind" ? (
          <label className="col" style={{ minWidth: 180 }}>
            <span>节点类型</span>
            <select className="select" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}>
              {uniqueKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {scope === "group" ? (
          <label className="col" style={{ minWidth: 180 }}>
            <span>Group ID</span>
            <select className="select" value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
              <option value="all">all groups</option>
              {uniqueGroups.map((groupId) => (
                <option key={groupId} value={groupId}>
                  {groupId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <strong>快捷批量动作</strong>
        <div className="row">
          <button className="btn" onClick={() => runOnCharts("batch label on", () => ({ labelShow: true }))}>
            全开标签
          </button>
          <button className="btn" onClick={() => runOnCharts("batch label off", () => ({ labelShow: false }))}>
            全关标签
          </button>
          <button className="btn" onClick={() => runOnCharts("batch no grid", () => ({ gridShow: false }))}>
            全无网格
          </button>
          <button className="btn" onClick={() => runOnCharts("batch smooth on", () => ({ smooth: true }))}>
            全平滑
          </button>
        </div>
      </div>

      <div className="row">
        <label className="col">
          <span>图表类型</span>
          <select className="select" value={chartType} onChange={(event) => setChartType(event.target.value as ChartSpec["chartType"])}>
            {["auto", "line", "bar", "pie", "scatter", "radar", "heatmap"].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={() => runOnCharts("batch chart type", () => ({ chartType }))}>
          应用图表类型
        </button>
      </div>

      <div className="row">
        <label className="col">
          <span>聚合方式</span>
          <select className="select" value={agg} onChange={(event) => setAgg(event.target.value as NonNullable<ChartSpec["bindings"][number]["agg"]>)}>
            {["sum", "avg", "min", "max", "count", "distinctCount", "p50", "p95", "p99"].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={applyAgg}>
          应用聚合
        </button>
      </div>

      <div className="row">
        <label className="col">
          <span>主题Ref</span>
          <select className="select" value={themeRef} onChange={(event) => setThemeRef(event.target.value)}>
            {themes.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.id}
              </option>
            ))}
          </select>
        </label>
        <label className="col">
          <span>配色Ref</span>
          <select className="select" value={paletteRef} onChange={(event) => setPaletteRef(event.target.value)}>
            <option value="palette.tech.dark">palette.tech.dark</option>
            <option value="palette.tech">palette.tech</option>
            <option value="palette.business">palette.business</option>
          </select>
        </label>
      </div>
      <div className="row">
        <button className="btn" onClick={() => runOnCharts("batch theme ref", () => ({ themeRef }))}>
          应用主题Ref
        </button>
        <button className="btn" onClick={() => runOnCharts("batch palette ref", () => ({ paletteRef }))}>
          应用配色Ref
        </button>
        <button
          className="btn"
          onClick={() =>
            store.executeCommand(
              {
                type: "ApplyTheme",
                scope: scope === "selection" ? "selection" : "doc",
                themeId: themeRef
              },
              { summary: "batch apply theme token" }
            )
          }
        >
          应用主题Token
        </button>
      </div>

      <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
        <strong>样式批量</strong>
        <div className="row">
          <button className="btn" onClick={() => runStyle("batch style card", { bg: "#f8fbff", borderW: 1, borderC: "#dbeafe", radius: 10 })}>
            卡片样式
          </button>
          <button className="btn" onClick={() => runStyle("batch style clean", { bg: "#ffffff", borderW: 0, shadow: "none" })}>
            极简样式
          </button>
        </div>
        <div className="row">
          <label className="col">
            <span>节点Token</span>
            <select className="select" value={nodeTokenId} onChange={(event) => setNodeTokenId(event.target.value)}>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.id}
                </option>
              ))}
            </select>
          </label>
          <button className="btn" onClick={() => runStyle("batch apply node token", { tokenId: nodeTokenId })}>
            批量应用节点Token
          </button>
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() =>
              store.executeCommand(
                {
                  type: "Transaction",
                  commands: targets.map((node) => ({
                    type: "ResetStyle",
                    nodeId: node.id,
                    style: { tokenId: node.style?.tokenId ?? doc.themeId ?? nodeTokenId }
                  }))
                },
                { summary: "batch reset style override" }
              )
            }
          >
            批量回归继承
          </button>
          <button
            className="btn"
            disabled={!primarySelected}
            onClick={() => {
              if (!primarySelected) {
                return;
              }
              const sourceStyle = primarySelected.style ?? {};
              store.executeCommand(
                {
                  type: "Transaction",
                  commands: targets
                    .filter((node) => node.id !== primarySelected.id)
                    .map((node) => ({
                      type: "UpdateStyle",
                      nodeId: node.id,
                      style: sourceStyle
                    }))
                },
                { summary: "batch clone style from primary" }
              );
            }}
          >
            复制主节点样式到目标
          </button>
        </div>
      </div>
    </div>
  );
}

const resolveTargets = (allNodes: VNode[], selectedIds: string[], scope: BatchScope, kindFilter: string, groupFilter: string): VNode[] => {
  switch (scope) {
    case "selection":
      return allNodes.filter((node) => selectedIds.includes(node.id));
    case "all-charts":
      return allNodes.filter((node) => node.kind === "chart");
    case "kind":
      return allNodes.filter((node) => node.kind === kindFilter);
    case "group":
      return allNodes.filter((node) => {
        const group = node.layout?.group;
        if (!group) {
          return false;
        }
        if (groupFilter === "all") {
          return true;
        }
        return group === groupFilter;
      });
    default:
      return [];
  }
};

const listNodes = (root: VNode): VNode[] => {
  const all: VNode[] = [];
  const walk = (node: VNode): void => {
    all.push(node);
    node.children?.forEach(walk);
  };
  walk(root);
  return all;
};

const findFirstYIndex = (bindings: ChartSpec["bindings"]): number =>
  bindings.findIndex((binding) => binding.role === "y" || binding.role === "value");
