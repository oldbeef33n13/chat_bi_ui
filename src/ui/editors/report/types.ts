import type { Command, ReportProps } from "../../../core/doc/types";
import type { ReportGridRow } from "../../utils/report-layout";
import type { ReportCanvasGuide } from "../../utils/report-canvas";
import type { ReportRowInsertPosition } from "../../utils/report-row-actions";
import type { FlattenedReportSection } from "../../utils/report-sections";
import type { EditorSemanticAction } from "../../telemetry/editor-telemetry";

export interface ReportRuntimeProps extends ReportProps {
  reportTitle: string;
  tocShow: boolean;
  coverEnabled: boolean;
  coverTitle: string;
  coverSubtitle: string;
  coverNote: string;
  summaryEnabled: boolean;
  summaryTitle: string;
  summaryText: string;
  headerText: string;
  footerText: string;
  showPageNumber: boolean;
  paginationStrategy: "section" | "continuous";
  marginPreset: "narrow" | "normal" | "wide" | "custom";
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  bodyPaddingPx: number;
  sectionGapPx: number;
  blockGapPx: number;
}

interface ReportEntryBase {
  key: string;
  height: number;
  pageIndex: number;
}

export interface CoverEntry extends ReportEntryBase {
  kind: "cover";
}

export interface SectionHeaderEntry extends ReportEntryBase {
  kind: "section";
  item: FlattenedReportSection;
  rows: ReportGridRow[];
  canvasHeight: number;
}

export interface SummaryEntry extends ReportEntryBase {
  kind: "summary";
}

export interface TocEntry extends ReportEntryBase {
  kind: "toc";
}

export type ReportEntry = CoverEntry | TocEntry | SectionHeaderEntry | SummaryEntry;

export interface ExecutableReportPlan {
  commands: Command[];
  summary: string;
  semanticAction: EditorSemanticAction;
  primaryNodeId?: string;
  selectedNodeIds?: string[];
}

export interface ReportRowPreviewState {
  sectionId: string;
  rowKey: string;
  mode: "layout" | "drag";
  label: string;
  widths: number[];
  orderedNodeIds: string[];
}

export interface ReportRowDragState {
  sectionId: string;
  rowKey: string;
  nodeId: string;
}

export interface ReportRowDropLinePreview {
  sectionId: string;
  rowKey: string;
  position: ReportRowInsertPosition;
  label: string;
}

export interface ReportCanvasDragState {
  sectionId: string;
  nodeId: string;
  selectedNodeIds: string[];
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  previewLeft: number;
  previewTop: number;
  width: number;
  height: number;
  duplicateOnDrop: boolean;
}

export interface ReportCanvasResizeState {
  sectionId: string;
  nodeId: string;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startHeight: number;
  previewWidth: number;
  previewHeight: number;
}

export interface ReportCanvasGuidePreview {
  sectionId: string;
  guides: ReportCanvasGuide[];
}

export interface ReportCanvasMarqueeState {
  pageIndex: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

export interface ReportCanvasInsertPreviewState {
  sectionId: string;
  pageIndex: number;
  itemId: string;
  label: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}
