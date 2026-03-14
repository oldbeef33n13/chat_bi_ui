import { prefixedId } from "../../utils/id";
import { defaultChartSpec } from "../defaults";
import type { ChartSpec, DocType, VDoc, VNode } from "../types";

export interface BuiltInDocExample {
  id: string;
  docType: Extract<DocType, "dashboard" | "report" | "ppt">;
  name: string;
  description: string;
  build: () => VDoc;
}

export const makeGridChart = (
  title: string,
  gx: number,
  gy: number,
  gw: number,
  gh: number,
  spec: Partial<ChartSpec>,
  data: { sourceId: string; queryId?: string; filterRefs?: string[] }
): VNode<ChartSpec> => ({
  id: prefixedId("chart"),
  kind: "chart",
  name: title,
  layout: { mode: "grid", gx, gy, gw, gh },
  data,
  props: { ...defaultChartSpec(title), ...spec }
});

export const makeTextNode = (text: string): VNode => ({
  id: prefixedId("text"),
  kind: "text",
  props: { text, format: "plain" }
});

export const makeSection = (title: string, children: VNode[]): VNode => ({
  id: prefixedId("section"),
  kind: "section",
  props: { title },
  children
});

export const makeSlide = (title: string, children: VNode[]): VNode => ({
  id: prefixedId("slide"),
  kind: "slide",
  props: { title, layoutTemplateId: "title-double-summary" },
  layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
  children
});
