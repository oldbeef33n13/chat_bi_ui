import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type { ChartSpec, ChartType, Command, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { themes } from "../../runtime/theme/themes";
import { FloatingLayer, type FloatingLayerArgs } from "./FloatingLayer";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { Persona } from "../types/persona";
import { buildAlignCommandResult, buildAlignToContainerCommandResult, type AlignKind } from "../utils/alignment";
import { buildChartNode, extractSourceFields } from "../utils/chart-recommend";
import {
  buildDashboardApplyCardSpanCommands,
  buildDashboardAutoTidyCommands,
  buildDashboardConvertToCardCommands,
  buildDashboardConvertToFloatingCommands,
  buildDashboardMoveCardRowCommands,
  recommendDashboardCardLayout
} from "../utils/dashboard-arrange";
import { buildLayoutBatchCommands } from "../utils/layout-batch";
import { findAncestorByKind, findNodeById } from "../utils/node-tree";
import { exportReportToPrint } from "../utils/report-export";
import { getSectionBlocks } from "../utils/report-sections";
import { resolveDashboardSurfaceMetrics } from "../utils/dashboard-surface";

interface EditorTopToolbarProps {
  persona: Persona;
  showFilterPanel: boolean;
  onToggleFilterPanel: () => void;
  showBatchPanel: boolean;
  onToggleBatchPanel: () => void;
  onOpenCommandPalette: () => void;
  onOpenPresentPreview: () => void;
}

type InsertKind = "chart" | "table" | "text";
type ReportBlockInsertKind = "text" | "chart" | "table";
type TablePreset = "basic" | "multi-header" | "pivot";

interface ChartGalleryItem {
  type: ChartType;
  label: string;
  purpose: string;
  suggestion: string;
  group: "basic" | "analysis" | "relation";
}

interface TableGalleryItem {
  preset: TablePreset;
  label: string;
  purpose: string;
  suggestion: string;
  level: "simple" | "advanced";
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const resolveMenuLayerStyle =
  (align: "left" | "right") =>
  ({ anchorRect, layerRect, viewportWidth, viewportHeight }: FloatingLayerArgs): CSSProperties => {
    const pad = 12;
    const offset = 8;
    const preferredTop = anchorRect.bottom + offset;
    const fallbackTop = anchorRect.top - layerRect.height - offset;
    const top =
      preferredTop + layerRect.height <= viewportHeight - pad ? preferredTop : Math.max(pad, fallbackTop);
    const preferredLeft = align === "right" ? anchorRect.right - layerRect.width : anchorRect.left;
    return {
      top: Math.round(top),
      left: Math.round(clamp(preferredLeft, pad, viewportWidth - layerRect.width - pad)),
      zIndex: 4200
    };
  };

const chartGalleryItems: ChartGalleryItem[] = [
  { type: "line", label: "折线图", purpose: "趋势变化", suggestion: "适合时间序列和连续变化", group: "basic" },
  { type: "bar", label: "柱状图", purpose: "分类对比", suggestion: "适合离散类别对比", group: "basic" },
  { type: "pie", label: "饼图", purpose: "占比结构", suggestion: "适合 2~6 分类占比", group: "basic" },
  { type: "scatter", label: "散点图", purpose: "相关分布", suggestion: "适合观察异常点和相关性", group: "basic" },
  { type: "combo", label: "组合图", purpose: "多指标对照", suggestion: "适合主副轴联合分析", group: "basic" },
  { type: "radar", label: "雷达图", purpose: "维度能力", suggestion: "适合多维评分画像", group: "basic" },
  { type: "heatmap", label: "热力图", purpose: "密度热点", suggestion: "适合二维密度分布", group: "analysis" },
  { type: "boxplot", label: "箱线图", purpose: "离散分布", suggestion: "适合波动与离群分析", group: "analysis" },
  { type: "kline", label: "K线图", purpose: "开高低收", suggestion: "适合金融行情与区间波动", group: "analysis" },
  { type: "funnel", label: "漏斗图", purpose: "流程转化", suggestion: "适合阶段流失分析", group: "analysis" },
  { type: "gauge", label: "仪表盘", purpose: "目标达成", suggestion: "适合 KPI 达成率展示", group: "analysis" },
  { type: "calendar", label: "日历图", purpose: "日历分布", suggestion: "适合每日活跃趋势", group: "analysis" },
  { type: "treemap", label: "矩形树图", purpose: "层级占比", suggestion: "适合层级结构体量对比", group: "relation" },
  { type: "sunburst", label: "旭日图", purpose: "层级路径", suggestion: "适合分层路径展开", group: "relation" },
  { type: "sankey", label: "桑基图", purpose: "流向关系", suggestion: "适合来源去向转移", group: "relation" },
  { type: "graph", label: "关系图", purpose: "节点关系", suggestion: "适合网络拓扑关联", group: "relation" },
  { type: "parallel", label: "平行坐标", purpose: "多维比较", suggestion: "适合高维指标对照", group: "relation" }
];

const tableGalleryItems: TableGalleryItem[] = [
  { preset: "basic", label: "基础表", purpose: "明细清单", suggestion: "快速承载记录列表", level: "simple" },
  { preset: "multi-header", label: "多级表头", purpose: "分组字段", suggestion: "适合多层维度与指标", level: "advanced" },
  { preset: "pivot", label: "透视表", purpose: "交叉汇总", suggestion: "适合行列交叉统计分析", level: "advanced" }
];

/**
 * 顶部统一工具带：
 * - 文档级命令（撤销/重做/主题）
 * - 插入中心（搜索 + 最近使用）
 * - 布局命令（对齐/分布）
 * - 选中态上下文命令（图表/表格/文本）
 */
export function EditorTopToolbar({
  persona,
  showFilterPanel,
  onToggleFilterPanel,
  showBatchPanel,
  onToggleBatchPanel,
  onOpenCommandPalette,
  onOpenPresentPreview
}: EditorTopToolbarProps): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);
  const ui = useSignalValue(store.ui);
  const auditLogs = useSignalValue(store.auditLogs);
  const [preferredChartType, setPreferredChartType] = useState<ChartType>("line");
  const [actionHint, setActionHint] = useState("");
  const [chartGalleryOpen, setChartGalleryOpen] = useState(false);
  const [chartGalleryLocked, setChartGalleryLocked] = useState(false);
  const [tableGalleryOpen, setTableGalleryOpen] = useState(false);
  const [tableGalleryLocked, setTableGalleryLocked] = useState(false);
  const [sceneOpsOpen, setSceneOpsOpen] = useState(false);
  const [sceneOpsLocked, setSceneOpsLocked] = useState(false);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [arrangeLocked, setArrangeLocked] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLocked, setAuditLocked] = useState(false);
  const [auditActorFilter, setAuditActorFilter] = useState<"all" | "ui" | "ai">("all");
  const chartGalleryRef = useRef<HTMLDivElement>(null);
  const tableGalleryRef = useRef<HTMLDivElement>(null);
  const sceneOpsRef = useRef<HTMLDivElement>(null);
  const arrangeRef = useRef<HTMLDivElement>(null);
  const auditRef = useRef<HTMLDivElement>(null);
  const chartGalleryLayerRef = useRef<HTMLDivElement>(null);
  const tableGalleryLayerRef = useRef<HTMLDivElement>(null);
  const sceneOpsLayerRef = useRef<HTMLDivElement>(null);
  const arrangeLayerRef = useRef<HTMLDivElement>(null);
  const auditLayerRef = useRef<HTMLDivElement>(null);

  if (!doc) {
    return <div className="editor-toolbar" />;
  }

  const selectedNode = selection.primaryId ? findNodeById(doc.root, selection.primaryId) : undefined;
  const selectedSection = selection.primaryId ? findAncestorByKind(doc.root, selection.primaryId, "section") : undefined;
  const selectedSlide = selection.primaryId ? findAncestorByKind(doc.root, selection.primaryId, "slide") : undefined;
  const isDashboardDoc = doc.docType === "dashboard";
  const isPptDoc = doc.docType === "ppt";
  const isReportDoc = doc.docType === "report";
  const isSurfaceDoc = isDashboardDoc || isPptDoc || isReportDoc;
  const hasArrangeMenu = isSurfaceDoc;
  const compactSurfaceToolbar = isSurfaceDoc;
  const rootProps = (doc.root.props ?? {}) as Record<string, unknown>;
  const dashboardMetrics =
    isDashboardDoc
      ? resolveDashboardSurfaceMetrics({
          doc,
          containerWidth: Math.max(Number(rootProps.designWidthPx ?? rootProps.pageWidthPx ?? 1440), 1440),
          containerHeight: Math.max(Number(rootProps.designHeightPx ?? 960), 960)
        })
      : undefined;
  const dashboardSelectionNodes =
    isDashboardDoc
      ? (doc.root.children ?? []).filter((node) => selection.selectedIds.includes(node.id))
      : [];
  const dashboardPrimaryNode =
    isDashboardDoc
      ? dashboardSelectionNodes.find((node) => node.id === selection.primaryId) ?? dashboardSelectionNodes[0]
      : undefined;
  const dashboardSelectionModes = [...new Set(dashboardSelectionNodes.map((node) => node.layout?.mode ?? "grid"))];
  const dashboardSelectionScope =
    dashboardSelectionNodes.length === 0
      ? "none"
      : dashboardSelectionModes.length > 1
        ? "mixed"
        : dashboardSelectionModes[0] === "absolute"
          ? dashboardSelectionNodes.length === 1
            ? "floating-single"
            : "floating-multi"
          : dashboardSelectionNodes.length === 1
            ? "card-single"
            : "card-multi";
  const pptSelectionNodes =
    isPptDoc
      ? (selectedSlide?.children ?? []).filter((node) => selection.selectedIds.includes(node.id) && node.layout?.mode === "absolute")
      : [];
  const pptPrimaryNode =
    isPptDoc
      ? pptSelectionNodes.find((node) => node.id === selection.primaryId) ?? pptSelectionNodes[0]
      : undefined;
  const pptSelectionScope = pptSelectionNodes.length === 0 ? "none" : pptSelectionNodes.length === 1 ? "single" : "multi";
  const reportSelectionNodes =
    isReportDoc && selectedSection
      ? getSectionBlocks(selectedSection).filter((node) => selection.selectedIds.includes(node.id) && node.layout?.mode === "grid")
      : [];
  const reportPrimaryNode =
    isReportDoc
      ? reportSelectionNodes.find((node) => node.id === selection.primaryId) ?? reportSelectionNodes[0]
      : undefined;
  const reportCanvasCols = Math.max(4, Math.round(Number((selectedSection?.props as Record<string, unknown> | undefined)?.canvasCols ?? 12) || 12));
  const reportSelectionScope = reportSelectionNodes.length === 0 ? "none" : reportSelectionNodes.length === 1 ? "single" : "multi";
  const canAlign = selection.selectedIds.length >= 2;
  const canDistribute = selection.selectedIds.length >= 3;
  const canContainerAlign = selection.selectedIds.length >= 1;
  const canEditNode = !!selectedNode && selectedNode.id !== "root";
  const reportConfigShown = Boolean(rootProps.editorShowReportConfig);
  const pptSnapEnabled = rootProps.editorSnapEnabled === undefined ? true : Boolean(rootProps.editorSnapEnabled);
  const activeThemeId = doc.themeId ?? themes[0]?.id ?? "";

  const pushHint = (text: string): void => {
    setActionHint(text);
    window.setTimeout(() => setActionHint(""), 1600);
  };

  const containsFloatingTarget = (
    target: EventTarget | Node | null,
    ...refs: Array<{ current: HTMLElement | HTMLDivElement | null }>
  ): boolean => {
    if (!(target instanceof Node)) {
      return false;
    }
    return refs.some((ref) => Boolean(ref.current && ref.current.contains(target)));
  };

  const shouldKeepFloatingOpen = (
    event: ReactMouseEvent<HTMLElement>,
    ...refs: Array<{ current: HTMLElement | HTMLDivElement | null }>
  ): boolean => containsFloatingTarget(event.relatedTarget, ...refs);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (!containsFloatingTarget(target, chartGalleryRef, chartGalleryLayerRef)) {
        setChartGalleryOpen(false);
        setChartGalleryLocked(false);
      }
      if (!containsFloatingTarget(target, tableGalleryRef, tableGalleryLayerRef)) {
        setTableGalleryOpen(false);
        setTableGalleryLocked(false);
      }
      if (!containsFloatingTarget(target, sceneOpsRef, sceneOpsLayerRef)) {
        setSceneOpsOpen(false);
        setSceneOpsLocked(false);
      }
      if (!containsFloatingTarget(target, arrangeRef, arrangeLayerRef)) {
        setArrangeOpen(false);
        setArrangeLocked(false);
      }
      if (!containsFloatingTarget(target, auditRef, auditLayerRef)) {
        setAuditOpen(false);
        setAuditLocked(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    setChartGalleryOpen(false);
    setChartGalleryLocked(false);
    setTableGalleryOpen(false);
    setTableGalleryLocked(false);
    setSceneOpsOpen(false);
    setSceneOpsLocked(false);
    setArrangeOpen(false);
    setArrangeLocked(false);
    setAuditOpen(false);
    setAuditLocked(false);
  }, [doc.docId, selection.primaryId]);

  const applyAlign = (kind: AlignKind, summary: string): void => {
    const { commands, reason } = buildAlignCommandResult(doc.root, selection.selectedIds, kind);
    if (commands.length === 0) {
      if (reason === "need_two") {
        pushHint("对齐未生效：至少选择 2 个可编辑元素");
        return;
      }
      if (reason === "need_three_for_distribute") {
        pushHint("分布未生效：至少选择 3 个同容器元素");
        return;
      }
      if (reason === "mixed_scope") {
        pushHint("对齐未生效：请选择同容器、同布局模式的元素");
        return;
      }
      if (reason === "no_change") {
        pushHint(
          kind === "left"
            ? "已左对齐"
            : kind === "hcenter"
              ? "已水平居中"
              : kind === "right"
                ? "已右对齐"
                : kind === "top"
                  ? "已顶对齐"
                  : kind === "vcenter"
                    ? "已垂直居中"
                    : kind === "bottom"
                      ? "已底对齐"
                      : kind === "hdistribute"
                        ? "已水平分布"
                        : "已垂直分布"
        );
        return;
      }
      pushHint("对齐未生效");
      return;
    }
    store.executeCommand({ type: "Transaction", commands }, { summary });
    if (doc.docType === "dashboard" || doc.docType === "ppt") {
      closeArrange();
    }
    pushHint(
      kind === "left"
        ? "已左对齐"
        : kind === "hcenter"
          ? "已水平居中"
          : kind === "right"
            ? "已右对齐"
            : kind === "top"
              ? "已顶对齐"
              : kind === "vcenter"
                ? "已垂直居中"
                : kind === "bottom"
                  ? "已底对齐"
                  : kind === "hdistribute"
                    ? "已水平分布"
                    : "已垂直分布"
    );
  };

  const applyContainerAlign = (kind: Exclude<AlignKind, "hdistribute" | "vdistribute">, summary: string): void => {
    const { commands, reason } = buildAlignToContainerCommandResult(doc.root, selection.selectedIds, kind);
    if (commands.length === 0) {
      if (reason === "need_one") {
        pushHint("贴边未生效：至少选择 1 个可编辑元素");
        return;
      }
      if (reason === "mixed_scope") {
        pushHint("贴边未生效：请选择同容器、同布局模式的元素");
        return;
      }
      pushHint(
        kind === "left"
          ? "已贴左"
          : kind === "hcenter"
            ? "已水平居中到容器"
            : kind === "right"
              ? "已贴右"
              : kind === "top"
                ? "已贴顶"
                : kind === "vcenter"
                  ? "已垂直居中到容器"
                  : "已贴底"
      );
      return;
    }
    store.executeCommand({ type: "Transaction", commands }, { summary });
    if (doc.docType === "dashboard" || doc.docType === "ppt") {
      closeArrange();
    }
    pushHint(
      kind === "left"
        ? "已贴左"
        : kind === "hcenter"
          ? "已水平居中到容器"
          : kind === "right"
            ? "已贴右"
            : kind === "top"
              ? "已贴顶"
              : kind === "vcenter"
                ? "已垂直居中到容器"
                : "已贴底"
    );
  };

  const patchRootProps = (partial: Record<string, unknown>, summary: string): void => {
    store.executeCommand({ type: "UpdateProps", nodeId: doc.root.id, props: partial }, { summary });
  };

  const buildTableSpecByPreset = (preset: TablePreset, sourceId?: string): TableSpec => {
    if (preset === "multi-header") {
      return {
        titleText: "多级表头",
        repeatHeader: true,
        zebra: true,
        columns: [
          { key: "region", title: "区域" },
          { key: "qoq", title: "环比" },
          { key: "yoy", title: "同比" },
          { key: "latency", title: "时延(ms)" },
          { key: "availability", title: "可用性(%)" }
        ],
        headerRows: [
          [
            { text: "维度", colSpan: 1, rowSpan: 2, align: "center" },
            { text: "趋势", colSpan: 2, align: "center" },
            { text: "质量", colSpan: 2, align: "center" }
          ],
          [
            { text: "环比", align: "center" },
            { text: "同比", align: "center" },
            { text: "时延", align: "center" },
            { text: "可用性", align: "center" }
          ]
        ],
        mergeCells: [{ row: 0, col: 0, rowSpan: 2, colSpan: 1, scope: "header" }]
      };
    }
    if (preset === "pivot") {
      const source = doc.dataSources?.find((item) => item.id === sourceId);
      const fields = extractSourceFields(source);
      const rowField = fields.find((field) => field.type === "string" || field.type === "time")?.name ?? "region";
      const colField = fields.find((field) => field.name !== rowField && (field.type === "string" || field.type === "time"))?.name ?? "service";
      const valueField = fields.find((field) => field.type === "number")?.name ?? "value";
      return {
        titleText: "透视汇总",
        repeatHeader: true,
        zebra: true,
        columns: [],
        pivot: {
          enabled: true,
          rowFields: [rowField],
          columnField: colField,
          valueField,
          agg: "sum",
          fill: 0,
          valueTitle: "汇总值"
        }
      };
    }
    return { titleText: "基础表", columns: [], repeatHeader: true, zebra: true };
  };

  const insertNode = (
    kind: InsertKind,
    options?: {
      chartType?: ChartType;
      tablePreset?: TablePreset;
      textTemplate?: "title" | "body" | "note";
    }
  ): void => {
    const selected = selectedNode;
    const commands: Command[] = [];
    const sectionForReport = (): VNode => {
      const sections = (doc.root.children ?? []).filter((item) => item.kind === "section");
      if (selected?.kind === "section") {
        return selected;
      }
      const selectedSection = selected ? findAncestorByKind(doc.root, selected.id, "section") : undefined;
      if (selectedSection) {
        return selectedSection;
      }
      if (sections[0]) {
        return sections[0];
      }
      const newSection: VNode = {
        id: prefixedId("section"),
        kind: "section",
        props: { title: "新章节" },
        children: []
      };
      commands.push({ type: "InsertNode", parentId: doc.root.id, node: newSection });
      return newSection;
    };
    const slideForPpt = (): VNode => {
      const slides = (doc.root.children ?? []).filter((item) => item.kind === "slide");
      if (selected?.kind === "slide") {
        return selected;
      }
      const selectedSlide = selected ? findAncestorByKind(doc.root, selected.id, "slide") : undefined;
      if (selectedSlide) {
        return selectedSlide;
      }
      if (slides[0]) {
        return slides[0];
      }
      const newSlide: VNode = {
        id: prefixedId("slide"),
        kind: "slide",
        props: { title: "新页面", layoutTemplateId: "title-double-summary" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: []
      };
      commands.push({ type: "InsertNode", parentId: doc.root.id, node: newSlide });
      return newSlide;
    };

    const parent =
      doc.docType === "report"
        ? sectionForReport()
        : doc.docType === "ppt"
          ? slideForPpt()
          : selected && canHaveChildren(selected)
            ? selected
            : doc.root;
    const dashboardCardLayout = (kind: "chart" | "table" | "text"): NonNullable<VNode["layout"]> | undefined => {
      if (doc.docType !== "dashboard") {
        return undefined;
      }
      const size = kind === "text" ? { gw: 4, gh: 4 } : kind === "table" ? { gw: 6, gh: 5 } : { gw: 6, gh: 6 };
      return recommendDashboardCardLayout(doc.root, size, dashboardMetrics?.gridCols ?? 12);
    };

    const fallbackSourceId = doc.dataSources?.[0]?.id;
    const fallbackQueryId = doc.queries?.find((item) => item.sourceId === fallbackSourceId)?.queryId;
    let node: VNode;
    if (kind === "chart") {
      const type = options?.chartType ?? preferredChartType;
      node = buildChartNode({
        doc,
        parent,
        chartType: type,
        sourceId: fallbackSourceId,
        title: "新图表"
      });
      setPreferredChartType(type);
    } else if (kind === "table") {
      const preset = options?.tablePreset ?? "basic";
      const table = buildTableSpecByPreset(preset, fallbackSourceId);
      node = {
        id: prefixedId("table"),
        kind: "table",
        props: table,
        data: fallbackSourceId ? { sourceId: fallbackSourceId, queryId: fallbackQueryId } : undefined,
        layout:
          parent.kind === "slide"
            ? { mode: "absolute", x: 80, y: 100, w: 360, h: 220, z: 1 }
            : dashboardCardLayout("table")
      };
    } else {
      const template = options?.textTemplate ?? "body";
      const textValue = template === "title" ? "请输入标题" : template === "note" ? "注释：补充说明" : "请输入文本";
      const textStyle =
        template === "title"
          ? { fontSize: 24, bold: true }
          : template === "note"
            ? { fontSize: 12, italic: true, fg: "#64748b" }
            : undefined;
      node = {
        id: prefixedId("text"),
        kind: "text",
        props: { text: textValue, format: "plain" },
        style: textStyle,
        layout:
          parent.kind === "slide"
            ? { mode: "absolute", x: 80, y: 100, w: 360, h: template === "title" ? 80 : 160, z: 1 }
            : dashboardCardLayout("text")
      };
    }
    commands.push({ type: "InsertNode", parentId: parent.id, node });

    if (commands.length === 0) {
      return;
    }
    if (commands.length === 1) {
      store.executeCommand(commands[0]!, { summary: `insert ${kind}` });
    } else {
      store.executeCommand({ type: "Transaction", commands }, { summary: `insert ${kind}` });
    }
  };

  const insertIntoReportSection = (kind: ReportBlockInsertKind): void => {
    if (!selectedSection) {
      pushHint("先选择一个章节");
      return;
    }
    const fallbackSourceId = doc.dataSources?.[0]?.id;
    const fallbackQueryId = doc.queries?.find((item) => item.sourceId === fallbackSourceId)?.queryId;
    const node: VNode =
      kind === "text"
        ? {
            id: prefixedId("text"),
            kind: "text",
            props: { text: "新段落", format: "plain" }
          }
        : kind === "chart"
          ? buildChartNode({
              doc,
              parent: selectedSection,
              chartType: preferredChartType,
              sourceId: fallbackSourceId,
              title: "新图表"
            })
          : {
              id: prefixedId("table"),
              kind: "table",
              props: { titleText: "新表格", columns: [], repeatHeader: true, zebra: true },
              data: fallbackSourceId ? { sourceId: fallbackSourceId, queryId: fallbackQueryId } : undefined
            };
    store.executeCommand(
      {
        type: "InsertNode",
        parentId: selectedSection.id,
        node
      },
      { summary: `toolbar insert ${kind} into section` }
    );
    pushHint(`已新增${kind === "text" ? "文本" : kind === "chart" ? "图表" : "表格"}块`);
  };

  const executeArrangeCommands = (commands: Command[], summary: string, successHint: string, emptyHint = "当前选择不支持该操作"): void => {
    if (commands.length === 0) {
      pushHint(emptyHint);
      return;
    }
    store.executeCommand(
      commands.length === 1
        ? commands[0]!
        : {
            type: "Transaction",
            commands
          },
      { summary }
    );
    pushHint(successHint);
    setArrangeOpen(false);
    setArrangeLocked(false);
  };

  const executeReportSingleArrange = (
    action: "left" | "hcenter" | "right" | "top" | "fillX",
    summary: string,
    successHint: string
  ): void => {
    if (!reportPrimaryNode) {
      pushHint("先选择一个章节块");
      return;
    }
    const layout = reportPrimaryNode.layout;
    if (layout?.mode !== "grid") {
      pushHint("当前选择不支持该操作");
      return;
    }
    const nextLayout: Partial<NonNullable<VNode["layout"]>> =
      action === "left"
        ? { gx: 0 }
        : action === "hcenter"
          ? { gx: Math.max(0, Math.round((reportCanvasCols - Number(layout.gw ?? 1)) / 2)) }
          : action === "right"
            ? { gx: Math.max(0, reportCanvasCols - Number(layout.gw ?? 1)) }
            : action === "top"
              ? { gy: 0 }
              : { gx: 0, gw: reportCanvasCols };
    const changed = Object.entries(nextLayout).some(([key, value]) => Number(layout[key as keyof typeof layout] ?? 0) !== Number(value ?? 0));
    executeArrangeCommands(
      changed
        ? [
            {
              type: "UpdateLayout",
              nodeId: reportPrimaryNode.id,
              layout: nextLayout
            }
          ]
        : [],
      summary,
      successHint,
      "当前布局无需调整"
    );
  };

  const openChartGalleryPreview = (): void => {
    if (!chartGalleryLocked) {
      setChartGalleryOpen(true);
    }
  };
  const closeChartGalleryPreview = (): void => {
    if (!chartGalleryLocked) {
      setChartGalleryOpen(false);
    }
  };
  const toggleChartGalleryLock = (): void => {
    if (chartGalleryLocked) {
      setChartGalleryLocked(false);
      setChartGalleryOpen(false);
      return;
    }
    setChartGalleryLocked(true);
    setChartGalleryOpen(true);
  };
  const closeChartGallery = (): void => {
    setChartGalleryOpen(false);
    setChartGalleryLocked(false);
  };

  const openTableGalleryPreview = (): void => {
    if (!tableGalleryLocked) {
      setTableGalleryOpen(true);
    }
  };
  const closeTableGalleryPreview = (): void => {
    if (!tableGalleryLocked) {
      setTableGalleryOpen(false);
    }
  };
  const toggleTableGalleryLock = (): void => {
    if (tableGalleryLocked) {
      setTableGalleryLocked(false);
      setTableGalleryOpen(false);
      return;
    }
    setTableGalleryLocked(true);
    setTableGalleryOpen(true);
  };
  const closeTableGallery = (): void => {
    setTableGalleryOpen(false);
    setTableGalleryLocked(false);
  };


  const openSceneOpsPreview = (): void => {
    if (!sceneOpsLocked) {
      setSceneOpsOpen(true);
    }
  };
  const closeSceneOpsPreview = (): void => {
    if (!sceneOpsLocked) {
      setSceneOpsOpen(false);
    }
  };
  const toggleSceneOpsLock = (): void => {
    if (sceneOpsLocked) {
      setSceneOpsLocked(false);
      setSceneOpsOpen(false);
      return;
    }
    setSceneOpsLocked(true);
    setSceneOpsOpen(true);
  };
  const closeSceneOps = (): void => {
    setSceneOpsOpen(false);
    setSceneOpsLocked(false);
  };

  const openArrangePreview = (): void => {
    if (!arrangeLocked) {
      setArrangeOpen(true);
    }
  };
  const closeArrangePreview = (): void => {
    if (!arrangeLocked) {
      setArrangeOpen(false);
    }
  };
  const toggleArrangeLock = (): void => {
    if (arrangeLocked) {
      setArrangeLocked(false);
      setArrangeOpen(false);
      return;
    }
    setArrangeLocked(true);
    setArrangeOpen(true);
  };
  const closeArrange = (): void => {
    setArrangeOpen(false);
    setArrangeLocked(false);
  };

  const openAuditPreview = (): void => {
    if (!auditLocked) {
      setAuditOpen(true);
    }
  };
  const closeAuditPreview = (): void => {
    if (!auditLocked) {
      setAuditOpen(false);
    }
  };
  const toggleAuditLock = (): void => {
    if (auditLocked) {
      setAuditLocked(false);
      setAuditOpen(false);
      return;
    }
    setAuditLocked(true);
    setAuditOpen(true);
  };
  const closeAudit = (): void => {
    setAuditOpen(false);
    setAuditLocked(false);
  };

  const visibleAuditLogs = auditLogs
    .filter((item) => (auditActorFilter === "all" ? true : item.actor === auditActorFilter))
    .slice(0, 40);

  return (
    <header className={`editor-toolbar ${compactSurfaceToolbar ? "editor-toolbar-dashboard" : ""}`}>
      <div className="editor-toolbar-row">
        {isSurfaceDoc ? (
          <div className="tool-group">
            <ToolPillButton
              icon="+"
              label="插入"
              active={isDashboardDoc ? ui.dashboardInsertPanelOpen : isPptDoc ? ui.pptInsertPanelOpen : ui.reportInsertPanelOpen}
              onClick={() => {
                if (isDashboardDoc) {
                  store.toggleDashboardInsertPanel();
                  return;
                }
                if (isPptDoc) {
                  store.togglePptInsertPanel();
                  return;
                }
                store.toggleReportInsertPanel();
              }}
              title="打开侧边插入面板"
            />
          </div>
        ) : null}
        {hasArrangeMenu ? (
          <div
            className="tool-group tool-group-menu"
            ref={arrangeRef}
            onMouseEnter={openArrangePreview}
            onMouseLeave={(event) => {
              if (shouldKeepFloatingOpen(event, arrangeLayerRef)) {
                return;
              }
              closeArrangePreview();
            }}
          >
            <ToolPillButton icon="LAY" label="排列" suffix="▾" active={arrangeOpen} onClick={toggleArrangeLock} title="统一的卡片与浮动排列操作" />
            {arrangeOpen ? (
              <FloatingLayer anchorRef={arrangeRef} layerRef={arrangeLayerRef} resolveStyle={resolveMenuLayerStyle("left")}>
              <div
                className="toolbar-pop toolbar-pop-arrange"
                onMouseEnter={openArrangePreview}
                onMouseLeave={(event) => {
                  if (shouldKeepFloatingOpen(event, arrangeRef)) {
                    return;
                  }
                  closeArrangePreview();
                }}
              >
                <div className="toolbar-pop-title">{isDashboardDoc ? "Dashboard 排列" : isPptDoc ? "PPT 排列" : "Report 排列"}</div>
                {isDashboardDoc && dashboardSelectionScope === "none" ? <div className="muted">先选择一个或多个元素</div> : null}
                {isDashboardDoc && dashboardSelectionScope === "card-single" && dashboardPrimaryNode ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="1/2" label="半宽卡片" onClick={() => executeArrangeCommands(buildDashboardApplyCardSpanCommands(doc.root, dashboardPrimaryNode.id, Math.max(2, Math.round((dashboardMetrics?.gridCols ?? 12) / 2)), dashboardMetrics?.gridCols ?? 12), "dashboard card half width", "已改为半宽卡片")} />
                    <ToolbarMenuItem icon="1/3" label="三分之一" onClick={() => executeArrangeCommands(buildDashboardApplyCardSpanCommands(doc.root, dashboardPrimaryNode.id, Math.max(2, Math.round((dashboardMetrics?.gridCols ?? 12) / 3)), dashboardMetrics?.gridCols ?? 12), "dashboard card one third", "已改为三分之一宽")} />
                    <ToolbarMenuItem icon="2/3" label="三分之二" onClick={() => executeArrangeCommands(buildDashboardApplyCardSpanCommands(doc.root, dashboardPrimaryNode.id, Math.max(2, Math.round(((dashboardMetrics?.gridCols ?? 12) * 2) / 3)), dashboardMetrics?.gridCols ?? 12), "dashboard card two thirds", "已改为三分之二宽")} />
                    <ToolbarMenuItem icon="ROW" label="整行" onClick={() => executeArrangeCommands(buildDashboardApplyCardSpanCommands(doc.root, dashboardPrimaryNode.id, dashboardMetrics?.gridCols ?? 12, dashboardMetrics?.gridCols ?? 12), "dashboard card full row", "已改为整行卡片")} />
                    <ToolbarMenuItem icon="↑" label="上移一行" onClick={() => executeArrangeCommands(buildDashboardMoveCardRowCommands(doc.root, dashboardPrimaryNode.id, -Math.max(1, Number(dashboardPrimaryNode.layout?.gh ?? 1)), dashboardMetrics?.gridCols ?? 12), "dashboard card move up", "已上移卡片")} />
                    <ToolbarMenuItem icon="↓" label="下移一行" onClick={() => executeArrangeCommands(buildDashboardMoveCardRowCommands(doc.root, dashboardPrimaryNode.id, Math.max(1, Number(dashboardPrimaryNode.layout?.gh ?? 1)), dashboardMetrics?.gridCols ?? 12), "dashboard card move down", "已下移卡片")} />
                    <ToolbarMenuItem icon="FLT" label="转为浮动元素" onClick={() => executeArrangeCommands(buildDashboardConvertToFloatingCommands(doc.root, [dashboardPrimaryNode.id], dashboardMetrics!), "dashboard convert floating", "已转为浮动元素")} />
                  </div>
                ) : null}
                {isDashboardDoc && dashboardSelectionScope === "card-multi" ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="=W" label="同宽" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, selection.selectedIds, "equalWidth", selection.primaryId).commands, "dashboard card equal width", "已统一宽度")} />
                    <ToolbarMenuItem icon="=H" label="同高" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, selection.selectedIds, "equalHeight", selection.primaryId).commands, "dashboard card equal height", "已统一高度")} />
                    <ToolbarMenuItem icon="TIDY" label="自动整理" onClick={() => executeArrangeCommands(buildDashboardAutoTidyCommands(doc.root, selection.selectedIds, dashboardMetrics?.gridCols ?? 12), "dashboard auto tidy", "已自动整理")} />
                    <ToolbarMenuItem icon="FLT" label="转为浮动元素" onClick={() => executeArrangeCommands(buildDashboardConvertToFloatingCommands(doc.root, selection.selectedIds, dashboardMetrics!), "dashboard convert floating", "已转为浮动元素")} />
                  </div>
                ) : null}
                {isDashboardDoc && dashboardSelectionScope === "floating-single" ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="⇤" label="贴左" onClick={() => applyContainerAlign("left", "dashboard align container left")} />
                    <ToolbarMenuItem icon="⇥" label="贴右" onClick={() => applyContainerAlign("right", "dashboard align container right")} />
                    <ToolbarMenuItem icon="⇞" label="贴顶" onClick={() => applyContainerAlign("top", "dashboard align container top")} />
                    <ToolbarMenuItem icon="⇟" label="贴底" onClick={() => applyContainerAlign("bottom", "dashboard align container bottom")} />
                    <ToolbarMenuItem icon="↤↦" label="水平居中" onClick={() => applyContainerAlign("hcenter", "dashboard align container center x")} />
                    <ToolbarMenuItem icon="↥↧" label="垂直居中" onClick={() => applyContainerAlign("vcenter", "dashboard align container center y")} />
                    <ToolbarMenuItem icon="CARD" label="恢复卡片布局" onClick={() => executeArrangeCommands(buildDashboardConvertToCardCommands(doc.root, selection.selectedIds, dashboardMetrics!), "dashboard convert card", "已恢复卡片布局")} />
                  </div>
                ) : null}
                {isDashboardDoc && dashboardSelectionScope === "floating-multi" ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="⟸" label="左对齐" onClick={() => applyAlign("left", "dashboard align left")} />
                    <ToolbarMenuItem icon="⇔" label="水平居中" onClick={() => applyAlign("hcenter", "dashboard align hcenter")} />
                    <ToolbarMenuItem icon="⟹" label="右对齐" onClick={() => applyAlign("right", "dashboard align right")} />
                    <ToolbarMenuItem icon="⟰" label="顶对齐" onClick={() => applyAlign("top", "dashboard align top")} />
                    <ToolbarMenuItem icon="↕" label="垂直居中" onClick={() => applyAlign("vcenter", "dashboard align vcenter")} />
                    <ToolbarMenuItem icon="⟱" label="底对齐" onClick={() => applyAlign("bottom", "dashboard align bottom")} />
                    <ToolbarMenuItem icon="⇆" label="水平均分" onClick={() => applyAlign("hdistribute", "dashboard distribute horizontal")} />
                    <ToolbarMenuItem icon="⇅" label="垂直均分" onClick={() => applyAlign("vdistribute", "dashboard distribute vertical")} />
                    <ToolbarMenuItem icon="=W" label="等宽" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, selection.selectedIds, "equalWidth", selection.primaryId).commands, "dashboard floating equal width", "已统一宽度")} />
                    <ToolbarMenuItem icon="=H" label="等高" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, selection.selectedIds, "equalHeight", selection.primaryId).commands, "dashboard floating equal height", "已统一高度")} />
                  </div>
                ) : null}
                {isDashboardDoc && dashboardSelectionScope === "mixed" ? (
                  <div className="muted">混合选择时暂不提供复杂排列，请选择同类元素。</div>
                ) : null}
                {isPptDoc && pptSelectionScope === "none" ? <div className="muted">先选择一个或多个元素</div> : null}
                {isPptDoc && pptSelectionScope === "single" && pptPrimaryNode ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="⇤" label="贴左" onClick={() => applyContainerAlign("left", "ppt align container left")} />
                    <ToolbarMenuItem icon="⇥" label="贴右" onClick={() => applyContainerAlign("right", "ppt align container right")} />
                    <ToolbarMenuItem icon="⇞" label="贴顶" onClick={() => applyContainerAlign("top", "ppt align container top")} />
                    <ToolbarMenuItem icon="⇟" label="贴底" onClick={() => applyContainerAlign("bottom", "ppt align container bottom")} />
                    <ToolbarMenuItem icon="↤↦" label="水平居中" onClick={() => applyContainerAlign("hcenter", "ppt align container center x")} />
                    <ToolbarMenuItem icon="↥↧" label="垂直居中" onClick={() => applyContainerAlign("vcenter", "ppt align container center y")} />
                    <ToolbarMenuItem
                      icon="↔"
                      label="横向撑满"
                      onClick={() =>
                        executeArrangeCommands(
                          [
                            {
                              type: "UpdateLayout",
                              nodeId: pptPrimaryNode.id,
                              layout: { mode: "absolute", x: 20, w: 920 }
                            }
                          ],
                          "ppt fill width",
                          "已横向撑满"
                        )
                      }
                    />
                  </div>
                ) : null}
                {isPptDoc && pptSelectionScope === "multi" ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="⟸" label="左对齐" onClick={() => applyAlign("left", "ppt align left")} />
                    <ToolbarMenuItem icon="⇔" label="水平居中" onClick={() => applyAlign("hcenter", "ppt align hcenter")} />
                    <ToolbarMenuItem icon="⟹" label="右对齐" onClick={() => applyAlign("right", "ppt align right")} />
                    <ToolbarMenuItem icon="⟰" label="顶对齐" onClick={() => applyAlign("top", "ppt align top")} />
                    <ToolbarMenuItem icon="↕" label="垂直居中" onClick={() => applyAlign("vcenter", "ppt align vcenter")} />
                    <ToolbarMenuItem icon="⟱" label="底对齐" onClick={() => applyAlign("bottom", "ppt align bottom")} />
                    <ToolbarMenuItem icon="⇆" label="水平均分" onClick={() => applyAlign("hdistribute", "ppt distribute horizontal")} />
                    <ToolbarMenuItem icon="⇅" label="垂直均分" onClick={() => applyAlign("vdistribute", "ppt distribute vertical")} />
                    <ToolbarMenuItem icon="=W" label="等宽" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, pptSelectionNodes.map((node) => node.id), "equalWidth", selection.primaryId).commands, "ppt equal width", "已统一宽度")} />
                    <ToolbarMenuItem icon="=H" label="等高" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, pptSelectionNodes.map((node) => node.id), "equalHeight", selection.primaryId).commands, "ppt equal height", "已统一高度")} />
                  </div>
                ) : null}
                {isReportDoc && reportSelectionScope === "none" ? <div className="muted">先选择一个或多个章节块</div> : null}
                {isReportDoc && reportSelectionScope === "single" && reportPrimaryNode ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="⇤" label="贴左" onClick={() => executeReportSingleArrange("left", "report align left", "已贴左")} />
                    <ToolbarMenuItem icon="⇥" label="贴右" onClick={() => executeReportSingleArrange("right", "report align right", "已贴右")} />
                    <ToolbarMenuItem icon="↤↦" label="水平居中" onClick={() => executeReportSingleArrange("hcenter", "report align center", "已水平居中")} />
                    <ToolbarMenuItem icon="⇞" label="贴顶" onClick={() => executeReportSingleArrange("top", "report align top", "已贴顶")} />
                    <ToolbarMenuItem icon="↔" label="横向撑满" onClick={() => executeReportSingleArrange("fillX", "report fill width", "已横向撑满")} />
                  </div>
                ) : null}
                {isReportDoc && reportSelectionScope === "multi" ? (
                  <div className="toolbar-action-grid">
                    <ToolbarMenuItem icon="⟸" label="左对齐" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "left").commands, "report align left", "已左对齐")} />
                    <ToolbarMenuItem icon="⇔" label="水平居中" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "hcenter").commands, "report align hcenter", "已水平居中")} />
                    <ToolbarMenuItem icon="⟹" label="右对齐" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "right").commands, "report align right", "已右对齐")} />
                    <ToolbarMenuItem icon="⟰" label="顶对齐" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "top").commands, "report align top", "已顶对齐")} />
                    <ToolbarMenuItem icon="↕" label="垂直居中" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "vcenter").commands, "report align vcenter", "已垂直居中")} />
                    <ToolbarMenuItem icon="⟱" label="底对齐" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "bottom").commands, "report align bottom", "已底对齐")} />
                    <ToolbarMenuItem icon="⇆" label="水平均分" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "hdistribute").commands, "report distribute horizontal", "已水平分布")} />
                    <ToolbarMenuItem icon="⇅" label="垂直均分" onClick={() => executeArrangeCommands(buildAlignCommandResult(doc.root, reportSelectionNodes.map((node) => node.id), "vdistribute").commands, "report distribute vertical", "已垂直分布")} />
                    <ToolbarMenuItem icon="=W" label="等宽" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, reportSelectionNodes.map((node) => node.id), "equalWidth", selection.primaryId).commands, "report equal width", "已统一宽度")} />
                    <ToolbarMenuItem icon="=H" label="等高" onClick={() => executeArrangeCommands(buildLayoutBatchCommands(doc.root, reportSelectionNodes.map((node) => node.id), "equalHeight", selection.primaryId).commands, "report equal height", "已统一高度")} />
                  </div>
                ) : null}
                {(isDashboardDoc
                  ? dashboardSelectionScope !== "none"
                  : isPptDoc
                    ? pptSelectionScope !== "none"
                    : reportSelectionScope !== "none") ? (
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="btn mini-btn" onClick={closeArrange}>
                      关闭
                    </button>
                  </div>
                ) : null}
              </div>
              </FloatingLayer>
            ) : null}
          </div>
        ) : null}

        <div className="tool-group">
          <ToolIconButton icon="↶" label="撤销" shortcut="Ctrl/Cmd+Z" onClick={() => store.undo()} showLabel={compactSurfaceToolbar} />
          <ToolIconButton icon="↷" label="重做" shortcut="Ctrl/Cmd+Y" onClick={() => store.redo()} showLabel={compactSurfaceToolbar} />
          {!compactSurfaceToolbar ? <ToolIconButton icon="⌘" label="命令面板" shortcut="Ctrl/Cmd+K" onClick={onOpenCommandPalette} /> : null}
          <ToolIconButton icon="⛶" label="沉浸预览" visibleLabel={compactSurfaceToolbar ? "预览" : undefined} shortcut="Shift+P" onClick={onOpenPresentPreview} showLabel={compactSurfaceToolbar} />
          <ToolIconButton
            icon="CFG"
            label="文档设置"
            visibleLabel={compactSurfaceToolbar ? "文档" : undefined}
            onClick={() => {
              store.setSelection(doc.root.id, false);
              pushHint("已切换到文档全局属性");
            }}
            showLabel={compactSurfaceToolbar}
          />
        </div>

        <div className="tool-group">
          {compactSurfaceToolbar ? (
            <ToolPillSelect
              icon="THM"
              label="风格"
              value={activeThemeId}
              onChange={(value) => store.executeCommand({ type: "ApplyTheme", scope: "doc", themeId: value }, { summary: `apply theme ${value}` })}
              options={themes.map((theme) => ({ value: theme.id, label: theme.name }))}
            />
          ) : (
            <select className="select mini-select" value={activeThemeId} onChange={(event) => store.executeCommand({ type: "ApplyTheme", scope: "doc", themeId: event.target.value }, { summary: `apply theme ${event.target.value}` })}>
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          )}
          <div
            className="tool-group tool-group-menu"
            ref={sceneOpsRef}
            onMouseEnter={openSceneOpsPreview}
            onMouseLeave={(event) => {
              if (shouldKeepFloatingOpen(event, sceneOpsLayerRef)) {
                return;
              }
              closeSceneOpsPreview();
            }}
          >
            {compactSurfaceToolbar ? (
              <ToolPillButton
                icon="CFG"
                label={isReportDoc ? "场景操作" : "展示设置"}
                suffix="▾"
                active={sceneOpsOpen}
                onClick={toggleSceneOpsLock}
                title="文档场景级操作"
              />
            ) : (
              <button className={`btn mini-btn ${sceneOpsOpen ? "primary" : ""}`} onClick={toggleSceneOpsLock} title="文档场景级操作">
                {doc.docType === "dashboard" || doc.docType === "ppt" ? "展示设置 ▾" : "场景操作 ▾"}
              </button>
            )}
            {sceneOpsOpen ? (
              <FloatingLayer anchorRef={sceneOpsRef} layerRef={sceneOpsLayerRef} resolveStyle={resolveMenuLayerStyle("right")}>
              <div
                className="toolbar-pop"
                onMouseEnter={openSceneOpsPreview}
                onMouseLeave={(event) => {
                  if (shouldKeepFloatingOpen(event, sceneOpsRef)) {
                    return;
                  }
                  closeSceneOpsPreview();
                }}
              >
                {doc.docType === "dashboard" ? (
                  <>
                    <div className="toolbar-pop-title">Dashboard</div>
                    <ToolbarMenuItem
                      icon="⛶"
                      label="切换为全屏适配"
                      onClick={() => {
                        patchRootProps(
                          {
                            displayMode: "fit_screen",
                            designWidthPx: Number(rootProps.designWidthPx ?? 1920) || 1920,
                            designHeightPx: Number(rootProps.designHeightPx ?? 1080) || 1080
                          },
                          "toolbar switch dashboard fit screen"
                        );
                        closeSceneOps();
                      }}
                    />
                    <ToolbarMenuItem
                      icon="▤"
                      label="切换为页面滚动"
                      onClick={() => {
                        patchRootProps(
                          {
                            displayMode: "scroll_page",
                            pageWidthPx: Number(rootProps.pageWidthPx ?? 1280) || 1280
                          },
                          "toolbar switch dashboard scroll page"
                        );
                        closeSceneOps();
                      }}
                    />
                  </>
                ) : null}
                {doc.docType === "report" ? (
                  <>
                    <div className="toolbar-pop-title">Report</div>
                    <ToolbarMenuItem
                      icon="CFG"
                      label={reportConfigShown ? "隐藏报告结构设置" : "显示报告结构设置"}
                      onClick={() => {
                        patchRootProps({ editorShowReportConfig: !reportConfigShown }, "toolbar toggle report config");
                        closeSceneOps();
                      }}
                    />
                    <ToolbarMenuItem
                      icon="EXP"
                      label="导出打印（PDF）"
                      onClick={() => {
                        const result = exportReportToPrint(doc);
                        pushHint(result.message);
                        closeSceneOps();
                      }}
                    />
                  </>
                ) : null}
                {doc.docType === "ppt" ? (
                  <>
                    <div className="toolbar-pop-title">PPT</div>
                    <ToolbarMenuItem
                      icon="SN"
                      label={pptSnapEnabled ? "关闭吸附" : "开启吸附"}
                      onClick={() => {
                        patchRootProps({ editorSnapEnabled: !pptSnapEnabled }, "toolbar toggle ppt snap");
                        closeSceneOps();
                      }}
                    />
                  </>
                ) : null}
              </div>
              </FloatingLayer>
            ) : null}
          </div>
          {persona !== "novice" && !isDashboardDoc ? (
            <>
              <button className={`btn mini-btn ${showBatchPanel ? "primary" : ""}`} onClick={onToggleBatchPanel} title="批量修改">
                批量
              </button>
              <button className={`btn mini-btn ${showFilterPanel ? "primary" : ""}`} onClick={onToggleFilterPanel} title="高级过滤">
                过滤
              </button>
            </>
          ) : null}
          {compactSurfaceToolbar ? (
            <div
              className="tool-group tool-group-menu"
              ref={auditRef}
              onMouseEnter={openAuditPreview}
              onMouseLeave={(event) => {
                if (shouldKeepFloatingOpen(event, auditLayerRef)) {
                  return;
                }
                closeAuditPreview();
              }}
            >
              <ToolPillButton icon="LOG" label="操作日志" visibleLabel="日志" suffix="▾" active={auditOpen} onClick={toggleAuditLock} title="查看操作日志" />
              {auditOpen ? (
                <FloatingLayer anchorRef={auditRef} layerRef={auditLayerRef} resolveStyle={resolveMenuLayerStyle("right")}>
                <div
                  className="toolbar-pop toolbar-pop-audit"
                  onMouseEnter={openAuditPreview}
                  onMouseLeave={(event) => {
                    if (shouldKeepFloatingOpen(event, auditRef)) {
                      return;
                    }
                    closeAuditPreview();
                  }}
                >
                  <div className="toolbar-pop-title">操作日志</div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="row">
                      <button className={`btn mini-btn ${auditActorFilter === "all" ? "primary" : ""}`} title="查看全部来源日志" onClick={() => setAuditActorFilter("all")}>
                        全部
                      </button>
                      <button className={`btn mini-btn ${auditActorFilter === "ui" ? "primary" : ""}`} title="仅查看 UI 操作日志" onClick={() => setAuditActorFilter("ui")}>
                        UI
                      </button>
                      <button className={`btn mini-btn ${auditActorFilter === "ai" ? "primary" : ""}`} title="仅查看 AI 操作日志" onClick={() => setAuditActorFilter("ai")}>
                        AI
                      </button>
                    </div>
                    <button className="btn mini-btn" title="关闭操作日志" onClick={closeAudit}>
                      关闭
                    </button>
                  </div>
                  {visibleAuditLogs.length === 0 ? <div className="muted">暂无日志</div> : null}
                  <div className="toolbar-audit-list">
                    {visibleAuditLogs.map((item) => (
                      <div key={item.id} className="toolbar-audit-item">
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <span className="chip">{item.actor}</span>
                          <span className="muted">{item.at.replace("T", " ").slice(0, 19)}</span>
                        </div>
                        <div>{item.summary}</div>
                        {item.changedPaths.length > 0 ? <div className="muted">{item.changedPaths.slice(0, 2).join(" | ")}</div> : null}
                      </div>
                    ))}
                  </div>
                </div>
                </FloatingLayer>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {doc.docType === "report" && !compactSurfaceToolbar ? (
      <div className="editor-toolbar-row compact">
        <div className="tool-group">
          <span className="chip">文档: {doc.docType}</span>
          <span className="chip">选中: {selection.selectedIds.length}</span>
          <span className="chip">元素快捷: 悬浮栏 / 属性栏</span>
          {doc.docType === "report" && selectedSection ? (
            <span className="chip">{`章节: ${String((selectedSection.props as Record<string, unknown> | undefined)?.title ?? selectedSection.id)}`}</span>
          ) : null}
          {actionHint ? <span className="chip">{actionHint}</span> : null}
        </div>
        <div
          className="tool-group tool-group-menu"
          ref={auditRef}
          onMouseEnter={openAuditPreview}
          onMouseLeave={(event) => {
            if (shouldKeepFloatingOpen(event, auditLayerRef)) {
              return;
            }
            closeAuditPreview();
          }}
        >
          <button className={`btn mini-btn ${auditOpen ? "primary" : ""}`} onClick={toggleAuditLock} title="查看操作日志">
            操作日志 ▾
          </button>
          {auditOpen ? (
            <FloatingLayer anchorRef={auditRef} layerRef={auditLayerRef} resolveStyle={resolveMenuLayerStyle("right")}>
            <div
              className="toolbar-pop toolbar-pop-audit"
              onMouseEnter={openAuditPreview}
              onMouseLeave={(event) => {
                if (shouldKeepFloatingOpen(event, auditRef)) {
                  return;
                }
                closeAuditPreview();
              }}
            >
              <div className="toolbar-pop-title">操作日志</div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="row">
                  <button className={`btn mini-btn ${auditActorFilter === "all" ? "primary" : ""}`} title="查看全部来源日志" onClick={() => setAuditActorFilter("all")}>
                    全部
                  </button>
                  <button className={`btn mini-btn ${auditActorFilter === "ui" ? "primary" : ""}`} title="仅查看 UI 操作日志" onClick={() => setAuditActorFilter("ui")}>
                    UI
                  </button>
                  <button className={`btn mini-btn ${auditActorFilter === "ai" ? "primary" : ""}`} title="仅查看 AI 操作日志" onClick={() => setAuditActorFilter("ai")}>
                    AI
                  </button>
                </div>
                <button className="btn mini-btn" title="关闭操作日志" onClick={closeAudit}>
                  关闭
                </button>
              </div>
              {visibleAuditLogs.length === 0 ? <div className="muted">暂无日志</div> : null}
              <div className="toolbar-audit-list">
                {visibleAuditLogs.map((item) => (
                  <div key={item.id} className="toolbar-audit-item">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="chip">{item.actor}</span>
                      <span className="muted">{item.at.replace("T", " ").slice(0, 19)}</span>
                    </div>
                    <div>{item.summary}</div>
                    {item.changedPaths.length > 0 ? <div className="muted">{item.changedPaths.slice(0, 2).join(" | ")}</div> : null}
                  </div>
                ))}
              </div>
            </div>
            </FloatingLayer>
          ) : null}
        </div>
        {canEditNode && doc.docType === "report" && selectedSection ? (
          <div className="tool-group">
            <button className="btn mini-btn" onClick={() => insertIntoReportSection("text")} title="向当前章节插入文本">
              +文本
            </button>
            <button className="btn mini-btn" onClick={() => insertIntoReportSection("chart")} title="向当前章节插入图表">
              +图表
            </button>
            <button className="btn mini-btn" onClick={() => insertIntoReportSection("table")} title="向当前章节插入表格">
              +表格
            </button>
          </div>
        ) : null}
      </div>
      ) : null}
    </header>
  );
}

function GallerySectionTitle({ title }: { title: string }): JSX.Element {
  return <div className="insert-gallery-title">{title}</div>;
}

function ChartTypeGlyph({ type }: { type: ChartType }): JSX.Element {
  const symbol: Record<ChartType, string> = {
    auto: "A",
    line: "∿",
    bar: "▇",
    pie: "◔",
    combo: "◫",
    scatter: "⋰",
    radar: "⬡",
    heatmap: "▦",
    kline: "╂",
    boxplot: "⊞",
    sankey: "⇢",
    graph: "◌",
    treemap: "▤",
    sunburst: "◍",
    parallel: "∥",
    funnel: "▽",
    gauge: "◠",
    calendar: "▣",
    custom: "✦"
  };
  return <span className="insert-gallery-icon">{symbol[type] ?? "◻"}</span>;
}

function TablePresetGlyph({ preset }: { preset: TablePreset }): JSX.Element {
  const symbol: Record<TablePreset, string> = {
    basic: "▤",
    "multi-header": "▥",
    pivot: "◫"
  };
  return <span className="insert-gallery-icon">{symbol[preset]}</span>;
}

function ToolIconButton({
  icon,
  label,
  visibleLabel,
  shortcut,
  onClick,
  disabled,
  active,
  tone,
  showLabel = false
}: {
  icon: string;
  label: string;
  visibleLabel?: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  tone?: "default" | "danger";
  showLabel?: boolean;
}): JSX.Element {
  if (showLabel) {
    return (
      <ToolPillButton
        icon={icon}
        label={label}
        visibleLabel={visibleLabel}
        onClick={onClick}
        disabled={disabled}
        active={active}
        tone={tone}
        title={shortcut ? `${label} (${shortcut})` : label}
      />
    );
  }
  return (
    <button
      className={`tool-icon-btn ${active ? "active" : ""} ${tone === "danger" ? "danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
    >
      <span className="tool-icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}

function ToolPillButton({
  icon,
  label,
  visibleLabel,
  suffix,
  onClick,
  title,
  disabled,
  active,
  tone
}: {
  icon: string;
  label: string;
  visibleLabel?: string;
  suffix?: string;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
  active?: boolean;
  tone?: "default" | "danger";
}): JSX.Element {
  return (
    <button
      className={`tool-pill-btn ${active ? "active" : ""} ${tone === "danger" ? "danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
    >
      <span className="tool-pill-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tool-pill-label">{visibleLabel ?? label}</span>
      {suffix ? (
        <span className="tool-pill-suffix" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </button>
  );
}

function ToolPillSelect({
  icon,
  label,
  value,
  onChange,
  options
}: {
  icon: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}): JSX.Element {
  return (
    <label className="tool-pill-select" aria-label={label} title={label}>
      <span className="tool-pill-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="tool-pill-label">{label}</span>
      <select className="tool-pill-select-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToolbarMenuItem({
  icon,
  label,
  onClick,
  disabled,
  tone
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}): JSX.Element {
  return (
    <button className={`toolbar-menu-item ${tone === "danger" ? "danger" : ""}`} title={label} onClick={onClick} disabled={disabled}>
      <span className="toolbar-menu-main">
        <span className="toolbar-menu-icon">{icon}</span>
        <span>{label}</span>
      </span>
      <span className="toolbar-menu-arrow">›</span>
    </button>
  );
}

const canHaveChildren = (node: VNode): boolean => node.kind === "container" || node.kind === "section" || node.kind === "slide";
