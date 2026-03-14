import { useEffect, useRef, useState } from "react";
import type { ChartSpec, FieldBinding, VDoc, VNode } from "../../../core/doc/types";
import type { DataEndpointMeta } from "../../api/data-endpoint-repository";
import { HttpDataEndpointRepository } from "../../api/http-data-endpoint-repository";
import { useEditorStore } from "../../state/editor-context";
import { DataGuideDialog } from "../DataGuideDialog";
import {
  ChartStatModeDialog,
  ParamBindingEditorDialog,
  describeParamBinding,
  describeResolvedParams,
  extractSourceSampleRows,
  findFieldMeta,
  formatNamedLabel,
  type InspectorTab,
  isMeasureRole,
  isSeriesRole
} from "./shared";
import {
  extractSourceFields,
  inferRecommendedAgg,
  recommendBindings,
  recommendChartConfig,
  requestAiChartRecommend
} from "../../utils/chart-recommend";
import { summarizeChartRows } from "../../utils/chart-summary";
import { extractEndpointFields, resolveDataEndpointParams } from "../../utils/data-endpoint-binding";
import { getPreviewRows, insertSummaryNode } from "./node-helpers";
import { ChartBasicTab } from "./chart/ChartBasicTab";
import { ChartDataTab } from "./chart/ChartDataTab";
import { ChartStyleTab } from "./chart/ChartStyleTab";
import { ChartAdvancedTab } from "./chart/ChartAdvancedTab";

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
  const fieldSummaryText = fields.slice(0, 4).map((field) => `${renderFieldOptionLabel(field.name)}:${field.type}`).join(", ") || "无字段";
  const recommendReasonsText = recommendHint || recommend.reasons.join("；");
  const summaryText = buildSummary();

  return (
    <div className="col">
      {activeTab === "basic" ? (
        <ChartBasicTab
          chartType={(props.chartType ?? "line") as ChartSpec["chartType"]}
          titleText={props.titleText}
          runtimeAskEnabled={props.runtimeAskEnabled !== false}
          labelShow={Boolean(props.labelShow)}
          fieldSummary={fieldSummaryText}
          recommendReasonsText={recommendReasonsText}
          previewRowCount={previewRows.length}
          summaryText={summaryText}
          recommendHint={recommendHint}
          summaryHint={summaryHint}
          aiRecommendLoading={aiRecommendLoading}
          fields={fields}
          onChangeChartType={(chartType) => updateProps({ chartType }, "chart type change")}
          onChangeTitle={(value) => updateProps({ titleText: value }, "chart title change", 140)}
          onToggleQuickDarkTheme={toggleQuickDarkTheme}
          onToggleQuickGrid={toggleQuickGrid}
          onToggleLabels={() => updateProps({ labelShow: !Boolean(props.labelShow) }, "quick toggle labels")}
          onToggleRuntimeAsk={(checked) => updateProps({ runtimeAskEnabled: checked }, "toggle runtime ask entry")}
          onApplySmartTypeRecommend={applySmartTypeRecommend}
          onAutoRecommendBindings={autoRecommendBindings}
          onApplyAiRecommend={() => void applyAiRecommend()}
          onRollbackRecommend={rollbackRecommend}
          onApplySummaryToSubtitle={applySummaryToSubtitle}
          onInsertSummaryTextBlock={insertSummaryTextBlock}
        />
      ) : null}

      {activeTab === "data" ? (
        <ChartDataTab
          propsChartType={(props.chartType ?? "line") as ChartSpec["chartType"]}
          endpointId={endpointId}
          endpoint={endpoint}
          endpoints={endpoints}
          sourceId={sourceId}
          sourceOptions={sourceOptions}
          fields={fields}
          recommend={recommend}
          recommendationCards={recommendationCards}
          xBinding={xBinding}
          primaryY={primaryY}
          secondY={secondY}
          xBindings={xBindings}
          xAxisEntries={xAxisEntries}
          seriesBindings={seriesBindings}
          fieldOptions={fieldOptions}
          numericFields={numericFields}
          computedFields={computedFields}
          xAxisAdvancedOpen={xAxisAdvancedOpen}
          advancedMappingOpen={advancedMappingOpen}
          shouldSuggestMultiXAxis={shouldSuggestMultiXAxis}
          paramSummary={paramSummary}
          endpointTesting={endpointTesting}
          endpointTestError={endpointTestError}
          endpointTestRows={endpointTestRows}
          resolvedParamsText={describeResolvedParams(endpoint, resolvedParams)}
          measureXAxisSummary={measureXAxisSummary}
          renderFieldOptionLabel={renderFieldOptionLabel}
          onOpenDataGuide={() => setDataGuideOpen(true)}
          onOpenParamEditor={() => setParamEditorOpen(true)}
          onSelectEndpoint={setEndpointAndRecommend}
          onRunEndpointTest={() => void runEndpointTest()}
          onResetEndpoint={() => setEndpointAndRecommend("")}
          onSelectSource={setSourceAndRecommend}
          onAutoRecommendBindings={autoRecommendBindings}
          onApplyDisplayRecommendation={applyDisplayRecommendation}
          onSetPrimaryXField={setPrimaryXField}
          onSetPrimaryYField={setPrimaryYField}
          onOpenAggEditor={() => setAggEditorOpen(true)}
          onToggleAdvancedMapping={() => setAdvancedMappingOpen((value) => !value)}
          onToggleSecondAxis={setSecondAxis}
          onAutoMatchXAxis={autoMatchXAxis}
          onToggleXAxisAdvanced={toggleXAxisAdvanced}
          onAddSeriesBinding={addSeriesBinding}
          onSetSecondAxisField={setSecondAxisField}
          onAddXAxisBinding={addXAxisBinding}
          onUpdateXAxisBinding={updateXAxisBinding}
          onRemoveXAxisBinding={removeXAxisBinding}
          onSetPrimaryYXAxis={setPrimaryYXAxis}
          onSetSecondAxisX={setSecondAxisX}
          onUpdateSeriesBinding={updateSeriesBinding}
          onRemoveSeriesBinding={removeSeriesBinding}
          onAddComputedField={addComputedField}
          onUpdateComputedField={updateComputedField}
          onRemoveComputedField={removeComputedField}
        />
      ) : null}

      {activeTab === "style" ? (
        <ChartStyleTab
          node={node}
          props={props}
          paletteColors={paletteColors}
          onToggleQuickDarkTheme={toggleQuickDarkTheme}
          onToggleQuickGrid={toggleQuickGrid}
          onToggleLabels={() => updateProps({ labelShow: !Boolean(props.labelShow) }, "quick toggle labels style")}
          onChangeThemeRef={(value) => updateProps({ themeRef: value }, "chart theme switch")}
          onChangePaletteRef={(value) => updateProps({ paletteRef: value }, "chart palette switch")}
          onChangePaletteColors={(colors) => {
            setPaletteColors(colors);
            applyCustomPalette(colors);
          }}
          onChangeTitleStyle={(style) => updateProps({ titleStyle: style }, "chart title style")}
          onChangeSubtitleStyle={(style) => updateProps({ subtitleStyle: style }, "chart subtitle style")}
        />
      ) : null}

      {activeTab === "advanced" ? (
        <ChartAdvancedTab
          props={props}
          onToggleLegend={(checked) => updateProps({ legendShow: checked }, "chart legend toggle")}
          onToggleTooltip={(checked) => updateProps({ tooltipShow: checked }, "chart tooltip toggle")}
          onToggleGrid={(checked) => updateProps({ gridShow: checked }, "chart grid toggle")}
          onToggleSmooth={(checked) => updateProps({ smooth: checked }, "chart smooth toggle")}
          onToggleStack={(checked) => updateProps({ stack: checked }, "chart stack toggle")}
          onToggleArea={(checked) => updateProps({ area: checked }, "chart area toggle")}
          onToggleXAxis={(checked) => updateProps({ xAxisShow: checked }, "chart x axis toggle")}
          onToggleYAxis={(checked) => updateProps({ yAxisShow: checked }, "chart y axis toggle")}
          onToggleLabel={(checked) => updateProps({ labelShow: checked }, "chart label toggle")}
          onChangeXAxisTitle={(value) => updateProps({ xAxisTitle: value }, "chart x title", 120)}
          onChangeYAxisTitle={(value) => updateProps({ yAxisTitle: value }, "chart y title", 120)}
          onChangeValueFormat={(value) => updateProps({ valueFormat: value }, "chart value format", 120)}
          onChangeTimeFormat={(value) => updateProps({ timeFormat: value }, "chart time format", 120)}
        />
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

