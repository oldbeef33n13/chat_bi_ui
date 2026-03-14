import type { VDoc } from "../../core/doc/types";
import type { SelectionState } from "../../core/kernel/types";
import { randomUUID } from "../../core/utils/id";
import { HttpAiOrchestrationRepository, type AiPatchProposal, type ProposeEditRequest } from "../api/ai-orchestration";
import { resolveAncestorIdByKind } from "./node-tree";

const AI_THREAD_STORAGE_PREFIX = "chatbi.ai.thread";

export const aiOrchestrationRepo = new HttpAiOrchestrationRepository();

export const getAiThreadId = (docId: string): string => {
  const fallback = `thread_${randomUUID().replace(/-/g, "")}`;
  if (typeof window === "undefined") {
    return fallback;
  }
  const key = `${AI_THREAD_STORAGE_PREFIX}:${docId}`;
  const existing = window.sessionStorage.getItem(key);
  if (existing && existing.trim().length > 0) {
    return existing;
  }
  window.sessionStorage.setItem(key, fallback);
  return fallback;
};

export const buildTemplateVariables = (doc?: VDoc | null): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const variable of doc?.templateVariables ?? []) {
    if (!variable.key || variable.defaultValue === undefined) {
      continue;
    }
    values[variable.key] = variable.defaultValue;
  }
  return values;
};

export const buildEditProposalRequest = ({
  doc,
  prompt,
  selection,
  baseRevision
}: {
  doc: VDoc;
  prompt: string;
  selection: SelectionState;
  baseRevision: number;
}): ProposeEditRequest => ({
  threadId: getAiThreadId(doc.docId),
  docId: doc.docId,
  docType: doc.docType,
  userText: prompt,
  baseRevision,
  snapshotDsl: doc,
  selectedObjectIds: selection.selectedIds,
  activeSectionId: resolveAncestorIdByKind(doc.root, selection.primaryId, "section"),
  activeSlideId: resolveAncestorIdByKind(doc.root, selection.primaryId, "slide"),
  templateVariables: buildTemplateVariables(doc)
});

export const formatProposalExplanation = (proposal: AiPatchProposal): string => {
  const lines = [`摘要: ${proposal.summary}`, `风险: ${proposal.risk}`, `来源: ${proposal.source}`];
  if (proposal.explanation.length > 0) {
    lines.push("");
    lines.push(...proposal.explanation.map((item, index) => `${index + 1}. ${item}`));
  }
  return lines.join("\n");
};

export const formatClarification = (question?: string): string =>
  question ? `需要补充信息：${question}` : "当前请求还不够明确，暂时无法生成修改计划。";
