import { createDashboardDoc } from "./defaults";
import type { DocType, VDoc } from "./types";
import { dashboardExamples } from "./examples/dashboard-examples";
import { pptExamples } from "./examples/ppt-examples";
import { reportExamples } from "./examples/report-examples";
import type { BuiltInDocExample } from "./examples/shared";

export type { BuiltInDocExample } from "./examples/shared";

const allExamples: BuiltInDocExample[] = [...dashboardExamples, ...reportExamples, ...pptExamples];

const normalizeDocType = (docType: DocType): Extract<DocType, "dashboard" | "report" | "ppt"> =>
  docType === "chart" ? "dashboard" : docType;

const preferredExampleByDocType: Record<Extract<DocType, "dashboard" | "report" | "ppt">, string> = {
  dashboard: "dashboard.noc",
  report: "report.monthly.enterprise",
  ppt: "ppt.quarterly.board"
};

export const listBuiltInDocExamples = (docType: DocType): BuiltInDocExample[] => {
  const normalized = normalizeDocType(docType);
  return allExamples.filter((item) => item.docType === normalized);
};

export const resolveDocExampleId = (docType: DocType, exampleId?: string): string => {
  const list = listBuiltInDocExamples(docType);
  if (list.length === 0) {
    return "";
  }
  if (exampleId && list.some((item) => item.id === exampleId)) {
    return exampleId;
  }
  const preferred = preferredExampleByDocType[normalizeDocType(docType)];
  if (preferred && list.some((item) => item.id === preferred)) {
    return preferred;
  }
  return list[0]!.id;
};

export const createBuiltInDoc = (docType: DocType, exampleId?: string): VDoc => {
  const resolvedId = resolveDocExampleId(docType, exampleId);
  const found = listBuiltInDocExamples(docType).find((item) => item.id === resolvedId);
  if (found) {
    return found.build();
  }
  return createDashboardDoc();
};
