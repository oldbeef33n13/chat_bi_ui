import type { Command, DocType, VDoc, VNode } from "../../core/doc/types";
import { findNodeById } from "../../core/doc/tree";
import { prefixedId } from "../../core/utils/id";
import type {
  AiConversationRoute,
  AiChartAskResponse,
  AiGeneratedArtifact,
  AiGenerationJob,
  AiGenerationOutlineUnit,
  AiGenerationUnit,
  AiPatchProposal,
  AiRuntimeAnalysisResponse,
  AiStorySummaryResponse
} from "../api/ai-orchestration";

export type CopilotResultKind = "proposal" | "outline" | "artifact" | "insight";

export interface CopilotResultBase {
  resultId: string;
  sceneId: string;
  threadId?: string;
  docId?: string;
  docType?: Exclude<DocType, "chart">;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
  kind: CopilotResultKind;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

interface ResultBuildMeta {
  threadId?: string;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
}

export interface CopilotProposalResultItem extends CopilotResultBase {
  kind: "proposal";
  proposalId: string;
  risk: AiPatchProposal["risk"];
  scopeType: string;
  scopeId?: string;
  explanation: string[];
  targetLabels: string[];
  commandPlan: AiPatchProposal["commandPlan"];
  status: "draft" | "previewed" | "accepted" | "rejected";
}

export interface CopilotOutlineResultUnit {
  unitId: string;
  title: string;
  goal: string;
  unitType: AiGenerationOutlineUnit["unitType"];
  orderIndex: number;
  status: AiGenerationUnit["status"];
  artifactReady: boolean;
}

export interface CopilotOutlineResultItem extends CopilotResultBase {
  kind: "outline";
  jobId: string;
  flowType: string;
  audience: string;
  status: AiGenerationJob["status"];
  notes: string[];
  units: CopilotOutlineResultUnit[];
  appliedNodeIds: string[];
  appliedUnitNodeIds: Record<string, string>;
  generatedUnitIds: string[];
}

export interface CopilotArtifactResultItem extends CopilotResultBase {
  kind: "artifact";
  jobId: string;
  unitId: string;
  artifactId: string;
  artifactKind: AiGeneratedArtifact["artifactKind"];
  node: VNode;
  notes: string[];
  status: "ready" | "applied";
  appliedNodeId?: string;
}

export interface CopilotAnalysisResultTable {
  name: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

export interface CopilotAnalysisMeta {
  analysisMode?: string;
  executionStatus?: string;
  executedSteps: string[];
  resultTables: CopilotAnalysisResultTable[];
  inputRows?: number;
  outputRows?: number;
}

export interface CopilotInsightResultItem extends CopilotResultBase {
  kind: "insight";
  sourceType: "chart_ask" | "story_summary" | "analysis";
  scopeType: "chart" | "doc" | "node";
  scopeId?: string;
  headline: string;
  conclusion: string;
  evidence: string[];
  advice: string[];
  prompt: string;
  analysisMeta?: CopilotAnalysisMeta;
}

export type CopilotResultItem =
  | CopilotProposalResultItem
  | CopilotOutlineResultItem
  | CopilotArtifactResultItem
  | CopilotInsightResultItem;

const toDocType = (docType: string | undefined): Exclude<DocType, "chart"> | undefined => {
  if (docType === "dashboard" || docType === "report" || docType === "ppt") {
    return docType;
  }
  return undefined;
};

const nowIso = (): string => new Date().toISOString();
const asObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const toTargetLabels = (route: AiConversationRoute): string[] =>
  route.resolvedObjects
    .map((item) => item.title.trim())
    .filter(Boolean)
    .slice(0, 3);

const mapOutlineUnit = (jobUnit: AiGenerationUnit | undefined, outlineUnit: AiGenerationOutlineUnit): CopilotOutlineResultUnit => ({
  unitId: jobUnit?.unitId ?? prefixedId("outline"),
  title: outlineUnit.title,
  goal: outlineUnit.goal,
  unitType: outlineUnit.unitType,
  orderIndex: outlineUnit.orderIndex,
  status: jobUnit?.status ?? "queued",
  artifactReady: Boolean(jobUnit?.artifact)
});

const collectGeneratedUnitIds = (job: AiGenerationJob): string[] =>
  job.units.filter((item) => item.artifact).map((item) => item.unitId);

export const buildProposalResultItem = (
  sceneId: string,
  proposal: AiPatchProposal,
  route: AiConversationRoute,
  meta: ResultBuildMeta = {}
): CopilotProposalResultItem => {
  const targetLabels = toTargetLabels(route);
  return {
    resultId: proposal.proposalId,
    sceneId,
    threadId: meta.threadId ?? proposal.threadId,
    docId: proposal.docId,
    docType: toDocType(proposal.docType),
    originSceneKind: meta.originSceneKind,
    originRouteMode: meta.originRouteMode,
    originLabel: meta.originLabel,
    kind: "proposal",
    title: targetLabels[0] ? `修改建议 · ${targetLabels[0]}` : "修改建议",
    summary: proposal.summary,
    createdAt: proposal.createdAt,
    updatedAt: proposal.createdAt,
    proposalId: proposal.proposalId,
    risk: proposal.risk,
    scopeType: proposal.scopeType,
    scopeId: proposal.scopeId,
    explanation: proposal.explanation,
    targetLabels,
    commandPlan: proposal.commandPlan,
    status: proposal.accepted ? "accepted" : proposal.rejected ? "rejected" : "draft"
  };
};

const inferProposalRisk = (commandPlan: AiPatchProposal["commandPlan"]): AiPatchProposal["risk"] => {
  const commands = Array.isArray(commandPlan.commands) ? commandPlan.commands : [];
  if (commands.some((command) => {
    const type = asObject(command).type;
    return type === "RemoveNode" || type === "MoveNode" || type === "ApplyTemplate" || type === "Transaction";
  })) {
    return "high";
  }
  if (commands.length > 4 || commands.some((command) => asObject(command).type === "UpdateDoc")) {
    return "medium";
  }
  return "low";
};

export const buildRuntimeProposalResultItem = ({
  sceneId,
  threadId,
  docId,
  docType,
  nodeId,
  title,
  prompt,
  response,
  originSceneKind,
  originRouteMode,
  originLabel
}: {
  sceneId: string;
  threadId?: string;
  docId: string;
  docType: string;
  nodeId: string;
  title: string;
  prompt: string;
  response: AiChartAskResponse;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
}): CopilotProposalResultItem | null => {
  if (!response.plan) {
    return null;
  }
  const proposalId = `proposal:runtime:${nodeId}:${prefixedId("proposal", 6)}`;
  return {
    resultId: proposalId,
    sceneId,
    threadId,
    docId,
    docType: toDocType(docType),
    originSceneKind,
    originRouteMode,
    originLabel,
    kind: "proposal",
    title: title ? `修改建议 · ${title}` : "修改建议",
    summary: response.plan.preview?.summary ?? response.planSummary ?? `来自运行态图表问答的修改建议`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    proposalId,
    risk: inferProposalRisk(response.plan),
    scopeType: "chart",
    scopeId: nodeId,
    explanation: [`来源于运行态图表问答：${prompt}`, ...(response.planSummary ? [response.planSummary] : [])],
    targetLabels: title ? [title] : [],
    commandPlan: response.plan,
    status: "draft"
  };
};

export const withProposalResultStatus = (
  result: CopilotProposalResultItem,
  status: CopilotProposalResultItem["status"]
): CopilotProposalResultItem => ({
  ...result,
  status,
  updatedAt: nowIso()
});

export const buildOutlineResultItem = (sceneId: string, job: AiGenerationJob, meta: ResultBuildMeta = {}): CopilotOutlineResultItem => ({
  resultId: job.jobId,
  sceneId,
  threadId: meta.threadId ?? job.threadId,
  docId: job.docId,
  docType: toDocType(job.docType),
  originSceneKind: meta.originSceneKind,
  originRouteMode: meta.originRouteMode,
  originLabel: meta.originLabel,
  kind: "outline",
  title: job.outline.title || "生成大纲",
  summary: `${job.outline.units.length} 个单元 · ${job.goal}`,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  jobId: job.jobId,
  flowType: job.flowType,
  audience: job.outline.audience,
  status: job.status,
  notes: job.outline.notes,
  units: job.outline.units.map((unit, index) => mapOutlineUnit(job.units[index], unit)),
  appliedNodeIds: [],
  appliedUnitNodeIds: {},
  generatedUnitIds: collectGeneratedUnitIds(job)
});

export const rebaseOutlineResultItem = (
  sceneId: string,
  job: AiGenerationJob,
  existing?: CopilotOutlineResultItem | null
): CopilotOutlineResultItem => {
  const next = buildOutlineResultItem(sceneId, job);
  if (!existing) {
    return next;
  }
  return {
    ...next,
    originSceneKind: existing.originSceneKind,
    originRouteMode: existing.originRouteMode,
    originLabel: existing.originLabel,
    appliedNodeIds: [...existing.appliedNodeIds],
    appliedUnitNodeIds: { ...existing.appliedUnitNodeIds }
  };
};

export const withOutlineAppliedNodes = (
  result: CopilotOutlineResultItem,
  nextAppliedUnitNodeIds: Record<string, string>
): CopilotOutlineResultItem => {
  const appliedUnitNodeIds = {
    ...result.appliedUnitNodeIds,
    ...nextAppliedUnitNodeIds
  };
  return {
    ...result,
    appliedUnitNodeIds,
    appliedNodeIds: [...new Set(Object.values(appliedUnitNodeIds))],
    updatedAt: nowIso()
  };
};

export const buildArtifactResultItem = (
  sceneId: string,
  job: AiGenerationJob,
  unit: AiGenerationUnit,
  meta: ResultBuildMeta = {}
): CopilotArtifactResultItem | null => {
  if (!unit.artifact) {
    return null;
  }
  return {
    resultId: `artifact:${job.jobId}:${unit.unitId}`,
    sceneId,
    threadId: meta.threadId ?? job.threadId,
    docId: job.docId,
    docType: toDocType(job.docType),
    originSceneKind: meta.originSceneKind,
    originRouteMode: meta.originRouteMode,
    originLabel: meta.originLabel,
    kind: "artifact",
    title: unit.artifact.title || unit.title,
    summary: unit.artifact.summary,
    createdAt: unit.artifact.createdAt,
    updatedAt: job.updatedAt,
    jobId: job.jobId,
    unitId: unit.unitId,
    artifactId: unit.artifact.artifactId,
    artifactKind: unit.artifact.artifactKind,
    node: unit.artifact.node,
    notes: unit.artifact.notes,
    status: "ready"
  };
};

export const buildChartInsightResultItem = ({
  sceneId,
  threadId,
  docId,
  docType,
  nodeId,
  title,
  prompt,
  response,
  originSceneKind,
  originRouteMode,
  originLabel
}: {
  sceneId: string;
  threadId?: string;
  docId: string;
  docType: string;
  nodeId: string;
  title: string;
  prompt: string;
  response: AiChartAskResponse;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
}): CopilotInsightResultItem => ({
  resultId: `insight:chart:${nodeId}:${prefixedId("ask", 6)}`,
  sceneId,
  threadId,
  docId,
  docType: toDocType(docType),
  originSceneKind,
  originRouteMode,
  originLabel,
  kind: "insight",
  title: title || "图表洞察",
  summary: response.answer,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  sourceType: "chart_ask",
  scopeType: "chart",
  scopeId: nodeId,
  headline: title || "图表洞察",
  conclusion: response.answer,
  evidence: response.suggestions.slice(0, 3),
  advice: response.planSummary ? [response.planSummary] : [],
  prompt
});

export const buildStoryInsightResultItem = ({
  sceneId,
  threadId,
  docId,
  docType,
  title,
  prompt,
  response,
  originSceneKind,
  originRouteMode,
  originLabel
}: {
  sceneId: string;
  threadId?: string;
  docId: string;
  docType: string;
  title: string;
  prompt: string;
  response: AiStorySummaryResponse;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
}): CopilotInsightResultItem => ({
  resultId: `insight:story:${prefixedId("story", 6)}`,
  sceneId,
  threadId,
  docId,
  docType: toDocType(docType),
  originSceneKind,
  originRouteMode,
  originLabel,
  kind: "insight",
  title: response.headline || title || "文档总结",
  summary: response.conclusion,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  sourceType: "story_summary",
  scopeType: "doc",
  headline: response.headline || title || "文档总结",
  conclusion: response.conclusion,
  evidence: response.evidence,
  advice: response.advice,
  prompt
});

export const buildScopedStoryInsightResultItem = ({
  sceneId,
  threadId,
  docId,
  docType,
  title,
  prompt,
  response,
  scopeType,
  scopeId,
  originSceneKind,
  originRouteMode,
  originLabel
}: {
  sceneId: string;
  threadId?: string;
  docId: string;
  docType: string;
  title: string;
  prompt: string;
  response: AiStorySummaryResponse;
  scopeType: "doc" | "node";
  scopeId?: string;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
}): CopilotInsightResultItem => ({
  ...buildStoryInsightResultItem({
    sceneId,
    threadId,
    docId,
    docType,
    title,
    prompt,
    response,
    originSceneKind,
    originRouteMode,
    originLabel
  }),
  resultId: `insight:story:${scopeType}:${scopeId ?? prefixedId("scope", 6)}:${prefixedId("story", 6)}`,
  scopeType,
  scopeId
});

const buildAnalysisMeta = (response: AiRuntimeAnalysisResponse): CopilotAnalysisMeta => {
  const plan = asObject(response.plan);
  const execution = asObject(response.execution);
  const stats = asObject(execution.stats);
  const provenance = asObject(execution.provenance);
  const resultTables = Array.isArray(execution.resultTables)
    ? execution.resultTables.map((item) => {
      const raw = asObject(item);
      const rows = Array.isArray(raw.rows)
        ? raw.rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
        : [];
      const inferredColumns = rows[0] ? Object.keys(rows[0]) : [];
      return {
        name: String(raw.name ?? "summary_table"),
        columns: Array.isArray(raw.columns) ? raw.columns.map((column) => String(column)) : inferredColumns,
        rows,
        rowCount: Number(raw.rowCount ?? rows.length)
      };
    })
    : [];
  const executedSteps = Array.isArray(provenance.executedSteps)
    ? provenance.executedSteps.map((item) => String(item))
    : Array.isArray(plan.steps)
      ? plan.steps.map((item) => String(asObject(item).id ?? "")).filter(Boolean)
      : [];
  return {
    analysisMode: plan.analysisMode ? String(plan.analysisMode) : undefined,
    executionStatus: execution.status ? String(execution.status) : undefined,
    executedSteps,
    resultTables,
    inputRows: stats.inputRows !== undefined ? Number(stats.inputRows) : undefined,
    outputRows: stats.outputRows !== undefined ? Number(stats.outputRows) : undefined
  };
};

export const buildAnalysisInsightResultItem = ({
  sceneId,
  threadId,
  docId,
  docType,
  scopeType,
  scopeId,
  title,
  prompt,
  response,
  originSceneKind,
  originRouteMode,
  originLabel
}: {
  sceneId: string;
  threadId?: string;
  docId: string;
  docType: string;
  scopeType: "chart" | "doc" | "node";
  scopeId?: string;
  title: string;
  prompt: string;
  response: AiRuntimeAnalysisResponse;
  originSceneKind?: string;
  originRouteMode?: "library" | "edit" | "view" | "present";
  originLabel?: string;
}): CopilotInsightResultItem => ({
  resultId: `insight:analysis:${scopeType}:${scopeId ?? prefixedId("scope", 6)}:${prefixedId("analysis", 6)}`,
  sceneId,
  threadId,
  docId,
  docType: toDocType(docType),
  originSceneKind,
  originRouteMode,
  originLabel,
  kind: "insight",
  title: response.headline || title || "深度分析",
  summary: response.conclusion,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  sourceType: "analysis",
  scopeType,
  scopeId,
  headline: response.headline || title || "深度分析",
  conclusion: response.conclusion,
  evidence: response.evidence,
  advice: response.advice,
  prompt,
  analysisMeta: buildAnalysisMeta(response)
});

const buildAnalysisSummaryText = (insight: CopilotInsightResultItem): string =>
  [
    insight.headline,
    "",
    insight.conclusion,
    "",
    insight.evidence.length > 0 ? `证据：\n${insight.evidence.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "",
    insight.advice.length > 0 ? `建议：\n${insight.advice.map((item, index) => `${index + 1}. ${item}`).join("\n")}` : "",
    insight.analysisMeta?.analysisMode ? `分析模式：${insight.analysisMeta.analysisMode}` : "",
    insight.analysisMeta?.executedSteps.length ? `执行步骤：${insight.analysisMeta.executedSteps.join(", ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");

const buildAnalysisTableNode = (
  insight: CopilotInsightResultItem,
  layout?: VNode["layout"]
): VNode | null => {
  const table = insight.analysisMeta?.resultTables[0];
  if (!table) {
    return null;
  }
  const columns = table.columns.map((column) => ({
    key: column,
    title: column
  }));
  return {
    id: prefixedId("table"),
    kind: "table",
    layout,
    props: {
      titleText: `${insight.headline} - 结果表`,
      repeatHeader: true,
      zebra: true,
      columns,
      rows: table.rows
    }
  };
};

export const buildArtifactFromInsight = (
  sceneId: string,
  insight: CopilotInsightResultItem
): CopilotArtifactResultItem => {
  const summaryText = buildAnalysisSummaryText(insight);
  if (insight.docType === "ppt") {
    const tableNode = buildAnalysisTableNode(insight, { mode: "absolute", x: 40, y: 180, w: 860, h: 220, z: 1 });
    return {
      resultId: `artifact:insight:${insight.resultId}`,
      sceneId,
      threadId: insight.threadId,
      docId: insight.docId,
      docType: insight.docType,
      originSceneKind: insight.originSceneKind,
      originRouteMode: insight.originRouteMode,
      originLabel: insight.originLabel,
      kind: "artifact",
      title: insight.headline,
      summary: "已从运行态洞察转成页面草稿",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      jobId: "runtime_insight",
      unitId: insight.resultId,
      artifactId: prefixedId("artifact"),
      artifactKind: "slide",
      node: {
        id: prefixedId("slide"),
        kind: "slide",
        props: { title: insight.headline, layoutTemplateId: "title-double-summary" },
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 },
        children: [
          {
            id: prefixedId("text"),
            kind: "text",
            layout: { mode: "absolute", x: 42, y: 34, w: 860, h: tableNode ? 120 : 360, z: 1 },
            props: { text: summaryText, format: "plain" }
          },
          ...(tableNode ? [tableNode] : [])
        ]
      },
      notes: [
        "该页面草稿来自运行态洞察，可进入编辑态继续整理。",
        ...(tableNode ? ["已附带第一张分析结果表。"] : [])
      ],
      status: "ready"
    };
  }
  if (insight.docType === "dashboard") {
    const tableNode = buildAnalysisTableNode(insight);
    return {
      resultId: `artifact:insight:${insight.resultId}`,
      sceneId,
      threadId: insight.threadId,
      docId: insight.docId,
      docType: insight.docType,
      originSceneKind: insight.originSceneKind,
      originRouteMode: insight.originRouteMode,
      originLabel: insight.originLabel,
      kind: "artifact",
      title: insight.headline,
      summary: "已从运行态洞察转成文本模块草稿",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      jobId: "runtime_insight",
      unitId: insight.resultId,
      artifactId: prefixedId("artifact"),
      artifactKind: "block_region",
      node: {
        id: prefixedId("container"),
        kind: "container",
        layout: { mode: "grid", gx: 0, gy: 0, gw: 12, gh: 4 },
        props: { title: insight.headline },
        children: [
          {
            id: prefixedId("text"),
            kind: "text",
            props: { text: summaryText, format: "plain" }
          },
          ...(tableNode ? [tableNode] : [])
        ]
      },
      notes: [
        "该文本模块草稿来自运行态洞察，可进入编辑态插入或调整。",
        ...(tableNode ? ["已附带第一张分析结果表。"] : [])
      ],
      status: "ready"
    };
  }
  const tableNode = buildAnalysisTableNode(insight);
  return {
    resultId: `artifact:insight:${insight.resultId}`,
    sceneId,
    threadId: insight.threadId,
    docId: insight.docId,
    docType: insight.docType,
    originSceneKind: insight.originSceneKind,
    originRouteMode: insight.originRouteMode,
    originLabel: insight.originLabel,
    kind: "artifact",
    title: insight.headline,
    summary: "已从运行态洞察转成章节草稿",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    jobId: "runtime_insight",
    unitId: insight.resultId,
    artifactId: prefixedId("artifact"),
    artifactKind: "section",
    node: {
      id: prefixedId("section"),
      kind: "section",
      props: { title: insight.headline },
      children: [
        {
          id: prefixedId("text"),
          kind: "text",
          props: { text: summaryText, format: "plain" }
        },
        ...(tableNode ? [tableNode] : [])
      ]
    },
    notes: [
      "该章节草稿来自运行态洞察，可进入编辑态插入或替换。",
      ...(tableNode ? ["已附带第一张分析结果表。"] : [])
    ],
    status: "ready"
  };
};

export const withArtifactAppliedNode = (
  result: CopilotArtifactResultItem,
  appliedNodeId: string
): CopilotArtifactResultItem => ({
  ...result,
  status: "applied",
  appliedNodeId,
  updatedAt: nowIso()
});

const stripLeadingOrderMarker = (title: string): string => title.replace(/^\s*\d+\s*[.、:-]\s*/, "").trim();

const buildSectionTitle = (title: string, orderIndex: number): string => {
  const cleanTitle = stripLeadingOrderMarker(title);
  return cleanTitle ? `${orderIndex}. ${cleanTitle}` : `章节 ${orderIndex}`;
};

const buildOutlinePlaceholderNode = (unit: CopilotOutlineResultUnit): VNode => ({
  id: prefixedId("text"),
  kind: "text",
  props: {
    text: `待生成内容：${unit.goal}`,
    format: "plain"
  }
});

export const buildReportOutlineInsertCommands = (
  result: CopilotOutlineResultItem,
  parentId: string,
  insertIndex: number,
  existingSectionCount: number
): { commands: Command[]; appliedUnitNodeIds: Record<string, string> } => {
  const sectionUnits = result.units.filter((unit) => unit.unitType === "section");
  const commands: Command[] = [];
  const appliedUnitNodeIds: Record<string, string> = {};

  sectionUnits.forEach((unit, index) => {
    const sectionId = prefixedId("section");
    appliedUnitNodeIds[unit.unitId] = sectionId;
    commands.push({
      type: "InsertNode",
      parentId,
      index: insertIndex + index,
      node: {
        id: sectionId,
        kind: "section",
        props: {
          title: buildSectionTitle(unit.title, existingSectionCount + index + 1)
        },
        children: [buildOutlinePlaceholderNode(unit)]
      }
    });
  });

  return { commands, appliedUnitNodeIds };
};

export const buildReportArtifactApplyCommands = (
  doc: VDoc,
  artifact: CopilotArtifactResultItem,
  outlineResult?: CopilotOutlineResultItem | null,
  explicitTargetNodeId?: string
): { commands: Command[]; appliedNodeId: string } => {
  const targetNodeId = explicitTargetNodeId ?? outlineResult?.appliedUnitNodeIds[artifact.unitId];
  if (targetNodeId) {
    const located = findNodeById(doc.root, targetNodeId);
    if (located?.parent?.id) {
      const nextNode = structuredClone(artifact.node);
      if (located.node.kind === "section" && nextNode.kind === "section") {
        const targetTitle = String((located.node.props as Record<string, unknown> | undefined)?.title ?? "").trim();
        if (targetTitle) {
          nextNode.props = {
            ...(nextNode.props ?? {}),
            title: targetTitle
          };
        }
      }
      return {
        commands: [
          {
            type: "RemoveNode",
            nodeId: targetNodeId
          },
          {
            type: "InsertNode",
            parentId: located.parent.id,
            index: located.index,
            node: nextNode
          }
        ],
        appliedNodeId: nextNode.id
      };
    }
  }

  return {
    commands: [
      {
        type: "InsertNode",
        parentId: doc.root.id,
        index: (doc.root.children ?? []).length,
        node: structuredClone(artifact.node)
      }
    ],
    appliedNodeId: artifact.node.id
  };
};

export const buildPptArtifactApplyCommands = (
  doc: VDoc,
  artifact: CopilotArtifactResultItem,
  explicitTargetNodeId?: string
): { commands: Command[]; appliedNodeId: string } => {
  if (explicitTargetNodeId) {
    const located = findNodeById(doc.root, explicitTargetNodeId);
    if (located?.parent?.id) {
      const nextNode = structuredClone(artifact.node);
      if (located.node.kind === "slide" && nextNode.kind === "slide") {
        const targetTitle = String((located.node.props as Record<string, unknown> | undefined)?.title ?? "").trim();
        if (targetTitle) {
          nextNode.props = {
            ...(nextNode.props ?? {}),
            title: targetTitle
          };
        }
      }
      return {
        commands: [
          {
            type: "RemoveNode",
            nodeId: explicitTargetNodeId
          },
          {
            type: "InsertNode",
            parentId: located.parent.id,
            index: located.index,
            node: nextNode
          }
        ],
        appliedNodeId: nextNode.id
      };
    }
  }

  return {
    commands: [
      {
        type: "InsertNode",
        parentId: doc.root.id,
        index: (doc.root.children ?? []).length,
        node: structuredClone(artifact.node)
      }
    ],
    appliedNodeId: artifact.node.id
  };
};

export const buildDashboardArtifactApplyCommands = (
  doc: VDoc,
  artifact: CopilotArtifactResultItem,
  anchorNodeId?: string
): { commands: Command[]; appliedNodeId: string } => {
  let index = (doc.root.children ?? []).length;
  if (anchorNodeId) {
    const located = findNodeById(doc.root, anchorNodeId);
    if (located?.parent?.id === doc.root.id && typeof located.index === "number") {
      index = located.index + 1;
    }
  }
  return {
    commands: [
      {
        type: "InsertNode",
        parentId: doc.root.id,
        index,
        node: structuredClone(artifact.node)
      }
    ],
    appliedNodeId: artifact.node.id
  };
};
