import type { EditorDocType, TemplateSeed } from "../api/template-repository";

export interface BlankTemplateOption {
  id: string;
  label: string;
  description: string;
  docType: EditorDocType;
  icon: string;
  dashboardPreset?: "wallboard" | "workbench";
}

export type RouteState = { page: "library" } | { page: "detail"; docId: string; mode: "view" | "edit" | "present" };

export const DOC_TYPES: EditorDocType[] = ["dashboard", "report", "ppt"];

export const DOC_TYPE_LABELS: Record<EditorDocType, string> = {
  dashboard: "Dashboard",
  report: "Report",
  ppt: "PPT"
};

export const BLANK_TEMPLATE_OPTIONS: BlankTemplateOption[] = [
  {
    id: "blank-dashboard-wallboard",
    label: "监控大屏",
    description: "空白全屏大屏，适合值班大盘和电视墙",
    docType: "dashboard",
    icon: "⛶",
    dashboardPreset: "wallboard"
  },
  {
    id: "blank-dashboard-workbench",
    label: "PC 工作台",
    description: "空白页面工作台，适合首页和运营工作台",
    docType: "dashboard",
    icon: "▤",
    dashboardPreset: "workbench"
  },
  {
    id: "blank-report",
    label: "空白报告",
    description: "创建仅含空章节的报告模板",
    docType: "report",
    icon: "📝"
  },
  {
    id: "blank-ppt",
    label: "空白汇报",
    description: "创建仅含空白页的汇报模板",
    docType: "ppt",
    icon: "▣"
  }
];

export const groupSeedTemplates = (seeds: TemplateSeed[]): Array<{ docType: EditorDocType; label: string; items: TemplateSeed[] }> =>
  DOC_TYPES.map((docType) => ({
    docType,
    label: DOC_TYPE_LABELS[docType],
    items: seeds.filter((item) => item.docType === docType)
  })).filter((group) => group.items.length > 0);

export const shouldUseTenFootLayout = (width: number, height: number): boolean => width >= 1700 || (width >= 1440 && height >= 900);

export const formatUiTime = (iso: string): string => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return iso;
  }
  return dt.toLocaleString("zh-CN", { hour12: false });
};

export const formatRuntimeValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const isTypingTarget = (target: HTMLElement | null): boolean =>
  !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
