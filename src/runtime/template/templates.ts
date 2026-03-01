import { prefixedId } from "../../core/utils/id";
import type { Command, DocType, VNode } from "../../core/doc/types";
import { defaultChartSpec } from "../../core/doc/defaults";

const id = (prefix: string): string => prefixedId(prefix);

export interface TemplateDef {
  id: string;
  name: string;
  target: NonNullable<Command["templateTarget"]>;
  description: string;
  personas: Array<"novice" | "analyst" | "designer" | "ai">;
  tags?: string[];
  build: () => VNode[];
}

const dashboardTemplates: TemplateDef[] = [
  {
    id: "dash.noc.overview",
    name: "NOC 告警总览",
    target: "dashboard",
    description: "适用于小白用户的一键总览模板，包含趋势与分布。",
    personas: ["novice", "ai"],
    tags: ["network", "overview", "quick-start"],
    build: () => [
      {
        id: id("chart"),
        kind: "chart",
        layout: { mode: "grid", gx: 0, gy: 0, gw: 6, gh: 6 },
        props: defaultChartSpec("告警趋势")
      },
      {
        id: id("chart"),
        kind: "chart",
        layout: { mode: "grid", gx: 6, gy: 0, gw: 6, gh: 6 },
        props: { ...defaultChartSpec("区域分布"), chartType: "pie", bindings: [{ role: "category", field: "region" }, { role: "value", field: "alarm_count", agg: "sum" }] }
      }
    ]
  }
];

const reportTemplates: TemplateDef[] = [
  {
    id: "report.weekly.basic",
    name: "周报模板",
    target: "section",
    description: "适用于业务分析人员的周报结构模板，含结论与图表区。",
    personas: ["analyst", "ai"],
    tags: ["weekly", "report"],
    build: () => [
      {
        id: id("section"),
        kind: "section",
        props: { title: "新增章节" },
        children: [
          { id: id("text"), kind: "text", props: { text: "填写分析结论...", format: "plain" } },
          { id: id("chart"), kind: "chart", props: defaultChartSpec("关键指标趋势") }
        ]
      }
    ]
  }
];

const pptTemplates: TemplateDef[] = [
  {
    id: "ppt.slide.title-double-summary",
    name: "标题+双图+总结",
    target: "slide",
    description: "适用于设计型用户的汇报模板，强调视觉节奏和结构化信息。",
    personas: ["designer", "analyst"],
    tags: ["ppt", "presentation"],
    build: () => [
      {
        id: id("text"),
        kind: "text",
        layout: { mode: "absolute", x: 40, y: 24, w: 360, h: 46, z: 2 },
        props: { text: "新增汇报主题", format: "plain" },
        style: { fontSize: 26, bold: true }
      },
      {
        id: id("chart"),
        kind: "chart",
        layout: { mode: "absolute", x: 40, y: 88, w: 430, h: 260, z: 1 },
        props: defaultChartSpec("趋势图")
      },
      {
        id: id("chart"),
        kind: "chart",
        layout: { mode: "absolute", x: 490, y: 88, w: 430, h: 260, z: 1 },
        props: { ...defaultChartSpec("分布图"), chartType: "bar" }
      },
      {
        id: id("text"),
        kind: "text",
        layout: { mode: "absolute", x: 40, y: 370, w: 880, h: 126, z: 1 },
        props: { text: "总结：\n- 关键指标1\n- 关键指标2\n- 行动项", format: "plain" },
        style: { bg: "#f8fbff", pad: 12, borderW: 1, borderC: "#dbeafe", radius: 10 }
      }
    ]
  }
];

export const allTemplates: TemplateDef[] = [...dashboardTemplates, ...reportTemplates, ...pptTemplates];

export const resolveTemplate = (templateId: string, target?: Command["templateTarget"]): VNode[] => {
  const template = allTemplates.find((tpl) => tpl.id === templateId && (!target || tpl.target === target));
  return template ? template.build() : [];
};

const targetForDocType = (docType: DocType): TemplateDef["target"] => {
  switch (docType) {
    case "dashboard":
      return "dashboard";
    case "report":
      return "section";
    case "ppt":
      return "slide";
    case "chart":
      return "dashboard";
    default:
      return "dashboard";
  }
};

export const listTemplatesForDocType = (docType: DocType): TemplateDef[] => {
  const target = targetForDocType(docType);
  return allTemplates.filter((tpl) => tpl.target === target);
};

export const personaLabel = (persona: TemplateDef["personas"][number]): string => {
  switch (persona) {
    case "novice":
      return "小白";
    case "analyst":
      return "分析";
    case "designer":
      return "设计";
    case "ai":
      return "AI协作";
    default:
      return persona;
  }
};
