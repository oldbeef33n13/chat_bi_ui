import type { VNode } from "../../core/doc/types";

export interface FlattenedReportSection {
  section: VNode;
  level: 1 | 2;
  parentId?: string;
  orderLabel: string;
  title: string;
  blocks: VNode[];
}

/** 顶层章节（root.children） */
export const getTopReportSections = (root: VNode): VNode[] => (root.children ?? []).filter((node) => node.kind === "section");

/** 子章节（section.children 中 kind=section） */
export const getSubsections = (section: VNode): VNode[] => (section.children ?? []).filter((child) => child.kind === "section");

/** 章节下可渲染块（过滤掉子章节节点） */
export const getSectionBlocks = (section: VNode): VNode[] => (section.children ?? []).filter((child) => child.kind !== "section");

/** 将两层章节树展平，用于目录/TOC/分页渲染。 */
export const flattenReportSections = (topSections: VNode[]): FlattenedReportSection[] => {
  const list: FlattenedReportSection[] = [];
  topSections.forEach((section, index) => {
    const title = String((section.props as Record<string, unknown> | undefined)?.title ?? `章节 ${index + 1}`);
    list.push({
      section,
      level: 1,
      orderLabel: `${index + 1}`,
      title,
      blocks: getSectionBlocks(section)
    });
    const subs = getSubsections(section);
    subs.forEach((sub, subIndex) => {
      const subTitle = String((sub.props as Record<string, unknown> | undefined)?.title ?? `子章节 ${subIndex + 1}`);
      list.push({
        section: sub,
        level: 2,
        parentId: section.id,
        orderLabel: `${index + 1}.${subIndex + 1}`,
        title: subTitle,
        blocks: getSectionBlocks(sub)
      });
    });
  });
  return list;
};
