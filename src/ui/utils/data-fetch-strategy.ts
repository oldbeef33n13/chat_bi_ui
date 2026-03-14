import type { VDoc } from "../../core/doc/types";
import type { FlattenedReportSection } from "./report-sections";
import { collectFetchEligibleNodes } from "./node-data-request";

const dedupeByKey = <T>(items: T[], getKey: (item: T) => string): T[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const resolveDashboardPrefetchNodes = (doc: VDoc) => collectFetchEligibleNodes(doc.root.children ?? []);

export const resolvePptPrefetchNodes = (doc: VDoc, activeSlideId?: string, lookahead = 1) => {
  const slides = (doc.root.children ?? []).filter((node) => node.kind === "slide");
  if (slides.length === 0) {
    return [];
  }
  const resolvedIndex = slides.findIndex((slide) => slide.id === activeSlideId);
  const startIndex = resolvedIndex >= 0 ? resolvedIndex : 0;
  const targetDataBearingSlides = Math.max(1, lookahead + 1);
  const nodes = [];
  let dataBearingCount = 0;
  for (let index = startIndex; index < slides.length; index += 1) {
    const slide = slides[index];
    if (!slide) {
      continue;
    }
    const eligibleNodes = collectFetchEligibleNodes([slide]);
    if (eligibleNodes.length > 0) {
      nodes.push(...eligibleNodes);
      dataBearingCount += 1;
    }
    if (dataBearingCount >= targetDataBearingSlides) {
      break;
    }
  }
  return nodes;
};

export const resolveReportPrefetchNodes = (
  sections: FlattenedReportSection[],
  visibleSectionIds: string[] = [],
  lookahead = 1
) => {
  if (sections.length === 0) {
    return [];
  }
  const orderedVisible = visibleSectionIds
    .map((sectionId) => sections.find((item) => item.section.id === sectionId))
    .filter((item): item is FlattenedReportSection => Boolean(item));
  const startIndex =
    orderedVisible.length > 0
      ? Math.max(
          0,
          sections.findIndex((item) => item.section.id === orderedVisible[0]!.section.id)
        )
      : 0;
  const targetDataBearingSections = Math.max(1, lookahead + 1);
  const scopedSections: FlattenedReportSection[] = dedupeByKey([...orderedVisible], (item) => item.section.id);
  let dataBearingCount = scopedSections.reduce(
    (count, item) => count + (collectFetchEligibleNodes(item.blocks).length > 0 ? 1 : 0),
    0
  );
  for (let index = startIndex; index < sections.length; index += 1) {
    const section = sections[index];
    if (!section) {
      continue;
    }
    if (scopedSections.some((item) => item.section.id === section.section.id)) {
      continue;
    }
    scopedSections.push(section);
    if (collectFetchEligibleNodes(section.blocks).length > 0) {
      dataBearingCount += 1;
    }
    if (dataBearingCount >= targetDataBearingSections) {
      break;
    }
  }
  return collectFetchEligibleNodes(scopedSections.flatMap((item) => item.blocks));
};
