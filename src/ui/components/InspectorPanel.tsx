import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ChartSpec, FieldBinding, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";
import { prefixedId } from "../../core/utils/id";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { themes } from "../../runtime/theme/themes";
import { chartTypeOptions, extractSourceFields, recommendBindings, recommendChartConfig, requestAiChartRecommend } from "../utils/chart-recommend";
import { summarizeChartRows } from "../utils/chart-summary";
import { buildTableRenderModel } from "../../runtime/table/table-adapter";
import type { Persona } from "../types/persona";

type InspectorTab = "basic" | "data" | "style" | "advanced";

const inspectorTabLabel: Record<InspectorTab, string> = {
  basic: "基础",
  data: "数据",
  style: "样式",
  advanced: "高级"
};

const isMeasureRole = (role: FieldBinding["role"]): boolean =>
  role === "y" ||
  role === "y1" ||
  role === "y2" ||
  role === "secondary" ||
  role === "ysecondary" ||
  role === "value";

const isSeriesRole = (role: FieldBinding["role"]): boolean => role === "series" || role === "color" || role === "facet";

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
  const metaItems = isDocScope
    ? [
        { label: "文档ID", value: doc.docId },
        { label: "文档类型", value: doc.docType },
        { label: "Schema版本", value: doc.schemaVersion },
        { label: "根节点ID", value: doc.root.id },
        { label: "数据源数量", value: doc.dataSources?.length ?? 0 },
        { label: "查询数量", value: doc.queries?.length ?? 0 },
        { label: "过滤器数量", value: doc.filters?.length ?? 0 }
      ]
    : node
      ? [
          { label: "元素ID", value: node.id },
          { label: "元素类型", value: node.kind },
          { label: "元素名称", value: node.name ?? "-" },
          { label: "父节点", value: nodeLocation?.parent.id ?? "-" },
          { label: "序号", value: nodeLocation ? `${nodeLocation.index + 1}/${(nodeLocation.parent.children ?? []).length}` : "-" },
          { label: "布局模式", value: node.layout?.mode ?? "-" },
          { label: "数据源", value: node.data?.sourceId ?? "-" },
          { label: "查询", value: node.data?.queryId ?? "-" }
        ]
      : [];

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
            <div
              ref={metaPopRef}
              className="inspector-meta-pop inspector-meta-pop-layer"
              style={{ top: metaPos.top, left: metaPos.left, width: metaPos.width }}
            >
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
            <div className="tabs inspector-content-tabs">
              {availableTabs.map((tab) => (
                <button key={tab} className={`tab-btn ${activeTabSafe === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                  {inspectorTabLabel[tab]}
                </button>
              ))}
            </div>
            <DocumentInspector doc={doc} activeTab={activeTabSafe} />
          </div>
        ) : node ? (
          <div className="col inspector-body">
            <div className="tabs inspector-content-tabs">
              {availableTabs.map((tab) => (
                <button key={tab} className={`tab-btn ${activeTabSafe === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                  {inspectorTabLabel[tab]}
                </button>
              ))}
            </div>

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

            {node.kind === "chart" ? <ChartInspector doc={doc} node={node} activeTab={activeTabSafe} /> : null}
            {node.kind === "table" ? <TableInspector doc={doc} node={node} activeTab={activeTabSafe} /> : null}

            {activeTabSafe === "advanced" ? <LayoutEditor node={node} /> : null}

            {activeTabSafe === "style" ? (
              <button
                className="btn"
                onClick={() =>
                  store.executeCommand(
                    {
                      type: "UpdateStyle",
                      nodeId: node.id,
                      style: { bg: "#f8fbff", borderW: 1, borderC: "#dbeafe", radius: 8 }
                    },
                    { summary: "style preset" }
                  )
                }
              >
                样式预设
              </button>
            ) : null}

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button
                className="btn danger"
                onClick={() => store.executeCommand({ type: "RemoveNode", nodeId: node.id }, { summary: "remove in inspector" })}
              >
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

function ChartInspector({
  doc,
  node,
  activeTab
}: {
  doc: VDoc;
  node: VNode;
  activeTab: InspectorTab;
}): JSX.Element {
  const store = useEditorStore();
  const props = (node.props ?? { chartType: "line", bindings: [] }) as ChartSpec;
  const bindings = props.bindings ?? [];
  const [recommendHint, setRecommendHint] = useState("");
  const [paletteText, setPaletteText] = useState("");
  const [summaryHint, setSummaryHint] = useState("");
  const [aiRecommendLoading, setAiRecommendLoading] = useState(false);

  const sourceOptions = doc.dataSources ?? [];
  const sourceId = node.data?.sourceId ?? sourceOptions[0]?.id ?? "";
  const source = sourceOptions.find((item) => item.id === sourceId);
  const fields = extractSourceFields(source);
  const recommend = recommendChartConfig((props.chartType ?? "line") as ChartSpec["chartType"], fields);
  const xBindings = bindings.filter((binding) => binding.role === "x" || binding.role === "category");
  const xBinding = xBindings[0];
  const yBindings = bindings.filter((binding) => isMeasureRole(binding.role));
  const seriesBindings = bindings.filter((binding) => isSeriesRole(binding.role));
  const [xAxisAdvancedOpen, setXAxisAdvancedOpen] = useState(false);
  const computedFields = props.computedFields ?? [];
  const primaryY = yBindings[0];
  const secondY = yBindings[1];
  const fieldOptions = fields.map((field) => field.name);
  const numericFields = fields.filter((field) => field.type === "number").map((field) => field.name);
  const timeLikeFields = fields
    .filter((field) => field.type === "time" || /time|date|day|week|month|minute|hour/i.test(field.name))
    .map((field) => field.name);
  const previewRows = getPreviewRows(doc, node, props);
  const shouldSuggestMultiXAxis =
    Boolean(secondY) || props.chartType === "combo" || props.chartType === "scatter" || timeLikeFields.length >= 2;

  useEffect(() => {
    setPaletteText(Array.isArray((props.optionPatch as Record<string, unknown> | undefined)?.color) ? ((props.optionPatch as Record<string, unknown>).color as unknown[]).map((item) => String(item)).join(", ") : "");
    setRecommendHint("");
    setSummaryHint("");
    setAiRecommendLoading(false);
  }, [node.id, props.optionPatch]);

  useEffect(() => {
    setXAxisAdvancedOpen(xBindings.length > 1 || shouldSuggestMultiXAxis);
  }, [node.id]);

  useEffect(() => {
    if (xBindings.length > 1 && !xAxisAdvancedOpen) {
      setXAxisAdvancedOpen(true);
    }
  }, [xAxisAdvancedOpen, xBindings.length]);

  // 图表属性统一经命令系统更新，保证 undo/redo 和审计一致。
  const updateProps = (partial: Partial<ChartSpec>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: node.id,
        props: partial as unknown as Record<string, unknown>
      },
      { summary, mergeWindowMs }
    );
  };

  const setBindings = (bindings: FieldBinding[], summary: string): void => {
    updateProps({ bindings }, summary);
  };

  const setXBindings = (nextXBindings: FieldBinding[], summary: string): void => {
    const nonXBindings = bindings.filter((item) => item.role !== "x" && item.role !== "category");
    setBindings([...nextXBindings, ...nonXBindings], summary);
  };

  const addXAxisBinding = (): void => {
    const used = new Set(xBindings.map((binding) => binding.field));
    const candidate = fieldOptions.find((field) => !used.has(field)) ?? fieldOptions[0];
    if (!candidate) {
      return;
    }
    const nextIndex =
      xBindings.length > 0
        ? Math.max(...xBindings.map((binding, idx) => (typeof binding.axis === "number" ? binding.axis : idx))) + 1
        : 0;
    setXBindings(
      [...xBindings, { role: "x", field: candidate, axis: Math.max(0, Math.floor(nextIndex)) }],
      "add x axis"
    );
  };

  const updateXAxisBinding = (index: number, patch: Partial<FieldBinding>): void => {
    const target = xBindings[index];
    if (!target) {
      return;
    }
    const next = xBindings.map((binding, idx) => (idx === index ? ({ ...binding, ...patch } as FieldBinding) : binding));
    setXBindings(next, "update x axis binding");
  };

  const removeXAxisBinding = (index: number): void => {
    const next = xBindings.filter((_, idx) => idx !== index);
    if (next.length === 0) {
      const fallbackField = fieldOptions[0] ?? xBinding?.field ?? "x";
      setXBindings([{ role: "x", field: fallbackField, axis: 0 }], "reset x axis binding");
      return;
    }
    setXBindings(next, "remove x axis binding");
  };

  const setPrimaryXField = (field: string): void => {
    if (!field) {
      return;
    }
    if (xBindings.length === 0) {
      setXBindings([{ role: "x", field, axis: 0 }], "set primary x field");
      return;
    }
    const next = xBindings.map((binding, idx) => (idx === 0 ? ({ ...binding, role: "x", field } as FieldBinding) : binding));
    setXBindings(next, "set primary x field");
  };

  const xAxisIndexOfBinding = (binding: FieldBinding, fallbackIndex: number): number => {
    if (typeof binding.axis === "number" && Number.isFinite(binding.axis)) {
      return Math.max(0, Math.floor(binding.axis));
    }
    if (binding.axis === "secondary") {
      return 1;
    }
    return Math.max(0, fallbackIndex);
  };

  const autoMatchXAxis = (): void => {
    const dimensionFields = fields.filter((field) => field.type !== "number").map((field) => field.name);
    const candidates = [...new Set([...timeLikeFields, ...dimensionFields, ...fieldOptions])];
    if (candidates.length === 0) {
      return;
    }
    const desiredCount = secondY && candidates.length > 1 ? 2 : 1;
    const nextXBindings = Array.from({ length: desiredCount }, (_, index) => ({
      role: "x" as const,
      field: candidates[index] ?? candidates[0]!,
      axis: index
    }));

    const nonXBindings = bindings.filter((item) => item.role !== "x" && item.role !== "category");
    const nextBindings = nonXBindings.map((binding, index) => {
      if (!isMeasureRole(binding.role)) {
        return binding;
      }
      const axisIndex = desiredCount > 1 && index > 0 ? 1 : 0;
      return { ...binding, xAxis: axisIndex } as FieldBinding;
    });
    setBindings([...nextXBindings, ...nextBindings], "auto match x axis");
    setXAxisAdvancedOpen(desiredCount > 1 || shouldSuggestMultiXAxis);
  };

  const addComputedField = (): void => {
    const next = [...computedFields, { name: `calc_${computedFields.length + 1}`, expression: "1+1" }];
    updateProps({ computedFields: next }, "add computed field");
  };

  const updateComputedField = (index: number, patch: Partial<{ name: string; expression: string }>): void => {
    const next = computedFields.map((item, idx) => (idx === index ? { ...item, ...patch } : item));
    updateProps({ computedFields: next }, "update computed field");
  };

  const removeComputedField = (index: number): void => {
    const next = computedFields.filter((_, idx) => idx !== index);
    updateProps({ computedFields: next }, "remove computed field");
  };

  const setPrimaryYField = (field: string): void => {
    const current = [...bindings];
    const yIndex = current.findIndex((item) => isMeasureRole(item.role));
    if (yIndex >= 0) {
      current[yIndex] = { ...current[yIndex], role: "y", field };
      setBindings(current, "change y field");
      return;
    }
    current.push({ role: "y", field, agg: "sum" });
    setBindings(current, "add y field");
  };

  const setPrimaryAgg = (agg: FieldBinding["agg"]): void => {
    const current = [...bindings];
    const yIndex = current.findIndex((item) => isMeasureRole(item.role));
    if (yIndex < 0) {
      return;
    }
    const existing = current[yIndex];
    if (!existing) {
      return;
    }
    current[yIndex] = { ...existing, role: "y", agg };
    setBindings(current, "change agg");
  };

  const setPrimaryYXAxis = (xAxis: number): void => {
    const current = [...bindings];
    const yIndex = current.findIndex((item) => isMeasureRole(item.role));
    if (yIndex < 0) {
      return;
    }
    const existing = current[yIndex];
    if (!existing) {
      return;
    }
    current[yIndex] = { ...existing, role: "y", xAxis: Math.max(0, Math.floor(xAxis)) };
    setBindings(current, "change primary y x-axis");
  };

  const setSecondAxis = (enabled: boolean): void => {
    const current = [...bindings];
      const yIndices = current
        .map((item, idx) => ({ item, idx }))
        .filter((entry) => isMeasureRole(entry.item.role))
        .map((entry) => entry.idx);
    if (!enabled) {
      if (yIndices.length <= 1) {
        return;
      }
      const next = current.filter((_, idx) => idx !== yIndices[1]);
      setBindings(next, "remove second axis");
      return;
    }
    if (yIndices.length >= 2) {
      return;
    }
    const candidate = numericFields.find((field) => field !== primaryY?.field) ?? numericFields[0];
    if (!candidate) {
      return;
    }
    current.push({ role: "y2", field: candidate, agg: "sum", axis: "secondary", as: "secondary" });
    setBindings(current, "add second axis");
  };

  const setSecondAxisField = (field: string): void => {
    const current = [...bindings];
    const yIndices = current
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => isMeasureRole(entry.item.role))
      .map((entry) => entry.idx);
    if (yIndices.length < 2) {
      return;
    }
    const idx = yIndices[1]!;
    current[idx] = { ...current[idx], role: "y2", field, axis: "secondary", as: "secondary" };
    setBindings(current, "change second axis field");
  };

  const setSecondAxisX = (xAxis: number): void => {
    const current = [...bindings];
    const yIndices = current
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => isMeasureRole(entry.item.role))
      .map((entry) => entry.idx);
    if (yIndices.length < 2) {
      return;
    }
    const idx = yIndices[1]!;
    const existing = current[idx];
    if (!existing) {
      return;
    }
    current[idx] = { ...existing, role: "y2", xAxis: Math.max(0, Math.floor(xAxis)), axis: "secondary", as: "secondary" };
    setBindings(current, "change second axis x-axis");
  };

  const updateSeriesBinding = (index: number, patch: Partial<FieldBinding>): void => {
    const seriesEntries = bindings
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => isSeriesRole(entry.item.role));
    const target = seriesEntries[index];
    if (!target) {
      return;
    }
    const next = [...bindings];
    next[target.idx] = { ...target.item, ...patch } as FieldBinding;
    setBindings(next, "update series dimension");
  };

  const removeSeriesBinding = (index: number): void => {
    const seriesEntries = bindings
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => isSeriesRole(entry.item.role));
    const target = seriesEntries[index];
    if (!target) {
      return;
    }
    const next = bindings.filter((_, idx) => idx !== target.idx);
    setBindings(next, "remove series dimension");
  };

  const addSeriesBinding = (): void => {
    const used = new Set(seriesBindings.map((binding) => binding.field));
    const candidate =
      fieldOptions.find((field) => !used.has(field) && field !== xBinding?.field && field !== primaryY?.field && field !== secondY?.field) ??
      fieldOptions.find((field) => !used.has(field)) ??
      fieldOptions[0];
    if (!candidate) {
      return;
    }
    setBindings([...bindings, { role: "series", field: candidate }], "add series dimension");
  };

  const setSourceAndRecommend = (nextSourceId: string): void => {
    const nextSource = sourceOptions.find((item) => item.id === nextSourceId);
    const nextFields = extractSourceFields(nextSource);
    const nextRecommend = recommendChartConfig((props.chartType ?? "line") as ChartSpec["chartType"], nextFields);
    const nextQueryId = doc.queries?.find((query) => query.sourceId === nextSourceId)?.queryId;
    store.executeCommand(
      {
        type: "Transaction",
        commands: [
          {
            type: "UpdateData",
            nodeId: node.id,
            data: {
              sourceId: nextSourceId,
              queryId: nextQueryId
            }
          },
          {
            type: "UpdateProps",
            nodeId: node.id,
            props: {
              bindings: nextRecommend.bindings
            }
          }
        ]
      },
      { summary: "source change and bindings recommend" }
    );
    setRecommendHint(`${nextRecommend.reasons.join("；")}；可点击「AI 推荐」进一步优化。`);
  };

  const autoRecommendBindings = (): void => {
    const nextBindings = recommendBindings((props.chartType ?? "line") as ChartSpec["chartType"], fields);
    updateProps({ bindings: nextBindings }, "auto recommend bindings");
    setRecommendHint(recommend.reasons.join("；"));
  };

  const applySmartTypeRecommend = (): void => {
    store.executeCommand(
      {
        type: "Transaction",
        commands: [
          {
            type: "UpdateProps",
            nodeId: node.id,
            props: {
              chartType: recommend.chartType,
              bindings: recommend.bindings
            }
          }
        ]
      },
      { summary: "smart type recommend" }
    );
    setRecommendHint(recommend.reasons.join("；"));
  };

  const applyAiRecommend = async (): Promise<void> => {
    setAiRecommendLoading(true);
    try {
      const aiResult = await requestAiChartRecommend({
        requestedType: (props.chartType ?? "line") as ChartSpec["chartType"],
        fields,
        currentBindings: bindings,
        context: {
          docType: doc.docType,
          nodeId: node.id,
          sourceId,
          trigger: "inspector"
        }
      });
      store.executeCommand(
        {
          type: "UpdateProps",
          nodeId: node.id,
          props: {
            chartType: aiResult.chartType,
            bindings: aiResult.bindings
          }
        },
        { summary: "ai recommend chart config" }
      );
      setRecommendHint(`AI推荐(${aiResult.source === "ai" ? "模型" : "本地兜底"}): ${aiResult.reasons.join("；")}`);
    } finally {
      setAiRecommendLoading(false);
    }
  };

  const rollbackRecommend = (): void => {
    store.undo();
    setRecommendHint("已回退上一次推荐修改");
  };

  const applyCustomPalette = (): void => {
    const colors = paletteText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const nextPatch: Record<string, unknown> = { ...(props.optionPatch ?? {}) };
    if (colors.length === 0) {
      delete nextPatch.color;
    } else {
      nextPatch.color = colors;
    }
    updateProps({ optionPatch: nextPatch }, "chart custom palette");
  };

  const buildSummary = (): string => summarizeChartRows(props, previewRows);

  const toggleQuickDarkTheme = (): void => {
    const isDark = String(props.themeRef ?? "").includes("dark");
    if (isDark) {
      updateProps({ themeRef: "", paletteRef: "" }, "quick reset theme");
      return;
    }
    updateProps({ themeRef: "theme.tech.dark", paletteRef: "palette.tech.dark" }, "quick dark theme");
  };

  const toggleQuickGrid = (): void => {
    updateProps({ gridShow: props.gridShow === false ? true : false }, "quick toggle grid");
  };

  const applySummaryToSubtitle = (): void => {
    const summary = buildSummary();
    updateProps({ subtitleText: summary }, "auto summary subtitle");
    setSummaryHint("已写入图表副标题");
  };

  const insertSummaryTextBlock = (): void => {
    const summary = buildSummary();
    const inserted = insertSummaryNode(doc, node, summary, (command, summaryText) => store.executeCommand(command, { summary: summaryText }));
    if (!inserted) {
      updateProps({ subtitleText: summary }, "auto summary fallback subtitle");
      setSummaryHint("未找到可插入位置，已回退为副标题写入");
      return;
    }
    setSummaryHint("已插入结论文本块");
  };

  const fallbackXAxisBinding: FieldBinding = { role: "x", field: xBinding?.field ?? "x", axis: 0 };
  const xAxisEntries = (xBindings.length > 0 ? xBindings : [fallbackXAxisBinding]).map(
    (binding, index) => ({
      binding,
      axisIndex: xAxisIndexOfBinding(binding, index)
    })
  );
  const xAxisLabelByIndex = new Map<number, string>();
  xAxisEntries.forEach((entry) => {
    if (!xAxisLabelByIndex.has(entry.axisIndex)) {
      xAxisLabelByIndex.set(entry.axisIndex, `xAxis[${entry.axisIndex}](${entry.binding.as ?? entry.binding.field})`);
    }
  });
  const measureXAxisSummary =
    yBindings.length > 0
      ? yBindings
          .map((binding) => `${binding.as ?? binding.field} -> ${xAxisLabelByIndex.get(Number(binding.xAxis ?? 0)) ?? `xAxis[${Number(binding.xAxis ?? 0)}]`}`)
          .join("；")
      : "尚未配置指标字段";

  return (
    <div className="col">
      {activeTab === "basic" ? (
        <>
          <label className="col">
            <span>Chart Type</span>
            <select className="select" value={props.chartType ?? "line"} onChange={(event) => updateProps({ chartType: event.target.value as ChartSpec["chartType"] }, "chart type change")}>
              {chartTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="col">
            <span>Title</span>
            <input className="input" value={String(props.titleText ?? "")} onChange={(event) => updateProps({ titleText: event.target.value }, "chart title change", 140)} />
          </label>
          <div className="col" style={{ border: "1px dashed var(--line)", borderRadius: 8, padding: 8 }}>
            <strong>快捷操作</strong>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {(["line", "bar", "pie", "scatter", "combo", "radar"] as ChartSpec["chartType"][]).map((type) => (
                <button
                  key={`quick_type_${type}`}
                  className={`btn mini-btn ${props.chartType === type ? "primary" : ""}`}
                  title={`快速切换到 ${type}`}
                  onClick={() => updateProps({ chartType: type }, `quick chart type ${type}`)}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn mini-btn" title="一键切换暗色主题/恢复默认主题" onClick={toggleQuickDarkTheme}>
                {String(props.themeRef ?? "").includes("dark") ? "恢复主题" : "暗色"}
              </button>
              <button className="btn mini-btn" title="一键切换网格显示" onClick={toggleQuickGrid}>
                {props.gridShow === false ? "开网格" : "无网格"}
              </button>
              <button
                className="btn mini-btn"
                title="一键切换数据标签显示"
                onClick={() => updateProps({ labelShow: !Boolean(props.labelShow) }, "quick toggle labels")}
              >
                {props.labelShow ? "关标签" : "开标签"}
              </button>
            </div>
            <label className="row">
              <input
                type="checkbox"
                checked={props.runtimeAskEnabled !== false}
                onChange={(event) => updateProps({ runtimeAskEnabled: event.target.checked }, "toggle runtime ask entry")}
              />
              <span>运行态显示智能追问入口（头部图标）</span>
            </label>
          </div>
          <div className="row">
            <button className="btn primary" onClick={applySmartTypeRecommend}>
              智能类型推荐
            </button>
            <button className="btn" onClick={autoRecommendBindings}>
              自动字段推荐
            </button>
            <button className="btn" disabled={aiRecommendLoading} onClick={() => void applyAiRecommend()}>
              {aiRecommendLoading ? "AI 推荐中..." : "AI 推荐"}
            </button>
            {recommendHint ? (
              <button className="btn" onClick={rollbackRecommend}>
                一键回退推荐
              </button>
            ) : null}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            字段识别: {fields.slice(0, 4).map((field) => `${field.name}:${field.type}`).join(", ") || "无字段"}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            推荐解释: {recommendHint || recommend.reasons.join("；")}
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>自动总结</strong>
              <span className="muted">样本 {previewRows.length} 行</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {buildSummary()}
            </div>
            <div className="row">
              <button className="btn" onClick={applySummaryToSubtitle}>
                写入副标题
              </button>
              <button className="btn" onClick={insertSummaryTextBlock}>
                插入总结文本块
              </button>
            </div>
            {summaryHint ? <div className="muted">{summaryHint}</div> : null}
          </div>
        </>
      ) : null}

      {activeTab === "data" ? (
        <>
          <label className="col">
            <span>Data Source</span>
            <select className="select" value={sourceId} onChange={(event) => setSourceAndRecommend(event.target.value)} disabled={sourceOptions.length === 0}>
              {sourceOptions.length > 0 ? (
                sourceOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))
              ) : (
                <option value="">无数据源</option>
              )}
            </select>
          </label>
          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <strong>字段绑定</strong>
            <label className="col">
              <span>X 轴字段</span>
              <select className="select" value={xBinding?.field ?? ""} onChange={(event) => setPrimaryXField(event.target.value)}>
                <option value="">请选择</option>
                {fieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {field}
                  </option>
                ))}
              </select>
            </label>
            <label className="col">
              <span>Y 轴字段</span>
              <select className="select" value={primaryY?.field ?? ""} onChange={(event) => setPrimaryYField(event.target.value)}>
                <option value="">请选择</option>
                {numericFields.length > 0
                  ? numericFields.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))
                  : fieldOptions.map((field) => (
                      <option key={field} value={field}>
                        {field}
                      </option>
                    ))}
              </select>
            </label>
            <label className="col">
              <span>聚合方式</span>
              <select className="select" value={primaryY?.agg ?? "sum"} onChange={(event) => setPrimaryAgg(event.target.value as FieldBinding["agg"])}>
                {["sum", "avg", "min", "max", "count", "distinctCount", "p50", "p95", "p99"].map((agg) => (
                  <option key={agg} value={agg}>
                    {agg}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(secondY)} onChange={(event) => setSecondAxis(event.target.checked)} />
              <span>添加第二轴</span>
            </label>
            {secondY ? (
              <label className="col">
                <span>第二轴字段</span>
                <select className="select" value={secondY.field} onChange={(event) => setSecondAxisField(event.target.value)}>
                  {numericFields.map((field) => (
                    <option key={field} value={field}>
                      {field}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <div className="row">
                {xBindings.length > 1 ? <span className="chip-warning">已启用多 X 轴</span> : <span className="muted">默认单 X 轴，适合大多数场景</span>}
                {shouldSuggestMultiXAxis && xBindings.length <= 1 ? <span className="chip">建议启用多 X 轴</span> : null}
              </div>
              <div className="row">
                <button className="btn mini-btn" onClick={autoMatchXAxis} disabled={fieldOptions.length === 0}>
                  一键自动匹配 X 轴
                </button>
                <button className="btn mini-btn" onClick={() => setXAxisAdvancedOpen((value) => !value)}>
                  {xAxisAdvancedOpen ? "收起高级X轴" : "显示高级X轴"}
                </button>
              </div>
            </div>
            {xAxisAdvancedOpen ? (
              <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>多 X 轴配置（高级）</strong>
                  <button className="btn mini-btn" onClick={addXAxisBinding} disabled={fieldOptions.length === 0}>
                    +X 轴
                  </button>
                </div>
                {xBindings.length === 0 ? <div className="muted">未配置 X 轴字段。</div> : null}
                {xBindings.map((binding, index) => (
                  <div key={`x_binding_${index}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                    <label className="col" style={{ minWidth: 150 }}>
                      <span>{`X 轴字段 #${index + 1}`}</span>
                      <select className="select" value={binding.field} onChange={(event) => updateXAxisBinding(index, { field: event.target.value })}>
                        {fieldOptions.map((field) => (
                          <option key={field} value={field}>
                            {field}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="col" style={{ width: 96 }}>
                      <span>轴序号</span>
                      <input
                        className="input"
                        type="number"
                        min={0}
                        value={xAxisIndexOfBinding(binding, index)}
                        onChange={(event) => updateXAxisBinding(index, { axis: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </label>
                    <button className="btn mini-btn danger" onClick={() => removeXAxisBinding(index)}>
                      删除
                    </button>
                  </div>
                ))}
                <label className="col">
                  <span>主指标绑定 X 轴</span>
                  <select className="select" value={Number(primaryY?.xAxis ?? 0)} onChange={(event) => setPrimaryYXAxis(Number(event.target.value) || 0)} disabled={xAxisEntries.length === 0}>
                    {xAxisEntries.map((entry, index) => (
                      <option key={`x_axis_map_${index}`} value={entry.axisIndex}>
                        {`xAxis[${entry.axisIndex}] · ${entry.binding.as ?? entry.binding.field}`}
                      </option>
                    ))}
                  </select>
                </label>
                {secondY ? (
                  <label className="col">
                    <span>第二轴指标绑定 X 轴</span>
                    <select className="select" value={Number(secondY.xAxis ?? 0)} onChange={(event) => setSecondAxisX(Number(event.target.value) || 0)} disabled={xAxisEntries.length === 0}>
                      {xAxisEntries.map((entry, index) => (
                        <option key={`x_axis_map_second_${index}`} value={entry.axisIndex}>
                          {`xAxis[${entry.axisIndex}] · ${entry.binding.as ?? entry.binding.field}`}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="muted" style={{ fontSize: 12 }}>
                  当前映射：{measureXAxisSummary}
                </div>
              </div>
            ) : null}
            <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>系列维度（可多个）</strong>
                <button className="btn mini-btn" onClick={addSeriesBinding} disabled={fieldOptions.length === 0}>
                  +系列
                </button>
              </div>
              {seriesBindings.length === 0 ? <div className="muted">未配置系列维度，当前仅单系列渲染。</div> : null}
              {seriesBindings.map((binding, index) => (
                <div key={`${binding.role}_${binding.field}_${index}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                  <label className="col" style={{ minWidth: 120 }}>
                    <span>角色</span>
                    <select className="select" value={binding.role} onChange={(event) => updateSeriesBinding(index, { role: event.target.value as FieldBinding["role"] })}>
                      <option value="series">series</option>
                      <option value="color">color</option>
                      <option value="facet">facet</option>
                    </select>
                  </label>
                  <label className="col" style={{ minWidth: 140 }}>
                    <span>字段</span>
                    <select className="select" value={binding.field} onChange={(event) => updateSeriesBinding(index, { field: event.target.value })}>
                      {fieldOptions.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="btn mini-btn danger" onClick={() => removeSeriesBinding(index)}>
                    删除
                  </button>
                </div>
              ))}
              <div className="muted" style={{ fontSize: 12 }}>
                支持多维拆分，渲染时按“维度1 / 维度2”组合系列，适用于多业务线、多地域等场景。
              </div>
            </div>
          </div>
          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>计算字段</strong>
              <button className="btn" onClick={addComputedField}>
                +计算字段
              </button>
            </div>
            {computedFields.length === 0 ? <div className="muted">暂无计算字段</div> : null}
            {computedFields.map((field, idx) => (
              <div key={`${field.name}_${idx}`} className="row">
                <input
                  className="input"
                  placeholder="字段名"
                  value={field.name}
                  onChange={(event) => updateComputedField(idx, { name: event.target.value })}
                />
                <input
                  className="input"
                  placeholder="表达式，例如: bytes / 1024"
                  value={field.expression}
                  onChange={(event) => updateComputedField(idx, { expression: event.target.value })}
                />
                <button className="btn danger" onClick={() => removeComputedField(idx)}>
                  删除
                </button>
              </div>
            ))}
            <div className="muted" style={{ fontSize: 12 }}>
              表达式支持数字运算和字段名引用，例如 `in_bps / out_bps`。
            </div>
          </div>
        </>
      ) : null}

      {activeTab === "style" ? (
        <>
          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <strong>快捷样式</strong>
            <div className="row">
              <button className="btn" title="一键切换暗色主题/恢复默认主题" onClick={toggleQuickDarkTheme}>
                {String(props.themeRef ?? "").includes("dark") ? "恢复主题" : "一键深色主题"}
              </button>
              <button className="btn" title="一键切换网格显示" onClick={toggleQuickGrid}>
                {props.gridShow === false ? "开启网格" : "一键无网格"}
              </button>
              <button className="btn" onClick={() => updateProps({ labelShow: !Boolean(props.labelShow) }, "quick toggle labels style")}>
                {props.labelShow ? "一键数据标签关闭" : "一键数据标签开启"}
              </button>
            </div>
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <strong>主题与配色</strong>
            <label className="col">
              <span>主题</span>
              <select className="select" value={props.themeRef ?? ""} onChange={(event) => updateProps({ themeRef: event.target.value }, "chart theme switch")}>
                <option value="">跟随文档</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col">
              <span>配色</span>
              <select className="select" value={props.paletteRef ?? ""} onChange={(event) => updateProps({ paletteRef: event.target.value }, "chart palette switch")}>
                <option value="">默认</option>
                <option value="palette.tech">palette.tech</option>
                <option value="palette.tech.dark">palette.tech.dark</option>
                <option value="palette.business">palette.business</option>
              </select>
            </label>
            <label className="col">
              <span>自定义调色板（逗号分隔）</span>
              <input className="input" value={paletteText} onChange={(event) => setPaletteText(event.target.value)} placeholder="#2563eb, #22c55e, #f59e0b" />
              <button className="btn" onClick={applyCustomPalette}>
                应用自定义色板
              </button>
            </label>
          </div>
        </>
      ) : null}

      {activeTab === "advanced" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <strong>高级配置</strong>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={Boolean(props.legendShow)} onChange={(event) => updateProps({ legendShow: event.target.checked }, "chart legend toggle")} />
              <span>图例</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={props.tooltipShow !== false} onChange={(event) => updateProps({ tooltipShow: event.target.checked }, "chart tooltip toggle")} />
              <span>提示框</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={props.gridShow !== false} onChange={(event) => updateProps({ gridShow: event.target.checked }, "chart grid toggle")} />
              <span>网格</span>
            </label>
          </div>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={Boolean(props.smooth)} onChange={(event) => updateProps({ smooth: event.target.checked }, "chart smooth toggle")} />
              <span>平滑</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(props.stack)} onChange={(event) => updateProps({ stack: event.target.checked }, "chart stack toggle")} />
              <span>堆叠</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(props.area)} onChange={(event) => updateProps({ area: event.target.checked }, "chart area toggle")} />
              <span>面积</span>
            </label>
          </div>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={props.xAxisShow !== false} onChange={(event) => updateProps({ xAxisShow: event.target.checked }, "chart x axis toggle")} />
              <span>X 轴</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={props.yAxisShow !== false} onChange={(event) => updateProps({ yAxisShow: event.target.checked }, "chart y axis toggle")} />
              <span>Y 轴</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(props.labelShow)} onChange={(event) => updateProps({ labelShow: event.target.checked }, "chart label toggle")} />
              <span>标签</span>
            </label>
          </div>
          <label className="col">
            <span>X 轴标题</span>
            <input className="input" value={String(props.xAxisTitle ?? "")} onChange={(event) => updateProps({ xAxisTitle: event.target.value }, "chart x title", 120)} />
          </label>
          <label className="col">
            <span>Y 轴标题</span>
            <input className="input" value={String(props.yAxisTitle ?? "")} onChange={(event) => updateProps({ yAxisTitle: event.target.value }, "chart y title", 120)} />
          </label>
          <label className="col">
            <span>值格式（valueFormat）</span>
            <input className="input" value={String(props.valueFormat ?? "")} onChange={(event) => updateProps({ valueFormat: event.target.value }, "chart value format", 120)} />
          </label>
          <label className="col">
            <span>时间格式（timeFormat）</span>
            <input className="input" value={String(props.timeFormat ?? "")} onChange={(event) => updateProps({ timeFormat: event.target.value }, "chart time format", 120)} />
          </label>
        </div>
      ) : null}
    </div>
  );
}

function TableInspector({
  doc,
  node,
  activeTab
}: {
  doc: VDoc;
  node: VNode;
  activeTab: InspectorTab;
}): JSX.Element {
  const store = useEditorStore();
  const props = (node.props ?? {}) as TableSpec;
  const sourceId = node.data?.sourceId ?? doc.dataSources?.[0]?.id ?? "";
  const sourceOptions = doc.dataSources ?? [];
  const queryOptions = doc.queries?.filter((query) => query.sourceId === sourceId) ?? [];
  const queryId = node.data?.queryId ?? queryOptions[0]?.queryId ?? "";
  const columns = props.columns ?? [];
  const headerRows = props.headerRows ?? [];
  const mergeCells = props.mergeCells ?? [];
  const pivot = props.pivot ?? {
    enabled: false,
    rowFields: [],
    columnField: "",
    valueField: "",
    agg: "sum" as const,
    fill: 0,
    valueTitle: "汇总值"
  };
  const inferredHeaderColumnCount = Math.max(
    0,
    ...headerRows.map((row) => row.reduce((sum, cell) => sum + Math.max(1, Number(cell.colSpan ?? 1)), 0))
  );
  const previewColumns =
    columns.length > 0
      ? columns
      : Array.from({ length: inferredHeaderColumnCount }, (_, index) => ({
          key: `h_${index + 1}`,
          title: `列${index + 1}`,
          align: "center" as const
        }));
  const headerPreviewRows =
    headerRows.length > 0 && previewColumns.length > 0
      ? buildTableRenderModel({ columns: previewColumns, headerRows }, []).headerRows
      : [];

  const updateProps = (partial: Partial<TableSpec>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: node.id,
        props: partial as unknown as Record<string, unknown>
      },
      { summary, mergeWindowMs }
    );
  };

  const updateData = (partial: Record<string, unknown>, summary: string): void => {
    store.executeCommand(
      {
        type: "UpdateData",
        nodeId: node.id,
        data: partial
      },
      { summary }
    );
  };

  const updateColumn = (index: number, patch: Partial<NonNullable<TableSpec["columns"]>[number]>): void => {
    const next = [...columns];
    const current = next[index] ?? { key: `col_${index + 1}` };
    next[index] = { ...current, ...patch };
    updateProps({ columns: next }, "table update column", 120);
  };

  const removeColumn = (index: number): void => {
    updateProps({ columns: columns.filter((_, idx) => idx !== index) }, "table remove column");
  };

  const addColumn = (): void => {
    const next = [...columns, { key: `col_${columns.length + 1}`, title: `列${columns.length + 1}`, align: "left" as const }];
    updateProps({ columns: next }, "table add column");
  };

  const updateHeaderCell = (
    rowIndex: number,
    cellIndex: number,
    patch: Partial<NonNullable<NonNullable<TableSpec["headerRows"]>[number][number]>>
  ): void => {
    const next = headerRows.map((row, idx) => {
      if (idx !== rowIndex) {
        return row;
      }
      return row.map((cell, cidx) => (cidx === cellIndex ? { ...cell, ...patch } : cell));
    });
    updateProps({ headerRows: next }, "table update header cell", 120);
  };

  const addHeaderRow = (): void => {
    const next = [...headerRows, [{ text: `表头${headerRows.length + 1}`, colSpan: 1, rowSpan: 1, align: "center" as const }]];
    updateProps({ headerRows: next }, "table add header row");
  };

  const buildHeaderFromColumns = (): void => {
    if (columns.length === 0) {
      return;
    }
    const next = [
      columns.map((column) => ({
        text: column.title ?? column.key,
        colSpan: 1,
        rowSpan: 1,
        align: "center" as const
      }))
    ];
    updateProps({ headerRows: next }, "table build header from columns");
  };

  const removeHeaderRow = (rowIndex: number): void => {
    updateProps({ headerRows: headerRows.filter((_, idx) => idx !== rowIndex) }, "table remove header row");
  };

  const addHeaderCell = (rowIndex: number): void => {
    const next = headerRows.map((row, idx) =>
      idx === rowIndex ? [...row, { text: `单元格${row.length + 1}`, colSpan: 1, rowSpan: 1, align: "center" as const }] : row
    );
    updateProps({ headerRows: next }, "table add header cell");
  };

  const removeHeaderCell = (rowIndex: number, cellIndex: number): void => {
    const next = headerRows.map((row, idx) => (idx === rowIndex ? row.filter((_, cidx) => cidx !== cellIndex) : row));
    updateProps({ headerRows: next }, "table remove header cell");
  };

  const adjustHeaderSpan = (rowIndex: number, cellIndex: number, key: "colSpan" | "rowSpan", delta: number): void => {
    const cell = headerRows[rowIndex]?.[cellIndex];
    if (!cell) {
      return;
    }
    const current = Math.max(1, Number(cell[key] ?? 1));
    updateHeaderCell(rowIndex, cellIndex, { [key]: Math.max(1, current + delta) });
  };

  const updateMergeCell = (index: number, patch: Partial<NonNullable<TableSpec["mergeCells"]>[number]>): void => {
    const next = mergeCells.map((cell, idx) => (idx === index ? { ...cell, ...patch } : cell));
    updateProps({ mergeCells: next }, "table update merge cell", 120);
  };

  const addMergeCell = (): void => {
    const next = [...mergeCells, { row: 0, col: 0, rowSpan: 1, colSpan: 1, scope: "header" as const }];
    updateProps({ mergeCells: next }, "table add merge cell");
  };

  const removeMergeCell = (index: number): void => {
    updateProps({ mergeCells: mergeCells.filter((_, idx) => idx !== index) }, "table remove merge cell");
  };

  const updatePivot = (patch: Partial<NonNullable<TableSpec["pivot"]>>): void => {
    updateProps({ pivot: { ...pivot, ...patch } }, "table update pivot", 120);
  };

  return (
    <div className="col">
      {activeTab === "basic" ? (
        <>
          <label className="col">
            <span>表格标题</span>
            <input className="input" value={String(props.titleText ?? "")} onChange={(event) => updateProps({ titleText: event.target.value }, "table title", 140)} />
          </label>
          <label className="col">
            <span>最大行数</span>
            <input
              className="input"
              type="number"
              value={Number(props.maxRows ?? 200)}
              onChange={(event) => updateProps({ maxRows: Math.max(1, Number(event.target.value) || 1) }, "table max rows")}
            />
          </label>
        </>
      ) : null}

      {activeTab === "data" ? (
        <>
          <label className="col">
            <span>Data Source</span>
            <select className="select" value={sourceId} onChange={(event) => updateData({ sourceId: event.target.value }, "table source change")} disabled={sourceOptions.length === 0}>
              {sourceOptions.length > 0 ? (
                sourceOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))
              ) : (
                <option value="">无数据源</option>
              )}
            </select>
          </label>
          <label className="col">
            <span>Query</span>
            <select className="select" value={queryId} onChange={(event) => updateData({ queryId: event.target.value }, "table query change")} disabled={queryOptions.length === 0}>
              {queryOptions.length > 0 ? (
                queryOptions.map((item) => (
                  <option key={item.queryId} value={item.queryId}>
                    {item.queryId}
                  </option>
                ))
              ) : (
                <option value="">无查询</option>
              )}
            </select>
          </label>
        </>
      ) : null}

      {activeTab === "style" ? (
        <div className="row">
          <label className="row">
            <input type="checkbox" checked={props.repeatHeader ?? true} onChange={(event) => updateProps({ repeatHeader: event.target.checked }, "table repeat header")} />
            <span>重复表头（导出）</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={props.zebra ?? true} onChange={(event) => updateProps({ zebra: event.target.checked }, "table zebra")} />
            <span>斑马纹</span>
          </label>
        </div>
      ) : null}

      {activeTab === "advanced" ? (
        <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
          <div className="col">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>列定义</strong>
              <button className="btn" onClick={addColumn}>
                +新增列
              </button>
            </div>
            {columns.length === 0 ? <div className="muted">暂无列定义</div> : null}
            {columns.map((column, idx) => (
              <div key={`${column.key}_${idx}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="col" style={{ minWidth: 120 }}>
                  <span>Key</span>
                  <input className="input" value={column.key} onChange={(event) => updateColumn(idx, { key: event.target.value })} />
                </label>
                <label className="col" style={{ minWidth: 120 }}>
                  <span>标题</span>
                  <input className="input" value={String(column.title ?? "")} onChange={(event) => updateColumn(idx, { title: event.target.value })} />
                </label>
                <label className="col" style={{ width: 96 }}>
                  <span>宽度</span>
                  <input
                    className="input"
                    type="number"
                    value={Number(column.width ?? 0)}
                    onChange={(event) => updateColumn(idx, { width: Math.max(0, Number(event.target.value) || 0) || undefined })}
                  />
                </label>
                <label className="col" style={{ width: 108 }}>
                  <span>对齐</span>
                  <select className="select" value={column.align ?? "left"} onChange={(event) => updateColumn(idx, { align: event.target.value as "left" | "center" | "right" })}>
                    <option value="left">left</option>
                    <option value="center">center</option>
                    <option value="right">right</option>
                  </select>
                </label>
                <button className="btn danger" onClick={() => removeColumn(idx)}>
                  删列
                </button>
              </div>
            ))}
          </div>

          <div className="col table-header-designer">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>多级表头设计器</strong>
              <div className="row">
                <button className="btn mini-btn" onClick={buildHeaderFromColumns} disabled={columns.length === 0}>
                  从列生成
                </button>
                <button className="btn mini-btn" onClick={addHeaderRow}>
                  +表头行
                </button>
              </div>
            </div>
            {headerRows.length === 0 ? <div className="muted">暂无多级表头，可先从列定义自动生成。</div> : null}
            {headerRows.map((row, rowIndex) => (
              <div key={`header_row_${rowIndex}`} className="table-header-row-card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{`第 ${rowIndex + 1} 行`}</strong>
                  <div className="row">
                    <button className="btn mini-btn" onClick={() => addHeaderCell(rowIndex)}>
                      +单元格
                    </button>
                    <button className="btn mini-btn danger" onClick={() => removeHeaderRow(rowIndex)}>
                      删除行
                    </button>
                  </div>
                </div>
                <div className="table-header-cell-list">
                  {row.map((cell, cellIndex) => (
                    <div key={`header_cell_${rowIndex}_${cellIndex}`} className="table-header-cell-card">
                      <input
                        className="input"
                        value={String(cell.text ?? cell.title ?? "")}
                        onChange={(event) => updateHeaderCell(rowIndex, cellIndex, { text: event.target.value })}
                        placeholder="表头文本"
                      />
                      <div className="row">
                        <span className="muted">列跨</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "colSpan", -1)}>
                          -
                        </button>
                        <span className="chip">{Math.max(1, Number(cell.colSpan ?? 1))}</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "colSpan", 1)}>
                          +
                        </button>
                        <span className="muted">行跨</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "rowSpan", -1)}>
                          -
                        </button>
                        <span className="chip">{Math.max(1, Number(cell.rowSpan ?? 1))}</span>
                        <button className="btn mini-btn" onClick={() => adjustHeaderSpan(rowIndex, cellIndex, "rowSpan", 1)}>
                          +
                        </button>
                      </div>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <select className="select mini-select" value={cell.align ?? "center"} onChange={(event) => updateHeaderCell(rowIndex, cellIndex, { align: event.target.value as "left" | "center" | "right" })}>
                          <option value="left">left</option>
                          <option value="center">center</option>
                          <option value="right">right</option>
                        </select>
                        <button className="btn mini-btn danger" onClick={() => removeHeaderCell(rowIndex, cellIndex)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {headerPreviewRows.length > 0 ? (
              <div className="table-header-preview-wrap">
                <strong>表头实时预览</strong>
                <div className="table-header-preview-scroll">
                  <table className="table-header-preview">
                    <tbody>
                      {headerPreviewRows.map((row, rowIndex) => (
                        <tr key={`preview_row_${rowIndex}`}>
                          {row.map((cell, cellIndex) =>
                            cell.hidden ? null : (
                              <td key={`preview_cell_${rowIndex}_${cellIndex}`} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={{ textAlign: cell.align }}>
                                <span>{cell.text || "-"}</span>
                                <small>{`r${cell.rowSpan} c${cell.colSpan}`}</small>
                              </td>
                            )
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  预览按当前列定义与表头配置渲染，用于快速校验合并是否正确。
                </div>
              </div>
            ) : null}
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>精确合并规则（可选）</strong>
              <button className="btn" onClick={addMergeCell}>
                +新增合并
              </button>
            </div>
            {mergeCells.length === 0 ? <div className="muted">暂无合并配置</div> : null}
            {mergeCells.map((cell, idx) => (
              <div key={`merge_${idx}`} className="row" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
                <label className="col" style={{ width: 72 }}>
                  <span>row</span>
                  <input className="input" type="number" value={Number(cell.row ?? 0)} onChange={(event) => updateMergeCell(idx, { row: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label className="col" style={{ width: 72 }}>
                  <span>col</span>
                  <input className="input" type="number" value={Number(cell.col ?? 0)} onChange={(event) => updateMergeCell(idx, { col: Math.max(0, Number(event.target.value) || 0) })} />
                </label>
                <label className="col" style={{ width: 92 }}>
                  <span>rowSpan</span>
                  <input
                    className="input"
                    type="number"
                    value={Number(cell.rowSpan ?? 1)}
                    onChange={(event) => updateMergeCell(idx, { rowSpan: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <label className="col" style={{ width: 92 }}>
                  <span>colSpan</span>
                  <input
                    className="input"
                    type="number"
                    value={Number(cell.colSpan ?? 1)}
                    onChange={(event) => updateMergeCell(idx, { colSpan: Math.max(1, Number(event.target.value) || 1) })}
                  />
                </label>
                <label className="col" style={{ width: 120 }}>
                  <span>scope</span>
                  <select className="select" value={cell.scope ?? "header"} onChange={(event) => updateMergeCell(idx, { scope: event.target.value as "header" | "body" })}>
                    <option value="header">header</option>
                    <option value="body">body</option>
                  </select>
                </label>
                <button className="btn mini-btn danger" onClick={() => removeMergeCell(idx)}>
                  删除
                </button>
              </div>
            ))}
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <strong>透视配置</strong>
            <label className="row">
              <input type="checkbox" checked={Boolean(pivot.enabled)} onChange={(event) => updatePivot({ enabled: event.target.checked })} />
              <span>启用 Pivot</span>
            </label>
            <label className="col">
              <span>行字段（逗号分隔）</span>
              <input
                className="input"
                value={pivot.rowFields.join(", ")}
                onChange={(event) =>
                  updatePivot({
                    rowFields: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                  })
                }
              />
            </label>
            <label className="col">
              <span>列字段</span>
              <input className="input" value={pivot.columnField} onChange={(event) => updatePivot({ columnField: event.target.value })} />
            </label>
            <label className="col">
              <span>值字段</span>
              <input className="input" value={pivot.valueField} onChange={(event) => updatePivot({ valueField: event.target.value })} />
            </label>
            <label className="col">
              <span>聚合</span>
              <select className="select" value={pivot.agg ?? "sum"} onChange={(event) => updatePivot({ agg: event.target.value as "sum" | "avg" | "min" | "max" | "count" })}>
                <option value="sum">sum</option>
                <option value="avg">avg</option>
                <option value="min">min</option>
                <option value="max">max</option>
                <option value="count">count</option>
              </select>
            </label>
            <label className="col">
              <span>缺省填充值</span>
              <input className="input" type="number" value={Number(pivot.fill ?? 0)} onChange={(event) => updatePivot({ fill: Number(event.target.value) || 0 })} />
            </label>
            <label className="col">
              <span>值标题</span>
              <input className="input" value={pivot.valueTitle ?? ""} onChange={(event) => updatePivot({ valueTitle: event.target.value })} />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DocumentInspector({ doc, activeTab }: { doc: VDoc; activeTab: InspectorTab }): JSX.Element {
  const store = useEditorStore();
  const rootProps = (doc.root.props ?? {}) as Record<string, unknown>;
  const pageSize = typeof rootProps.pageSize === "string" ? rootProps.pageSize : "A4";
  const paginationStrategy = rootProps.paginationStrategy === "continuous" ? "continuous" : "section";
  const marginPreset = typeof rootProps.marginPreset === "string" ? rootProps.marginPreset : "normal";
  const pptSize = typeof rootProps.size === "string" ? rootProps.size : "16:9";

  const updateDoc = (partial: Record<string, unknown>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateDoc",
        doc: partial
      },
      { summary, mergeWindowMs }
    );
  };

  const updateRootProps = (partial: Record<string, unknown>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: doc.root.id,
        props: partial
      },
      { summary, mergeWindowMs }
    );
  };

  const applyReportMarginPreset = (preset: "narrow" | "normal" | "wide" | "custom"): void => {
    if (preset === "custom") {
      updateRootProps({ marginPreset: "custom" }, "update report margin preset");
      return;
    }
    const value = preset === "narrow" ? 10 : preset === "wide" ? 20 : 14;
    updateRootProps(
      {
        marginPreset: preset,
        marginTopMm: value,
        marginRightMm: value,
        marginBottomMm: value,
        marginLeftMm: value
      },
      "update report margin preset"
    );
  };

  return (
    <div className="col">
      {activeTab === "basic" ? (
        <>
          <div className="muted inspector-help-text">仅保留可编辑配置；文档识别信息在下方“技术信息”中查看。</div>
          <label className="col">
            <span>文档标题</span>
            <input className="input" value={String(doc.title ?? "")} onChange={(event) => updateDoc({ title: event.target.value }, "update doc title", 140)} />
          </label>
          <label className="col">
            <span>语言区域</span>
            <input className="input" value={String(doc.locale ?? "")} onChange={(event) => updateDoc({ locale: event.target.value }, "update doc locale", 140)} placeholder="zh-CN" />
          </label>
          <label className="col">
            <span>文档主题</span>
            <select className="select" value={doc.themeId ?? themes[0]?.id ?? ""} onChange={(event) => store.executeCommand({ type: "ApplyTheme", scope: "doc", themeId: event.target.value }, { summary: `apply theme ${event.target.value}` })}>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          {doc.docType === "dashboard" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>公共头脚（快捷）</strong>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle dashboard header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={Boolean(rootProps.footerShow)} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle dashboard footer")} />
                  <span>页脚</span>
                </label>
              </div>
              <label className="col">
                <span>页眉文案</span>
                <input className="input" value={String(rootProps.headerText ?? rootProps.dashTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ headerText: event.target.value }, "update dashboard header text", 140)} />
              </label>
              <label className="col">
                <span>页脚文案</span>
                <input className="input" value={String(rootProps.footerText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ footerText: event.target.value }, "update dashboard footer text", 140)} />
              </label>
            </div>
          ) : null}
          {doc.docType === "report" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>公共头脚（快捷）</strong>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.footerShow !== false} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle footer")} />
                  <span>页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.showPageNumber !== false} onChange={(event) => updateRootProps({ showPageNumber: event.target.checked }, "toggle page number")} />
                  <span>页码</span>
                </label>
              </div>
              <label className="col">
                <span>页眉文案</span>
                <input className="input" value={String(rootProps.headerText ?? rootProps.reportTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ headerText: event.target.value }, "update report header text", 140)} />
              </label>
              <label className="col">
                <span>页脚文案</span>
                <input className="input" value={String(rootProps.footerText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ footerText: event.target.value }, "update report footer text", 140)} />
              </label>
            </div>
          ) : null}
          {doc.docType === "ppt" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>公共头脚（快捷）</strong>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowHeader !== false} onChange={(event) => updateRootProps({ masterShowHeader: event.target.checked }, "toggle ppt master header")} />
                  <span>母版页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowFooter !== false} onChange={(event) => updateRootProps({ masterShowFooter: event.target.checked }, "toggle ppt master footer")} />
                  <span>母版页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowSlideNumber !== false} onChange={(event) => updateRootProps({ masterShowSlideNumber: event.target.checked }, "toggle ppt slide number")} />
                  <span>页码</span>
                </label>
              </div>
              <label className="col">
                <span>母版页眉文案</span>
                <input className="input" value={String(rootProps.masterHeaderText ?? doc.title ?? "")} onChange={(event) => updateRootProps({ masterHeaderText: event.target.value }, "update ppt master header text", 140)} />
              </label>
              <label className="col">
                <span>母版页脚文案</span>
                <input className="input" value={String(rootProps.masterFooterText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ masterFooterText: event.target.value }, "update ppt master footer text", 140)} />
              </label>
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "style" ? (
        <>
          {doc.docType === "dashboard" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>Dashboard 全局属性</strong>
              <label className="col">
                <span>标题</span>
                <input className="input" value={String(rootProps.dashTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ dashTitle: event.target.value }, "update dashboard title", 140)} />
              </label>
              <label className="col">
                <span>展示模式</span>
                <select className="select" value={String(rootProps.displayMode ?? "fit_screen")} onChange={(event) => updateRootProps({ displayMode: event.target.value }, "update dashboard display mode")}>
                  <option value="fit_screen">全屏适配</option>
                  <option value="scroll_page">页面滚动</option>
                </select>
              </label>
              <div className="row">
                <NumberInput label="网格列数" value={Number(rootProps.gridCols ?? 12)} onChange={(value) => updateRootProps({ gridCols: Math.max(1, value) }, "update dashboard grid cols")} />
                <NumberInput label="卡片行高" value={Number(rootProps.rowH ?? 56)} onChange={(value) => updateRootProps({ rowH: Math.max(1, value) }, "update dashboard row height")} />
                <NumberInput label="卡片间距" value={Number(rootProps.gap ?? 16)} onChange={(value) => updateRootProps({ gap: Math.max(0, value) }, "update dashboard gap")} />
              </div>
              <div className="row">
                <NumberInput label="设计宽度" value={Number(rootProps.designWidthPx ?? 1920)} onChange={(value) => updateRootProps({ designWidthPx: Math.max(320, value) }, "update dashboard design width")} />
                <NumberInput label="设计高度" value={Number(rootProps.designHeightPx ?? 1080)} onChange={(value) => updateRootProps({ designHeightPx: Math.max(240, value) }, "update dashboard design height")} />
                <NumberInput label="页面宽度" value={Number(rootProps.pageWidthPx ?? 1280)} onChange={(value) => updateRootProps({ pageWidthPx: Math.max(320, value) }, "update dashboard page width")} />
                <NumberInput label="页面边距" value={Number(rootProps.pageMarginPx ?? 24)} onChange={(value) => updateRootProps({ pageMarginPx: Math.max(0, value) }, "update dashboard page margin")} />
              </div>
              <label className="row">
                <input type="checkbox" checked={rootProps.showFilterBar !== false} onChange={(event) => updateRootProps({ showFilterBar: event.target.checked }, "toggle dashboard filter bar")} />
                <span>显示筛选栏</span>
              </label>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle dashboard header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={Boolean(rootProps.footerShow)} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle dashboard footer")} />
                  <span>页脚</span>
                </label>
              </div>
              <label className="col">
                <span>页眉文案</span>
                <input className="input" value={String(rootProps.headerText ?? rootProps.dashTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ headerText: event.target.value }, "update dashboard header text", 140)} />
              </label>
              <label className="col">
                <span>页脚文案</span>
                <input className="input" value={String(rootProps.footerText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ footerText: event.target.value }, "update dashboard footer text", 140)} />
              </label>
            </div>
          ) : null}

          {doc.docType === "report" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>Report 全局属性</strong>
              <label className="col">
                <span>报告标题</span>
                <input className="input" value={String(rootProps.reportTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ reportTitle: event.target.value }, "update report title", 140)} />
              </label>
              <label className="col">
                <span>纸张</span>
                <select className="select" value={pageSize} onChange={(event) => updateRootProps({ pageSize: event.target.value }, "update report page size")}>
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </label>
              <label className="col">
                <span>分页策略</span>
                <select className="select" value={paginationStrategy} onChange={(event) => updateRootProps({ paginationStrategy: event.target.value }, "update report pagination strategy")}>
                  <option value="section">section</option>
                  <option value="continuous">continuous</option>
                </select>
              </label>
              <label className="col">
                <span>页边距预设</span>
                <select className="select" value={marginPreset} onChange={(event) => applyReportMarginPreset(event.target.value as "narrow" | "normal" | "wide" | "custom")}>
                  <option value="narrow">narrow</option>
                  <option value="normal">normal</option>
                  <option value="wide">wide</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              {marginPreset === "custom" ? (
                <div className="row">
                  <NumberInput label="top(mm)" value={Number(rootProps.marginTopMm ?? 14)} onChange={(value) => updateRootProps({ marginTopMm: Math.max(6, value) }, "update report margin top")} />
                  <NumberInput label="right(mm)" value={Number(rootProps.marginRightMm ?? 14)} onChange={(value) => updateRootProps({ marginRightMm: Math.max(6, value) }, "update report margin right")} />
                  <NumberInput label="bottom(mm)" value={Number(rootProps.marginBottomMm ?? 14)} onChange={(value) => updateRootProps({ marginBottomMm: Math.max(6, value) }, "update report margin bottom")} />
                  <NumberInput label="left(mm)" value={Number(rootProps.marginLeftMm ?? 14)} onChange={(value) => updateRootProps({ marginLeftMm: Math.max(6, value) }, "update report margin left")} />
                </div>
              ) : null}
              <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <strong>布局参数</strong>
                <div className="row">
                  <NumberInput label="bodyPadding(px)" value={Number(rootProps.bodyPaddingPx ?? 12)} onChange={(value) => updateRootProps({ bodyPaddingPx: Math.max(0, value) }, "update report body padding")} />
                  <NumberInput label="sectionGap(px)" value={Number(rootProps.sectionGapPx ?? 12)} onChange={(value) => updateRootProps({ sectionGapPx: Math.max(0, value) }, "update report section gap")} />
                  <NumberInput label="blockGap(px)" value={Number(rootProps.blockGapPx ?? 8)} onChange={(value) => updateRootProps({ blockGapPx: Math.max(0, value) }, "update report block gap")} />
                </div>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.tocShow !== false} onChange={(event) => updateRootProps({ tocShow: event.target.checked }, "toggle toc")} />
                  <span>目录页</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.coverEnabled !== false} onChange={(event) => updateRootProps({ coverEnabled: event.target.checked }, "toggle cover")} />
                  <span>封面</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.summaryEnabled !== false} onChange={(event) => updateRootProps({ summaryEnabled: event.target.checked }, "toggle summary")} />
                  <span>总结页</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.footerShow !== false} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle footer")} />
                  <span>页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.showPageNumber !== false} onChange={(event) => updateRootProps({ showPageNumber: event.target.checked }, "toggle page number")} />
                  <span>页码</span>
                </label>
              </div>
            </div>
          ) : null}

          {doc.docType === "ppt" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>PPT 全局属性</strong>
              <label className="col">
                <span>页面尺寸</span>
                <select className="select" value={pptSize} onChange={(event) => updateRootProps({ size: event.target.value }, "update ppt size")}>
                  <option value="16:9">16:9</option>
                  <option value="4:3">4:3</option>
                </select>
              </label>
              <label className="col">
                <span>默认背景色</span>
                <input className="input" value={String(rootProps.defaultBg ?? "#ffffff")} onChange={(event) => updateRootProps({ defaultBg: event.target.value }, "update ppt default bg", 140)} />
              </label>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowHeader !== false} onChange={(event) => updateRootProps({ masterShowHeader: event.target.checked }, "toggle ppt master header")} />
                  <span>母版页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowFooter !== false} onChange={(event) => updateRootProps({ masterShowFooter: event.target.checked }, "toggle ppt master footer")} />
                  <span>母版页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowSlideNumber !== false} onChange={(event) => updateRootProps({ masterShowSlideNumber: event.target.checked }, "toggle ppt slide number")} />
                  <span>页码</span>
                </label>
              </div>
              <label className="col">
                <span>母版页眉文案</span>
                <input className="input" value={String(rootProps.masterHeaderText ?? doc.title ?? "")} onChange={(event) => updateRootProps({ masterHeaderText: event.target.value }, "update ppt master header text", 140)} />
              </label>
              <label className="col">
                <span>母版页脚文案</span>
                <input className="input" value={String(rootProps.masterFooterText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ masterFooterText: event.target.value }, "update ppt master footer text", 140)} />
              </label>
              <label className="col">
                <span>母版强调色</span>
                <input className="input" value={String(rootProps.masterAccentColor ?? "#1d4ed8")} onChange={(event) => updateRootProps({ masterAccentColor: event.target.value }, "update ppt master accent color", 140)} />
              </label>
              <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <strong>布局参数</strong>
                <div className="row">
                  <NumberInput label="padX(px)" value={Number(rootProps.masterPaddingXPx ?? 24)} onChange={(value) => updateRootProps({ masterPaddingXPx: Math.max(0, value) }, "update ppt master padX")} />
                  <NumberInput label="headerTop(px)" value={Number(rootProps.masterHeaderTopPx ?? 12)} onChange={(value) => updateRootProps({ masterHeaderTopPx: Math.max(0, value) }, "update ppt header top")} />
                  <NumberInput label="headerH(px)" value={Number(rootProps.masterHeaderHeightPx ?? 26)} onChange={(value) => updateRootProps({ masterHeaderHeightPx: Math.max(12, value) }, "update ppt header height")} />
                </div>
                <div className="row">
                  <NumberInput label="footerBottom(px)" value={Number(rootProps.masterFooterBottomPx ?? 10)} onChange={(value) => updateRootProps({ masterFooterBottomPx: Math.max(0, value) }, "update ppt footer bottom")} />
                  <NumberInput label="footerH(px)" value={Number(rootProps.masterFooterHeightPx ?? 22)} onChange={(value) => updateRootProps({ masterFooterHeightPx: Math.max(12, value) }, "update ppt footer height")} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {activeTab === "advanced" ? <LayoutEditor node={doc.root} /> : null}
    </div>
  );
}

function LayoutEditor({ node }: { node: VNode }): JSX.Element {
  const store = useEditorStore();
  const layout = (node.layout ?? {}) as Record<string, unknown>;
  const mode = (layout.mode as string | undefined) ?? "flow";
  const isGrid = mode === "grid";
  const isAbsolute = mode === "absolute";

  const update = (key: string, value: number | string): void => {
    store.executeCommand(
      {
        type: "UpdateLayout",
        nodeId: node.id,
        layout: { [key]: value }
      },
      { summary: `layout ${key}`, mergeWindowMs: 140 }
    );
  };

  return (
    <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
      <strong>Layout</strong>
      <label className="col">
        <span>Mode</span>
        <select className="select" value={mode} onChange={(event) => update("mode", event.target.value)}>
          {["flow", "grid", "absolute"].map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>

      {isGrid ? (
        <div className="row">
          <NumberInput label="gx" value={Number(layout["gx"] ?? 0)} onChange={(value) => update("gx", value)} />
          <NumberInput label="gy" value={Number(layout["gy"] ?? 0)} onChange={(value) => update("gy", value)} />
          <NumberInput label="gw" value={Number(layout["gw"] ?? 4)} onChange={(value) => update("gw", value)} />
          <NumberInput label="gh" value={Number(layout["gh"] ?? 4)} onChange={(value) => update("gh", value)} />
        </div>
      ) : null}

      {isAbsolute ? (
        <div className="row">
          <NumberInput label="x" value={Number(layout["x"] ?? 0)} onChange={(value) => update("x", value)} />
          <NumberInput label="y" value={Number(layout["y"] ?? 0)} onChange={(value) => update("y", value)} />
          <NumberInput label="w" value={Number(layout["w"] ?? 200)} onChange={(value) => update("w", value)} />
          <NumberInput label="h" value={Number(layout["h"] ?? 120)} onChange={(value) => update("h", value)} />
        </div>
      ) : null}
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="col" style={{ minWidth: 60 }}>
      <span>{label}</span>
      <input className="input" type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

const formatMetaValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "-";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const findNodeById = (root: VNode, nodeId: string): VNode | undefined => {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNodeById(child, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
};

const tabsByNode = (node: VNode): InspectorTab[] => {
  if (node.kind === "chart" || node.kind === "table") {
    return ["basic", "data", "style", "advanced"];
  }
  if (node.kind === "text") {
    return ["basic", "style", "advanced"];
  }
  return ["basic", "advanced"];
};

const getPreviewRows = (doc: VDoc, node: VNode, spec: ChartSpec): Array<Record<string, unknown>> => {
  const sourceId = node.data?.sourceId;
  const source = doc.dataSources?.find((item) => item.id === sourceId);
  if (!source || source.type !== "static" || !Array.isArray(source.staticData)) {
    return [];
  }
  const baseRows = source.staticData.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  const withComputed = applyComputedFields(baseRows, spec);
  return applyFilters(withComputed, doc.filters ?? [], node);
};

const findParentAndIndex = (root: VNode, targetId: string): { parent: VNode; index: number } | undefined => {
  const children = root.children ?? [];
  const index = children.findIndex((item) => item.id === targetId);
  if (index >= 0) {
    return { parent: root, index };
  }
  for (const child of children) {
    const nested = findParentAndIndex(child, targetId);
    if (nested) {
      return nested;
    }
  }
  return undefined;
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

const insertSummaryNode = (
  doc: VDoc,
  chartNode: VNode,
  summary: string,
  execute: (command: { type: "InsertNode"; parentId: string; index?: number; node: VNode }, summary: string) => boolean
): boolean => {
  if (doc.docType === "dashboard") {
    const root = doc.root;
    const maxGy = Math.max(
      0,
      ...(root.children ?? []).map((item) => Number(item.layout?.mode === "grid" ? (item.layout.gy ?? 0) + (item.layout.gh ?? 4) : 0))
    );
    return execute(
      {
        type: "InsertNode",
        parentId: root.id,
        node: {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "grid", gx: 0, gy: maxGy, gw: 12, gh: 2 },
          props: { text: summary, format: "plain" }
        }
      },
      "insert dashboard summary"
    );
  }

  if (doc.docType === "report") {
    const parentInfo = findParentAndIndex(doc.root, chartNode.id);
    if (!parentInfo) {
      return false;
    }
    return execute(
      {
        type: "InsertNode",
        parentId: parentInfo.parent.id,
        index: parentInfo.index + 1,
        node: {
          id: prefixedId("text"),
          kind: "text",
          props: { text: summary, format: "plain" }
        }
      },
      "insert report summary"
    );
  }

  if (doc.docType === "ppt") {
    const slide = findAncestorKind(doc.root, chartNode.id, "slide");
    if (!slide) {
      return false;
    }
    const x = Number(chartNode.layout?.x ?? 40);
    const y = Number(chartNode.layout?.y ?? 90);
    const w = Math.max(220, Number(chartNode.layout?.w ?? 430));
    const h = Math.max(90, Math.round(Number(chartNode.layout?.h ?? 200) * 0.35));
    return execute(
      {
        type: "InsertNode",
        parentId: slide.id,
        node: {
          id: prefixedId("text"),
          kind: "text",
          layout: { mode: "absolute", x, y: y + Math.round(Number(chartNode.layout?.h ?? 220)) + 10, w, h, z: 2 },
          props: { text: summary, format: "plain" },
          style: { bg: "#f8fbff", pad: 10, borderW: 1, borderC: "#dbeafe", radius: 8 }
        }
      },
      "insert slide summary"
    );
  }

  return false;
};
