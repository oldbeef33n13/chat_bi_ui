import { useEffect, useRef, useState } from "react";
import type { ChartSpec, FieldBinding, VDoc, VNode } from "../../../core/doc/types";
import { themes } from "../../../runtime/theme/themes";
import type { DataEndpointMeta } from "../../api/data-endpoint-repository";
import { HttpDataEndpointRepository } from "../../api/http-data-endpoint-repository";
import { useEditorStore } from "../../state/editor-context";
import { ColorPaletteField } from "../ColorPaletteField";
import { DataGuideDialog } from "../DataGuideDialog";
import { NodeStyleInspector } from "../NodeStyleInspector";
import { TextStyleEditor } from "../TextStyleEditor";
import {
  ChartStatModeDialog,
  ParamBindingEditorDialog,
  describeParamBinding,
  describeResolvedParams,
  describeStatNarrative,
  extractSourceSampleRows,
  findFieldMeta,
  formatNamedLabel,
  type InspectorTab,
  isMeasureRole,
  isSeriesRole
} from "./shared";
import {
  chartTypeOptions,
  extractSourceFields,
  formatSourceFieldLabel,
  inferRecommendedAgg,
  recommendBindings,
  recommendChartConfig,
  requestAiChartRecommend
} from "../../utils/chart-recommend";
import { summarizeChartRows } from "../../utils/chart-summary";
import { extractEndpointFields, resolveDataEndpointParams } from "../../utils/data-endpoint-binding";
import { getPreviewRows, insertSummaryNode } from "./node-helpers";

export function ChartInspector({
  doc,
  node,
  activeTab,
  endpoints
}: {
  doc: VDoc;
  node: VNode;
  activeTab: InspectorTab;
  endpoints: DataEndpointMeta[];
}): JSX.Element {
  const store = useEditorStore();
  const endpointRepoRef = useRef(new HttpDataEndpointRepository("/api/v1"));
  const props = (node.props ?? { chartType: "line", bindings: [] }) as ChartSpec;
  const bindings = props.bindings ?? [];
  const [recommendHint, setRecommendHint] = useState("");
  const [paletteColors, setPaletteColors] = useState<string[]>([]);
  const [summaryHint, setSummaryHint] = useState("");
  const [aiRecommendLoading, setAiRecommendLoading] = useState(false);
  const [endpointTestRows, setEndpointTestRows] = useState<Array<Record<string, unknown>>>([]);
  const [endpointTesting, setEndpointTesting] = useState(false);
  const [endpointTestError, setEndpointTestError] = useState("");
  const [paramEditorOpen, setParamEditorOpen] = useState(false);
  const [dataGuideOpen, setDataGuideOpen] = useState(false);
  const [aggEditorOpen, setAggEditorOpen] = useState(false);

  const sourceOptions = doc.dataSources ?? [];
  const endpointId = node.data?.endpointId ?? "";
  const endpoint = endpoints.find((item) => item.id === endpointId);
  const sourceId = node.data?.sourceId ?? sourceOptions[0]?.id ?? "";
  const source = sourceOptions.find((item) => item.id === sourceId);
  const fields = endpointId ? extractEndpointFields(endpoint) : extractSourceFields(source);
  const recommend = recommendChartConfig((props.chartType ?? "line") as ChartSpec["chartType"], fields);
  const xBindings = bindings.filter((binding) => binding.role === "x" || binding.role === "category");
  const xBinding = xBindings[0];
  const yBindings = bindings.filter((binding) => isMeasureRole(binding.role));
  const seriesBindings = bindings.filter((binding) => isSeriesRole(binding.role));
  const [xAxisAdvancedOpen, setXAxisAdvancedOpen] = useState(false);
  const [advancedMappingOpen, setAdvancedMappingOpen] = useState(false);
  const computedFields = props.computedFields ?? [];
  const primaryY = yBindings[0];
  const secondY = yBindings[1];
  const fieldOptions = fields.map((field) => field.name);
  const numericFields = fields.filter((field) => field.type === "number").map((field) => field.name);
  const timeLikeFields = fields
    .filter((field) => field.type === "time" || /time|date|day|week|month|minute|hour/i.test(field.name))
    .map((field) => field.name);
  const previewRows = endpointId ? endpointTestRows : getPreviewRows(doc, node, props);
  const paramBindings = node.data?.paramBindings ?? {};
  const resolvedParams = endpointId ? resolveDataEndpointParams(doc, node) : {};
  const renderFieldOptionLabel = (fieldName: string): string => formatNamedLabel(fieldName, findFieldMeta(fields, fieldName)?.label);
  const paramSummary = endpoint
    ? endpoint.paramSchema.map((field) => describeParamBinding(doc, field, paramBindings[field.name]))
    : [];
  const guideFields = endpoint
    ? endpoint.resultSchema
    : (source?.schemaFields?.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        unit: field.unit ?? null,
        aggAble: field.aggAble
      })) ??
      fields.map((field) => ({ name: field.name, label: field.label, type: field.type, unit: field.unit ?? null })));
  const guideSampleRows = endpointId ? endpointTestRows : extractSourceSampleRows(source);
  const shouldSuggestMultiXAxis =
    Boolean(secondY) || props.chartType === "combo" || props.chartType === "scatter" || timeLikeFields.length >= 2;
  const hasComplexMappings = Boolean(secondY) || xBindings.length > 1 || seriesBindings.length > 0 || computedFields.length > 0;
  const recommendationCards = [
    {
      id: "trend",
      label: "趋势变化",
      chartType: "line" as const,
      description: "按时间看指标变化，适合趋势分析。",
      enabled: timeLikeFields.length > 0 && numericFields.length > 0
    },
    {
      id: "compare",
      label: "分类对比",
      chartType: "bar" as const,
      description: "按分类对比数值高低，适合横向比较。",
      enabled: fieldOptions.length > 0 && numericFields.length > 0
    },
    {
      id: "share",
      label: "结构占比",
      chartType: "pie" as const,
      description: "看整体构成和占比，适合份额表达。",
      enabled: fieldOptions.length > 0 && numericFields.length > 0
    },
    {
      id: "relation",
      label: "关系分布",
      chartType: "scatter" as const,
      description: "看两个指标的关系和离散分布。",
      enabled: numericFields.length >= 2
    }
  ].filter((item) => item.enabled);

  useEffect(() => {
    setPaletteColors(Array.isArray((props.optionPatch as Record<string, unknown> | undefined)?.color) ? ((props.optionPatch as Record<string, unknown>).color as unknown[]).map((item) => String(item)) : []);
    setRecommendHint("");
    setSummaryHint("");
    setAiRecommendLoading(false);
    setEndpointTestRows([]);
    setEndpointTestError("");
    setEndpointTesting(false);
    setParamEditorOpen(false);
    setDataGuideOpen(false);
    setAggEditorOpen(false);
  }, [node.id, props.optionPatch]);

  useEffect(() => {
    setXAxisAdvancedOpen(xBindings.length > 1);
  }, [node.id, xBindings.length]);

  useEffect(() => {
    if (hasComplexMappings) {
      setAdvancedMappingOpen(true);
    }
  }, [hasComplexMappings, node.id]);

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
    setXAxisAdvancedOpen(desiredCount > 1);
  };

  const toggleXAxisAdvanced = (): void => {
    setAdvancedMappingOpen((advancedOpen) => {
      const nextAdvancedOpen = advancedOpen || !xAxisAdvancedOpen;
      setXAxisAdvancedOpen((value) => !value);
      return nextAdvancedOpen;
    });
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
    const recommendedAgg = inferRecommendedAgg(findFieldMeta(fields, field));
    const current = [...bindings];
    const yIndex = current.findIndex((item) => isMeasureRole(item.role));
    if (yIndex >= 0) {
      current[yIndex] = { ...current[yIndex], role: "y", field, agg: recommendedAgg };
      setBindings(current, "change y field");
      return;
    }
    current.push({ role: "y", field, agg: recommendedAgg });
    setBindings(current, "add y field");
  };

  const setMeasureAgg = (measureIndex: number, agg: FieldBinding["agg"]): void => {
    const current = [...bindings];
    const yIndices = current
      .map((item, idx) => ({ item, idx }))
      .filter((entry) => isMeasureRole(entry.item.role))
      .map((entry) => entry.idx);
    const yIndex = yIndices[measureIndex];
    if (yIndex === undefined) {
      return;
    }
    const existing = current[yIndex];
    if (!existing) {
      return;
    }
    current[yIndex] = {
      ...existing,
      role: measureIndex === 0 ? "y" : "y2",
      axis: measureIndex === 0 ? existing.axis ?? "primary" : "secondary",
      as: measureIndex === 0 ? existing.as : existing.as ?? "secondary",
      agg
    };
    setBindings(current, measureIndex === 0 ? "change primary agg" : "change secondary agg");
  };

  const setPrimaryAgg = (agg: FieldBinding["agg"]): void => setMeasureAgg(0, agg);
  const setSecondAgg = (agg: FieldBinding["agg"]): void => setMeasureAgg(1, agg);

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
    current.push({ role: "y2", field: candidate, agg: inferRecommendedAgg(findFieldMeta(fields, candidate)), axis: "secondary", as: "secondary" });
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
    current[idx] = {
      ...current[idx],
      role: "y2",
      field,
      agg: inferRecommendedAgg(findFieldMeta(fields, field)),
      axis: "secondary",
      as: "secondary"
    };
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
              endpointId: undefined,
              sourceId: nextSourceId,
              queryId: nextQueryId,
              paramBindings: undefined
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

  const setEndpointAndRecommend = (nextEndpointId: string): void => {
    const nextEndpoint = endpoints.find((item) => item.id === nextEndpointId);
    const fallbackSource = sourceOptions[0];
    const fallbackQueryId = fallbackSource ? doc.queries?.find((query) => query.sourceId === fallbackSource.id)?.queryId : undefined;
    const nextFields = nextEndpoint ? extractEndpointFields(nextEndpoint) : extractSourceFields(fallbackSource);
    const nextRecommend = recommendChartConfig((props.chartType ?? "line") as ChartSpec["chartType"], nextFields);
    const nextParamBindings =
      nextEndpoint?.paramSchema.reduce<Record<string, { from: "const"; value?: unknown }>>((result, field) => {
        result[field.name] = { from: "const", value: field.defaultValue ?? "" };
        return result;
      }, {}) ?? {};
    store.executeCommand(
      {
        type: "Transaction",
        commands: [
          {
            type: "UpdateData",
            nodeId: node.id,
            data: {
              sourceId: nextEndpoint ? undefined : fallbackSource?.id,
              queryId: nextEndpoint ? undefined : fallbackQueryId,
              endpointId: nextEndpointId || undefined,
              params: {},
              paramBindings: Object.keys(nextParamBindings).length > 0 ? nextParamBindings : undefined
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
      { summary: "endpoint change and bindings recommend" }
    );
    setEndpointTestRows([]);
    setEndpointTestError("");
    setRecommendHint(nextRecommend.reasons.join("；"));
  };

  const updateParamBinding = (
    paramName: string,
    patch: Partial<NonNullable<typeof paramBindings[string]>>
  ): void => {
    updateData(
      {
        paramBindings: {
          ...paramBindings,
          [paramName]: {
            from: "const",
            ...(paramBindings[paramName] ?? {}),
            ...patch
          }
        }
      },
      "chart param binding change"
    );
  };

  const runEndpointTest = async (): Promise<void> => {
    if (!endpointId) {
      return;
    }
    setEndpointTesting(true);
    setEndpointTestError("");
    try {
      const result = await endpointRepoRef.current.testEndpoint(endpointId, resolvedParams);
      setEndpointTestRows(result.rows);
    } catch (error) {
      setEndpointTestRows([]);
      setEndpointTestError(error instanceof Error ? error.message : String(error));
    } finally {
      setEndpointTesting(false);
    }
  };

  const autoRecommendBindings = (): void => {
    const nextBindings = recommendBindings((props.chartType ?? "line") as ChartSpec["chartType"], fields);
    updateProps({ bindings: nextBindings }, "auto recommend bindings");
    setRecommendHint(recommend.reasons.join("；"));
  };

  const applyDisplayRecommendation = (chartType: ChartSpec["chartType"], label: string): void => {
    const nextRecommend = recommendChartConfig(chartType, fields);
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: node.id,
        props: {
          chartType: nextRecommend.chartType,
          bindings: nextRecommend.bindings
        }
      },
      { summary: `apply display recommendation ${chartType}` }
    );
    setRecommendHint(`${label}；${nextRecommend.reasons.join("；")}`);
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
          sourceId: endpointId || sourceId,
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

  const applyCustomPalette = (colors: string[]): void => {
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
            字段识别: {fields.slice(0, 4).map((field) => `${formatSourceFieldLabel(field)}:${field.type}`).join(", ") || "无字段"}
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
          <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>{endpointId ? "动态数据接口" : "数据来源"}</strong>
              {endpoint ? <span className="chip">{endpoint.providerType}</span> : null}
            </div>
            <div className="inspector-stat-summary">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>数据概览</strong>
                <button className="btn mini-btn" onClick={() => setDataGuideOpen(true)} disabled={!endpoint && !source}>
                  查看数据说明
                </button>
              </div>
              <div className="muted">
                {fields.length > 0
                  ? `${fields.length} 个字段，推荐 ${recommend.chartType}。${recommend.reasons.join("；")}`
                  : "先选择数据接口或静态数据源，再查看字段与样例数据。"}
              </div>
            </div>
            <label className="col">
              <span>数据接口</span>
              <select className="select" value={endpointId} onChange={(event) => setEndpointAndRecommend(event.target.value)} disabled={endpoints.length === 0}>
                <option value="">不使用动态接口</option>
                {endpoints.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.id})
                  </option>
                ))}
              </select>
            </label>
            {endpoint ? (
              <>
                <div className="muted" style={{ fontSize: 12 }}>
                  {endpoint.method} {endpoint.path}
                </div>
                {endpoint.paramSchema.length > 0 ? (
                  <div className="col inspector-param-summary" style={{ marginTop: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <strong>参数映射</strong>
                      <button className="btn mini-btn" onClick={() => setParamEditorOpen(true)}>
                        编辑参数映射
                      </button>
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {`共 ${endpoint.paramSchema.length} 个参数。设计器测试默认使用模板默认值 / 系统变量 / 筛选默认值。`}
                    </div>
                    <div className="col" style={{ gap: 4 }}>
                      {paramSummary.map((item) => (
                        <div key={`summary_${item}`} className="muted" style={{ fontSize: 12 }}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="muted" style={{ fontSize: 12 }}>
                    当前接口无参数，可直接测试取数。
                  </div>
                )}
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => void runEndpointTest()} disabled={endpointTesting}>
                    {endpointTesting ? "测试中..." : "测试取数"}
                  </button>
                  <button className="btn" onClick={() => setDataGuideOpen(true)}>
                    查看数据定义
                  </button>
                  <button className="btn" onClick={() => setEndpointAndRecommend("")}>
                    切回静态数据源
                  </button>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  当前测试值: {describeResolvedParams(endpoint, resolvedParams)}
                </div>
                {endpointTestError ? <div className="chip" style={{ color: "#b91c1c" }}>{endpointTestError}</div> : null}
                {endpointTestRows.length > 0 ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    测试返回 {endpointTestRows.length} 行，字段: {fields.slice(0, 6).map((field) => formatSourceFieldLabel(field)).join(", ") || "无"}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="muted" style={{ fontSize: 12 }}>
                未绑定动态接口时，下面仍可使用静态 source/query。
              </div>
            )}
          </div>
          {!endpointId ? (
            <label className="col">
              <span>静态数据源</span>
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
          ) : null}
          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>推荐展示方式</strong>
              <span className="muted">{`当前图表：${props.chartType ?? "line"}`}</span>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              先选择你想表达的分析意图，系统会自动给出更合适的图表类型和默认字段绑定。
            </div>
            <div className="col" style={{ gap: 8 }}>
              {recommendationCards.length > 0 ? (
                recommendationCards.map((item) => (
                  <button
                    key={item.id}
                    className={`btn ${props.chartType === item.chartType ? "primary" : ""}`}
                    onClick={() => applyDisplayRecommendation(item.chartType, item.description)}
                    style={{ justifyContent: "space-between" }}
                  >
                    <span>{item.label}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {item.description}
                    </span>
                  </button>
                ))
              ) : (
                <div className="muted">当前字段还不足以给出清晰的推荐展示方式，请先选择数据接口或补充字段。</div>
              )}
            </div>
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>基础字段绑定</strong>
              <button className="btn mini-btn" onClick={autoRecommendBindings} disabled={fieldOptions.length === 0}>
                自动匹配
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              先确认“按什么维度看、看哪个指标”，这是大多数图表最常用的配置。
            </div>
            <label className="col">
              <span>分析维度</span>
              <select className="select" value={xBinding?.field ?? ""} onChange={(event) => setPrimaryXField(event.target.value)}>
                <option value="">请选择</option>
                {fieldOptions.map((field) => (
                  <option key={field} value={field}>
                    {renderFieldOptionLabel(field)}
                  </option>
                ))}
              </select>
            </label>
            <label className="col">
              <span>统计指标</span>
              <select className="select" value={primaryY?.field ?? ""} onChange={(event) => setPrimaryYField(event.target.value)}>
                <option value="">请选择</option>
                {numericFields.length > 0
                  ? numericFields.map((field) => (
                      <option key={field} value={field}>
                        {renderFieldOptionLabel(field)}
                      </option>
                    ))
                  : fieldOptions.map((field) => (
                      <option key={field} value={field}>
                        {renderFieldOptionLabel(field)}
                      </option>
                    ))}
              </select>
            </label>
            <div className="inspector-stat-summary">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <strong>统计口径</strong>
                <button className="btn mini-btn" onClick={() => setAggEditorOpen(true)} disabled={!primaryY}>
                  编辑统计口径
                </button>
              </div>
              <div className="muted">{describeStatNarrative(fields, primaryY, xBinding, seriesBindings)}</div>
              {secondY ? <div className="muted">{describeStatNarrative(fields, secondY, xBinding, seriesBindings)}</div> : null}
              <div className="muted">系统会自动推荐统计口径：数量/流量通常求和，比例/时延通常取平均。</div>
            </div>
          </div>

          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>高级映射</strong>
              <button className="btn mini-btn" onClick={() => setAdvancedMappingOpen((value) => !value)}>
                {advancedMappingOpen ? "收起" : "展开"}
              </button>
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              第二轴、多 X 轴、多系列和计算字段会影响更复杂的分析表达，只有需要时再展开。
            </div>
            <label className="row">
              <input type="checkbox" checked={Boolean(secondY)} onChange={(event) => setSecondAxis(event.target.checked)} />
              <span>添加第二轴</span>
            </label>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <div className="row">
                {xBindings.length > 1 ? <span className="chip-warning">已启用多 X 轴</span> : <span className="muted">默认单 X 轴，适合大多数场景</span>}
                {shouldSuggestMultiXAxis && xBindings.length <= 1 ? <span className="chip">建议启用多 X 轴</span> : null}
              </div>
              <div className="row">
                <button className="btn mini-btn" onClick={autoMatchXAxis} disabled={fieldOptions.length === 0}>
                  一键自动匹配 X 轴
                </button>
                <button className="btn mini-btn" onClick={toggleXAxisAdvanced}>
                  {xAxisAdvancedOpen ? "收起高级X轴" : "显示高级X轴"}
                </button>
              </div>
            </div>
            <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>系列维度（可多个）</strong>
                <button className="btn mini-btn" onClick={addSeriesBinding} disabled={fieldOptions.length === 0}>
                  +系列
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {seriesBindings.length === 0 ? "未配置系列维度，当前仅单系列渲染。" : `已配置 ${seriesBindings.length} 个系列维度。`}
              </div>
            </div>
            {advancedMappingOpen ? (
              <>
                {secondY ? (
                  <label className="col">
                    <span>第二指标（第二轴）</span>
                    <select className="select" value={secondY.field} onChange={(event) => setSecondAxisField(event.target.value)}>
                      {numericFields.map((field) => (
                        <option key={field} value={field}>
                          {renderFieldOptionLabel(field)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                                {renderFieldOptionLabel(field)}
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
                              {renderFieldOptionLabel(field)}
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
                      <input className="input" placeholder="字段名" value={field.name} onChange={(event) => updateComputedField(idx, { name: event.target.value })} />
                      <input className="input" placeholder="表达式，例如: bytes / 1024" value={field.expression} onChange={(event) => updateComputedField(idx, { expression: event.target.value })} />
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
            <ColorPaletteField
              label="自定义调色板"
              value={paletteColors}
              onChange={(colors) => {
                setPaletteColors(colors);
                applyCustomPalette(colors);
              }}
            />
          </div>
          <TextStyleEditor title="图表标题样式" value={props.titleStyle} onChange={(style) => updateProps({ titleStyle: style }, "chart title style")} />
          <TextStyleEditor title="图表副标题样式" value={props.subtitleStyle} onChange={(style) => updateProps({ subtitleStyle: style }, "chart subtitle style")} />
          <NodeStyleInspector node={node} title="图表容器样式" showTextControls={false} />
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
      <DataGuideDialog
        open={dataGuideOpen}
        title={endpoint?.name ?? source?.id ?? "数据来源"}
        endpoint={endpoint}
        source={endpoint ? undefined : source}
        fields={guideFields}
        sampleRows={guideSampleRows}
        paramSummary={paramSummary}
        onClose={() => setDataGuideOpen(false)}
      />
      <ChartStatModeDialog
        open={aggEditorOpen}
        fields={fields}
        xBinding={xBinding}
        seriesBindings={seriesBindings}
        primaryY={primaryY}
        secondaryY={secondY}
        onChangePrimaryAgg={setPrimaryAgg}
        onChangeSecondaryAgg={setSecondAgg}
        onClose={() => setAggEditorOpen(false)}
      />
      <ParamBindingEditorDialog
        open={paramEditorOpen}
        title={endpoint?.name ?? "动态接口"}
        doc={doc}
        endpoint={endpoint}
        paramBindings={paramBindings}
        resolvedParams={resolvedParams}
        onChangeBinding={updateParamBinding}
        onClose={() => setParamEditorOpen(false)}
      />
    </div>
  );
}

