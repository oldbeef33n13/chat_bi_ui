import type { ReportProps, VDoc } from "../../../core/doc/types";
import { flattenReportSections, getTopReportSections, type FlattenedReportSection } from "../../utils/report-sections";
import type { ReportRuntimeProps } from "./types";

export const normalizeReportProps = (doc: VDoc): ReportRuntimeProps => {
  const raw = ((doc.root.props as ReportProps | undefined) ?? {}) as ReportProps;
  const reportTitle = raw.reportTitle ?? doc.title ?? "未命名报告";
  const preset = raw.marginPreset ?? "normal";
  const presetMargins =
    preset === "narrow"
      ? { top: 10, right: 10, bottom: 10, left: 10 }
      : preset === "wide"
        ? { top: 20, right: 20, bottom: 20, left: 20 }
        : { top: 14, right: 14, bottom: 14, left: 14 };
  const useCustomMargins = preset === "custom";
  return {
    ...raw,
    reportTitle,
    tocShow: raw.tocShow ?? true,
    coverEnabled: raw.coverEnabled ?? true,
    coverTitle: raw.coverTitle ?? reportTitle,
    coverTitleStyle: raw.coverTitleStyle ?? {},
    coverSubtitle: raw.coverSubtitle ?? "Report",
    coverNote: raw.coverNote ?? `生成时间：${new Date().toLocaleDateString()}`,
    summaryEnabled: raw.summaryEnabled ?? true,
    summaryTitle: raw.summaryTitle ?? "执行摘要",
    summaryTitleStyle: raw.summaryTitleStyle ?? {},
    summaryText: raw.summaryText ?? "",
    headerText: raw.headerText ?? reportTitle,
    headerStyle: raw.headerStyle ?? {},
    footerText: raw.footerText ?? "Visual Document OS",
    footerStyle: raw.footerStyle ?? {},
    showPageNumber: raw.showPageNumber ?? true,
    sectionTitleStyle: raw.sectionTitleStyle ?? {},
    pageSize: raw.pageSize ?? "A4",
    paginationStrategy: raw.paginationStrategy ?? "section",
    marginPreset: preset,
    marginTopMm: Math.max(6, Number(useCustomMargins ? (raw.marginTopMm ?? presetMargins.top) : presetMargins.top) || presetMargins.top),
    marginRightMm: Math.max(6, Number(useCustomMargins ? (raw.marginRightMm ?? presetMargins.right) : presetMargins.right) || presetMargins.right),
    marginBottomMm: Math.max(6, Number(useCustomMargins ? (raw.marginBottomMm ?? presetMargins.bottom) : presetMargins.bottom) || presetMargins.bottom),
    marginLeftMm: Math.max(6, Number(useCustomMargins ? (raw.marginLeftMm ?? presetMargins.left) : presetMargins.left) || presetMargins.left),
    bodyPaddingPx: Math.max(0, Number(raw.bodyPaddingPx ?? 12) || 12),
    sectionGapPx: Math.max(0, Number(raw.sectionGapPx ?? 12) || 12),
    blockGapPx: Math.max(0, Number(raw.blockGapPx ?? 8) || 8)
  };
};

export const countPages = (props: ReportRuntimeProps, sectionCount: number): number =>
  sectionCount + (props.coverEnabled ? 1 : 0) + (props.tocShow ? 1 : 0) + (props.summaryEnabled ? 1 : 0);

export const buildPreviewSectionPageMap = (props: ReportRuntimeProps, sections: FlattenedReportSection[]): Map<string, number> => {
  let page = 0;
  if (props.coverEnabled) {
    page += 1;
  }
  if (props.tocShow) {
    page += 1;
  }
  const map = new Map<string, number>();
  sections.forEach((section) => {
    page += 1;
    map.set(section.section.id, page);
  });
  return map;
};

export const buildAutoSummary = (doc: VDoc): string => {
  const sections = flattenReportSections(getTopReportSections(doc.root));
  const chartCount = sections.reduce((sum, section) => sum + section.blocks.filter((node) => node.kind === "chart").length, 0);
  const textCount = sections.reduce((sum, section) => sum + section.blocks.filter((node) => node.kind === "text").length, 0);
  const titles = sections
    .map((section) => section.title)
    .slice(0, 3)
    .join("、");
  if (sections.length === 0) {
    return "报告暂无章节，建议先新增章节并补充关键图表。";
  }
  return `本报告共 ${sections.length} 个章节，包含 ${chartCount} 张图表与 ${textCount} 段文本。重点章节：${titles}。建议优先核对峰值异常与对应处置动作。`;
};
