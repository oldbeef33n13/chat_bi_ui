import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartType, Command, VDoc, VNode } from "../../core/doc/types";
import { applyPatches } from "../../core/doc/patch";
import { executeCommands } from "../../core/kernel/command-executor";
import { prefixedId } from "../../core/utils/id";
import { EChartView } from "../../runtime/chart/EChartView";
import type { AiPatchProposal } from "../api/ai-orchestration";
import type {
  CopilotArtifactResultItem,
  CopilotOutlineResultItem,
  CopilotProposalResultItem,
  CopilotResultItem
} from "../copilot/copilot-results";
import { appendCopilotChatMessages, trimCopilotChatMessages } from "../copilot/chat-history";
import {
  buildDashboardArtifactApplyCommands,
  buildOutlineResultItem,
  buildProposalResultItem,
  buildReportOutlineInsertCommands,
  withArtifactAppliedNode,
  withOutlineAppliedNodes,
  withProposalResultStatus
} from "../copilot/copilot-results";
import { encodeCopilotArtifact } from "../copilot/copilot-artifact-dnd";
import { useMaybeCopilot } from "../copilot/copilot-context";
import { useDataEngine } from "../hooks/use-data-engine";
import { useNodeRows } from "../hooks/use-node-rows";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import type { Persona } from "../types/persona";
import { createAiTimer, createAiTraceId, emitAiTelemetry, emitAiTelemetryError } from "../telemetry/ai-telemetry";
import { buildCopilotBoundarySummary, guardCopilotEditRequest, guardCopilotGenerationRequest } from "../utils/ai-capability-boundary";
import {
  aiOrchestrationRepo,
  buildEditProposalRequest,
  buildTemplateVariables,
  formatClarification,
  getAiThreadId
} from "../utils/ai-edit-orchestration";
import { buildChartNode, extractSourceFields, requestAiChartRecommend } from "../utils/chart-recommend";
import { findAncestorByKind, findNodeById } from "../utils/node-tree";

type ChatRole = "assistant" | "user";
type ChatTone = "neutral" | "error";
type ChatCardStatus = "ready" | "applied" | "dismissed";

type ChatCard =
  | {
      kind: "proposal-preview";
      proposal: CopilotProposalResultItem;
      previewDataDoc: PreviewDataDoc;
      previewNode: VNode;
      status: ChatCardStatus;
      confirmHint?: string;
      confirmLabel?: string;
      appliedMessage?: string;
    }
  | {
      kind: "artifact-preview";
      artifact: CopilotArtifactResultItem;
      previewDataDoc: PreviewDataDoc;
      previewNode?: VNode;
      status: ChatCardStatus;
      draggable: boolean;
      helperText?: string;
      primaryLabel?: string;
    }
  | {
      kind: "outline-preview";
      outline: CopilotOutlineResultItem;
      status: ChatCardStatus;
      confirmHint?: string;
      confirmLabel?: string;
    };

interface ChatMessage {
  id: string;
  role: ChatRole;
  tone: ChatTone;
  text: string;
  bullets?: string[];
  card?: ChatCard;
}

interface QuickAction {
  id: string;
  label: string;
  prompt: string;
}

type PreviewDataDoc = Pick<VDoc, "docId" | "docType" | "dataSources" | "queries" | "filters" | "templateVariables">;

interface ChartPreviewData {
  previewDataDoc: PreviewDataDoc;
  previewNode: VNode;
}

interface OutlinePreviewMeta {
  canApply: boolean;
  primaryLabel?: string;
  helperText?: string;
}

const createMessage = (
  role: ChatRole,
  text: string,
  options: { tone?: ChatTone; bullets?: string[]; card?: ChatCard } = {}
): ChatMessage => ({
  id: `${role}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  role,
  tone: options.tone ?? "neutral",
  text,
  bullets: options.bullets,
  card: options.card
});

type DocTypeLike = VDoc["docType"] | undefined;

interface SelectedNodeSummary {
  id?: string;
  kind?: VNode["kind"];
}

interface DocMetaSummary {
  docId?: string;
  docType?: DocTypeLike;
}

const sameDocMetaSummary = (left: DocMetaSummary, right: DocMetaSummary): boolean =>
  left.docId === right.docId && left.docType === right.docType;

const sameSelectedNodeSummary = (left: SelectedNodeSummary, right: SelectedNodeSummary): boolean =>
  left.id === right.id && left.kind === right.kind;

const readDocMetaSummary = (doc?: VDoc | null): DocMetaSummary => ({
  docId: doc?.docId,
  docType: doc?.docType
});

const buildPreviewDataDoc = (doc: VDoc): PreviewDataDoc => ({
  docId: doc.docId,
  docType: doc.docType,
  dataSources: doc.dataSources ?? [],
  queries: doc.queries ?? [],
  filters: doc.filters ?? [],
  templateVariables: doc.templateVariables ?? []
});

const readSelectedNodeSummary = (doc: VDoc | null | undefined, nodeId?: string): SelectedNodeSummary => {
  if (!doc || !nodeId) {
    return {};
  }
  const node = findNodeById(doc.root, nodeId);
  return node ? { id: node.id, kind: node.kind } : {};
};

const defaultInputByDocType = (docType?: DocTypeLike): string => {
  if (docType === "report") {
    return "帮我重写当前章节标题";
  }
  if (docType === "ppt") {
    return "帮我优化当前页标题";
  }
  return "帮我把当前图表改成柱状图";
};

const buildQuickActions = (docType?: DocTypeLike, selectedNode?: SelectedNodeSummary): QuickAction[] => {
  if (selectedNode?.kind === "chart") {
    return [
      { id: "chart-title", label: "改标题", prompt: "帮我修改 title" },
      { id: "chart-bar", label: "改柱状图", prompt: "帮我改为柱状图" },
      { id: "chart-query", label: "查数据出图", prompt: "帮我查询当前数据，生成一个占比图" }
    ];
  }
  if (docType === "report") {
    return [
      { id: "report-title", label: "改当前章节", prompt: "帮我重写当前章节标题和总结" },
      { id: "report-query", label: "补一张图", prompt: "帮我查询当前数据，生成一个柱状图" },
      { id: "report-outline", label: "生成大纲", prompt: "生成一份面向管理层的经营分析周报大纲" }
    ];
  }
  if (docType === "ppt") {
    return [
      { id: "ppt-title", label: "改当前页", prompt: "帮我优化当前页标题和表达" },
      { id: "ppt-query", label: "补一页图", prompt: "帮我查询当前数据，生成一个趋势图" },
      { id: "ppt-outline", label: "生成页纲", prompt: "生成一份面向管理层的经营汇报 PPT 大纲" }
    ];
  }
  return [
    { id: "dashboard-edit", label: "改当前图", prompt: "帮我把当前图表改成柱状图" },
    { id: "dashboard-query", label: "查数据出图", prompt: "帮我查询当前数据，生成一个占比图" },
    { id: "dashboard-outline", label: "生成大纲", prompt: "生成一个经营分析 dashboard 大纲" }
  ];
};

const buildIntroMessage = (summary?: ReturnType<typeof buildCopilotBoundarySummary>): ChatMessage =>
  createMessage("assistant", "直接说你的目标就行。我会先给你一个可以直接点或拖的结果。", {
    bullets: summary ? [`当前更擅长：${summary.supported.slice(0, 2).join("、")}`, `暂不负责：${summary.unsupported.slice(0, 2).join("、")}`] : undefined
  });

const isGenerationPrompt = (prompt: string): boolean => /生成.*(大纲|页纲|周报|ppt|dashboard|报告)/i.test(prompt.trim());

const isDataQueryPrompt = (prompt: string): boolean => /(查询|查看|查一下|查一查|帮我查|帮我查询).*(数据|图|趋势|分布|占比)?/i.test(prompt);

const inferRequestedChartType = (prompt: string): ChartType => {
  if (/占比|比例|构成|饼图/i.test(prompt)) {
    return "pie";
  }
  if (/柱状图|柱图|条形图|对比/i.test(prompt)) {
    return "bar";
  }
  if (/双轴|第二轴/i.test(prompt)) {
    return "combo";
  }
  if (/散点/i.test(prompt)) {
    return "scatter";
  }
  return "line";
};

const resolveNodeTitle = (node?: VNode): string => {
  if (!node) {
    return "当前对象";
  }
  const props = (node.props ?? {}) as Record<string, unknown>;
  if (typeof props.titleText === "string" && props.titleText.trim()) {
    return props.titleText.trim();
  }
  if (typeof props.title === "string" && props.title.trim()) {
    return props.title.trim();
  }
  if (typeof node.name === "string" && node.name.trim()) {
    return node.name.trim();
  }
  return node.kind === "chart" ? "图表" : "当前对象";
};

const buildChartTitleFromPrompt = (prompt: string, chartType: ChartType): string => {
  const cleanPrompt = prompt
    .replace(/帮我|请|查询|查看|查一下|查一查|生成|做一个|做一张|图表|数据/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleanPrompt) {
    return cleanPrompt;
  }
  if (chartType === "pie") {
    return "数据占比";
  }
  if (chartType === "bar") {
    return "数据对比";
  }
  return "数据趋势";
};

const buildChartPreviewSnapshot = (
  doc: VDoc,
  selectedIds: string[],
  commands: Command[],
  targetNodeId: string | undefined
): ChartPreviewData | null => {
  if (!targetNodeId) {
    return null;
  }
  const currentNode = findNodeById(doc.root, targetNodeId);
  if (currentNode?.kind !== "chart") {
    return null;
  }
  try {
    const result = executeCommands(doc, commands, { selectedIds });
    const previewDoc = applyPatches(doc, result.patches);
    const previewNode = findNodeById(previewDoc.root, targetNodeId);
    if (previewNode?.kind !== "chart") {
      return null;
    }
    return {
      previewDataDoc: buildPreviewDataDoc(previewDoc),
      previewNode
    };
  } catch {
    return null;
  }
};

const buildChartPreviewData = (
  doc: VDoc,
  selectedIds: string[],
  proposal: AiPatchProposal,
  targetNodeId: string | undefined
): ChartPreviewData | null => buildChartPreviewSnapshot(doc, selectedIds, proposal.commandPlan.commands, targetNodeId);

const buildProposalResultPreviewData = (
  doc: VDoc,
  selectedIds: string[],
  proposal: CopilotProposalResultItem
): ChartPreviewData | null => {
  return buildChartPreviewSnapshot(doc, selectedIds, proposal.commandPlan.commands, proposal.scopeId);
};

const buildGeneratedArtifact = ({
  doc,
  title,
  chartType,
  sourceId,
  parent
}: {
  doc: VDoc;
  title: string;
  chartType: ChartType;
  sourceId?: string;
  parent: VNode;
}): Promise<CopilotArtifactResultItem> =>
  requestAiChartRecommend({
    requestedType: chartType,
    fields: extractSourceFields(doc.dataSources?.find((item) => item.id === sourceId) ?? doc.dataSources?.[0]),
    context: {
      docType: doc.docType,
      nodeId: parent.id,
      sourceId,
      trigger: "create-wizard"
    }
  }).then((recommend) => ({
    resultId: `artifact:chat:${prefixedId("artifact", 6)}`,
    sceneId: `doc:${doc.docId}`,
    threadId: getAiThreadId(doc.docId),
    docId: doc.docId,
    docType: doc.docType === "dashboard" || doc.docType === "report" || doc.docType === "ppt" ? doc.docType : "dashboard",
    kind: "artifact",
    title,
    summary: `已基于当前数据生成一张${recommend.chartType === "pie" ? "占比" : recommend.chartType === "bar" ? "柱状" : "趋势"}候选图`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    jobId: "chat_query",
    unitId: prefixedId("unit", 6),
    artifactId: prefixedId("artifact", 6),
    artifactKind: "block_region",
    node: buildChartNode({
      doc,
      parent,
      chartType: recommend.chartType,
      sourceId,
      title,
      forcedRecommend: recommend
    }),
    notes: recommend.reasons,
    status: "ready"
  }));

const buildChartInsertCommands = (
  doc: VDoc,
  artifact: CopilotArtifactResultItem,
  selectedNodeId?: string
): { commands: Command[]; appliedNodeId: string } | null => {
  if (doc.docType === "dashboard") {
    return buildDashboardArtifactApplyCommands(doc, artifact, selectedNodeId);
  }
  if (doc.docType === "report") {
    const targetSection = findAncestorByKind(doc.root, selectedNodeId, "section") ?? doc.root.children?.find((item) => item.kind === "section");
    if (!targetSection) {
      return null;
    }
    return {
      commands: [
        {
          type: "InsertNode",
          parentId: targetSection.id,
          index: (targetSection.children ?? []).length,
          node: structuredClone(artifact.node)
        }
      ],
      appliedNodeId: artifact.node.id
    };
  }
  const targetSlide = findAncestorByKind(doc.root, selectedNodeId, "slide") ?? doc.root.children?.find((item) => item.kind === "slide");
  if (!targetSlide) {
    return null;
  }
  return {
    commands: [
      {
        type: "InsertNode",
        parentId: targetSlide.id,
        index: (targetSlide.children ?? []).length,
        node: structuredClone(artifact.node)
      }
    ],
    appliedNodeId: artifact.node.id
  };
};

function ChartNodePreview({ doc, node }: { doc: PreviewDataDoc; node: VNode }): JSX.Element {
  const { engine, dataVersion } = useDataEngine(doc.dataSources, doc.queries);
  const { rows, loading } = useNodeRows(doc, node, engine, dataVersion);
  return (
    <div className="copilot-chart-preview">
      {loading ? <span className="muted">正在准备图表预览...</span> : <EChartView spec={node.props as never} rows={rows} height={190} />}
    </div>
  );
}

function ProposalPreviewCard({
  previewDataDoc,
  previewNode,
  proposal,
  status,
  confirmHint,
  confirmLabel,
  onApply,
  onDismiss
}: {
  previewDataDoc: PreviewDataDoc;
  previewNode: VNode;
  proposal: CopilotProposalResultItem;
  status: ChatCardStatus;
  confirmHint?: string;
  confirmLabel?: string;
  onApply: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div className="copilot-inline-card">
      <div className="copilot-inline-card-header">
        <strong>{proposal.summary}</strong>
        <span className="chip">{status === "applied" ? "已更新" : "预览中"}</span>
      </div>
      {previewNode?.kind === "chart" ? <ChartNodePreview doc={previewDataDoc} node={previewNode} /> : <span className="muted">当前先展示图表类修改预览。</span>}
      <span className="muted">{confirmHint ?? "确认后会直接更新左侧当前对象。"}</span>
      {proposal.explanation.length > 0 ? <span className="muted">{proposal.explanation[0]}</span> : null}
      <div className="copilot-inline-card-actions">
        <button className="btn primary" disabled={status === "applied"} onClick={onApply}>
          {status === "applied" ? "已更新" : confirmLabel ?? "确认更新"}
        </button>
        {status === "applied" ? null : (
          <button className="btn" onClick={onDismiss}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}

const buildOutlinePreviewMeta = (doc?: VDoc | null, outline?: CopilotOutlineResultItem): OutlinePreviewMeta => {
  if (!doc || !outline) {
    return { canApply: false };
  }
  if (doc.docType === "report") {
    return {
      canApply: true,
      primaryLabel: outline.appliedNodeIds.length > 0 ? "再次插入章节骨架" : "插入章节骨架"
    };
  }
  return {
    canApply: false,
    helperText: "这版大纲我先替你记住了。逐项生成我还在成长中，后续会继续补齐。"
  };
};

function ArtifactPreviewCard({
  artifact,
  previewDataDoc,
  previewNode,
  status,
  draggable,
  helperText,
  primaryLabel,
  onApply,
  onDismiss
}: {
  artifact: CopilotArtifactResultItem;
  previewDataDoc: PreviewDataDoc;
  previewNode?: VNode;
  status: ChatCardStatus;
  draggable: boolean;
  helperText?: string;
  primaryLabel?: string;
  onApply: () => void;
  onDismiss: () => void;
}): JSX.Element {
  return (
    <div
      className={`copilot-inline-card ${draggable ? "is-draggable" : ""}`}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) {
          return;
        }
        encodeCopilotArtifact(event.dataTransfer, artifact);
      }}
    >
      <div className="copilot-inline-card-header">
        <strong>{artifact.title}</strong>
        <span className="chip">{status === "applied" ? "已插入" : "候选图"}</span>
      </div>
      {previewNode ? <ChartNodePreview doc={previewDataDoc} node={previewNode} /> : null}
      <span className="muted">{artifact.summary}</span>
      <span className="muted">确认后会插入左侧主场景，不会覆盖现有内容。</span>
      {artifact.notes.slice(0, 2).map((note) => (
        <span key={note} className="muted">{note}</span>
      ))}
      {helperText ? <span className="muted">{helperText}</span> : null}
      <div className="copilot-inline-card-actions">
        <button className="btn primary" disabled={status === "applied"} onClick={onApply}>
          {status === "applied" ? "已插入" : primaryLabel ?? "插入到当前位置"}
        </button>
        {status === "applied" ? null : (
          <button className="btn" onClick={onDismiss}>
            取消
          </button>
        )}
      </div>
    </div>
  );
}

function OutlinePreviewCard({
  outline,
  status,
  confirmHint,
  confirmLabel,
  onApply
}: {
  outline: CopilotOutlineResultItem;
  status: ChatCardStatus;
  confirmHint?: string;
  confirmLabel?: string;
  onApply?: () => void;
}): JSX.Element {
  return (
    <div className="copilot-inline-card">
      <div className="copilot-inline-card-header">
        <strong>{outline.title}</strong>
        <span className="chip">{status === "applied" ? "已处理" : "大纲已生成"}</span>
      </div>
      <span className="muted">{outline.summary}</span>
      <div className="copilot-inline-card-list">
        {outline.units.slice(0, 4).map((unit) => (
          <div key={unit.unitId} className="copilot-shelf-unit-item">
            <strong>{`${unit.orderIndex}. ${unit.title}`}</strong>
            <span className="muted">{unit.goal}</span>
          </div>
        ))}
      </div>
      {confirmHint ? <span className="muted">{confirmHint}</span> : null}
      {outline.notes.slice(0, 1).map((note) => (
        <span key={note} className="muted">{note}</span>
      ))}
      {onApply ? (
        <div className="copilot-inline-card-actions">
          <button className="btn primary" disabled={status === "applied"} onClick={onApply}>
            {status === "applied" ? "已插入章节骨架" : confirmLabel ?? "确认插入章节骨架"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ChatBridgePanel({ persona = "analyst" }: { persona?: Persona }): JSX.Element {
  const store = useEditorStore();
  const copilot = useMaybeCopilot();
  const selection = useSignalValue(store.selection);
  const docRef = useRef(store.doc.value);
  const selectionRef = useRef(store.selection.value);
  const [docMeta, setDocMeta] = useState<DocMetaSummary>(() => readDocMetaSummary(docRef.current));
  const [selectedNodeSummary, setSelectedNodeSummary] = useState<SelectedNodeSummary>(() => readSelectedNodeSummary(docRef.current, selection.primaryId));
  const [input, setInput] = useState(() => defaultInputByDocType(docRef.current?.docType));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const presentedFocusedResultIdsRef = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement | null>(null);

  const resultSceneId = copilot?.scene.sceneId ?? `doc:${docMeta.docId ?? "unknown"}`;
  const threadId = docMeta.docId ? getAiThreadId(docMeta.docId) : undefined;
  const focusedScopedResult = useMemo(() => {
    if (!copilot?.focusedResultId || !docMeta.docId) {
      return undefined;
    }
    return copilot.results.find(
      (item) =>
        item.resultId === copilot.focusedResultId &&
        (item.sceneId === resultSceneId ||
          (item.docId === docMeta.docId && (!threadId || !item.threadId || item.threadId === threadId)))
    );
  }, [copilot?.focusedResultId, copilot?.results, docMeta.docId, resultSceneId, threadId]);
  const capabilitySummary = useMemo(
    () => buildCopilotBoundarySummary(copilot?.scene ?? { docType: docMeta.docType, routeMode: "edit" }),
    [copilot?.scene, docMeta.docType]
  );
  const quickActions = useMemo(() => buildQuickActions(docMeta.docType, selectedNodeSummary), [docMeta.docType, selectedNodeSummary]);
  const telemetryContext = {
    docId: docMeta.docId,
    docType: docMeta.docType,
    nodeId: selection.primaryId
  };

  useEffect(() => {
    setInput(defaultInputByDocType(docMeta.docType));
    setMessages(trimCopilotChatMessages([buildIntroMessage(capabilitySummary)]));
    presentedFocusedResultIdsRef.current.clear();
  }, [capabilitySummary, docMeta.docId, docMeta.docType]);

  useEffect(() => {
    selectionRef.current = selection;
    const nextSummary = readSelectedNodeSummary(docRef.current, selection.primaryId);
    setSelectedNodeSummary((current) => (sameSelectedNodeSummary(current, nextSummary) ? current : nextSummary));
  }, [selection]);

  useEffect(() => {
    const unsubscribe = store.doc.subscribe(() => {
      const nextDoc = store.doc.value;
      docRef.current = nextDoc;
      const nextMeta = readDocMetaSummary(nextDoc);
      setDocMeta((current) => (sameDocMetaSummary(current, nextMeta) ? current : nextMeta));
      const nextSelectedNode = readSelectedNodeSummary(nextDoc, selectionRef.current.primaryId);
      setSelectedNodeSummary((current) => (sameSelectedNodeSummary(current, nextSelectedNode) ? current : nextSelectedNode));
    });
    return unsubscribe;
  }, [store.doc]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [isSubmitting, messages]);

  const appendMessage = (message: ChatMessage): void => {
    setMessages((current) => appendCopilotChatMessages(current, message));
  };

  const updateMessageCard = (messageId: string, updater: (card: ChatCard) => ChatCard): void => {
    setMessages((current) =>
      current.map((item) => {
        if (item.id !== messageId || !item.card) {
          return item;
        }
        return { ...item, card: updater(item.card) };
      })
    );
  };

  const removeCardMessage = (messageId: string): void => {
    setMessages((current) => current.filter((item) => item.id !== messageId));
  };

  const hydrateFocusedResultMessage = (result: CopilotResultItem): void => {
    const doc = docRef.current;
    if (!doc) {
      return;
    }
    if (result.kind === "proposal") {
      const preview = buildProposalResultPreviewData(doc, selection.selectedIds, result);
      if (!preview) {
        appendMessage(createMessage("assistant", `我把刚才的修改建议带过来了：${result.summary}`));
        return;
      }
      appendMessage(
        createMessage("assistant", "我把刚才的修改建议带过来了。确认后就会直接更新左侧内容。", {
          bullets: result.explanation.slice(0, 2),
          card: {
            kind: "proposal-preview",
            proposal: result,
            previewDataDoc: preview.previewDataDoc,
            previewNode: preview.previewNode,
            status: result.status === "accepted" ? "applied" : "ready"
          }
        })
      );
      return;
    }
    if (result.kind === "artifact") {
      appendMessage(
        createMessage("assistant", "我把刚才的草稿带过来了。你可以直接插入到左侧内容里。", {
          bullets: result.notes.slice(0, 2),
          card: {
            kind: "artifact-preview",
            artifact: result,
            previewDataDoc: buildPreviewDataDoc(doc),
            previewNode: result.node.kind === "chart" ? result.node : undefined,
            status: result.status === "applied" ? "applied" : "ready",
            draggable: doc.docType === "dashboard" && Boolean(copilot?.scene.supportsDropArtifacts),
            helperText: doc.docType === "dashboard" ? "也可以直接拖到左侧画布的目标位置。" : undefined
          }
        })
      );
      return;
    }
    if (result.kind === "outline") {
      const previewMeta = buildOutlinePreviewMeta(doc, result);
      appendMessage(
        createMessage("assistant", `我把刚才的大纲带过来了：${result.title}`, {
          bullets: previewMeta.helperText ? [previewMeta.helperText] : undefined,
          card: {
            kind: "outline-preview",
            outline: result,
            status: result.appliedNodeIds.length > 0 ? "applied" : "ready",
            confirmHint: result.docType === "report" ? "确认后会把这版章节骨架插入左侧文档。" : undefined,
            confirmLabel: result.docType === "report" ? "确认插入章节骨架" : undefined
          }
        })
      );
    }
  };

  useEffect(() => {
    if (!docRef.current || !focusedScopedResult) {
      return;
    }
    if (presentedFocusedResultIdsRef.current.has(focusedScopedResult.resultId)) {
      return;
    }
    presentedFocusedResultIdsRef.current.add(focusedScopedResult.resultId);
    hydrateFocusedResultMessage(focusedScopedResult);
  }, [focusedScopedResult, selection.selectedIds]);

  const applyProposal = (messageId: string, proposal: CopilotProposalResultItem, appliedMessage?: string): void => {
    const doc = docRef.current;
    if (!store.previewPlan(proposal.commandPlan)) {
      appendMessage(createMessage("assistant", store.lastError.value ?? "当前修改预览失败，请稍后再试。", { tone: "error" }));
      return;
    }
    if (!store.acceptPreview("ai")) {
      appendMessage(createMessage("assistant", store.lastError.value ?? "当前修改应用失败，请稍后再试。", { tone: "error" }));
      return;
    }
    copilot?.upsertResult(withProposalResultStatus(proposal, "accepted"));
    if (proposal.scopeId) {
      store.setSelection(proposal.scopeId);
      copilot?.spotlightNode(doc?.docId, proposal.scopeId);
    }
    updateMessageCard(messageId, (card) => ({ ...card, status: "applied" }));
    appendMessage(createMessage("assistant", appliedMessage ?? `已更新左侧主图：${proposal.summary}`));
  };

  const insertArtifact = (messageId: string, artifact: CopilotArtifactResultItem): void => {
    const doc = docRef.current;
    if (!doc) {
      return;
    }
    const next = buildChartInsertCommands(doc, artifact, selection.primaryId);
    if (!next) {
      appendMessage(
        createMessage("assistant", "我还在成长中，当前场景下还不能自动决定落位。请先选中一个章节、页面或目标区域。", {
          tone: "error"
        })
      );
      return;
    }
    const applied = store.executeCommands(next.commands, {
      actor: "ai",
      summary: `插入 AI 候选图：${artifact.title}`
    });
    if (!applied) {
      appendMessage(createMessage("assistant", store.lastError.value ?? "当前候选图插入失败，请稍后再试。", { tone: "error" }));
      return;
    }
    store.setSelection(next.appliedNodeId);
    copilot?.spotlightNode(doc.docId, next.appliedNodeId);
    const appliedArtifact = withArtifactAppliedNode(artifact, next.appliedNodeId);
    copilot?.upsertResult(appliedArtifact);
    updateMessageCard(messageId, (card) => ({ ...card, artifact: appliedArtifact, status: "applied" }));
    appendMessage(createMessage("assistant", `已把候选图插入左侧主场景：${artifact.title}`));
  };

  const applyOutline = (messageId: string, outline: CopilotOutlineResultItem): void => {
    const doc = docRef.current;
    if (!doc || doc.docType !== "report") {
      appendMessage(createMessage("assistant", "我还在成长中，这类大纲当前先保留在对话里，后续会继续补齐逐项生成。", { tone: "error" }));
      return;
    }
    const rootChildren = doc.root.children ?? [];
    const existingSectionCount = rootChildren.filter((item) => item.kind === "section").length;
    const { commands, appliedUnitNodeIds } = buildReportOutlineInsertCommands(outline, doc.root.id, rootChildren.length, existingSectionCount);
    if (commands.length === 0) {
      appendMessage(createMessage("assistant", "这版大纲里还没有可插入的章节骨架。", { tone: "error" }));
      return;
    }
    const applied = store.executeCommand(
      { type: "Transaction", commands },
      {
        actor: "ai",
        summary: `插入 AI 大纲骨架：${outline.title}`
      }
    );
    if (!applied) {
      appendMessage(createMessage("assistant", store.lastError.value ?? "当前章节骨架插入失败，请稍后再试。", { tone: "error" }));
      return;
    }
    const nextOutline = withOutlineAppliedNodes(outline, appliedUnitNodeIds);
    const firstNodeId = Object.values(appliedUnitNodeIds)[0];
    if (firstNodeId) {
      store.setSelection(firstNodeId);
      copilot?.spotlightNode(doc.docId, firstNodeId);
    }
    copilot?.upsertResult(nextOutline);
    copilot?.focusResult(nextOutline.resultId);
    updateMessageCard(messageId, (card) => ({ ...card, outline: nextOutline, status: "applied" }));
    appendMessage(createMessage("assistant", `已把这版大纲插入左侧内容：${outline.title}`));
  };

  const submitEdit = async (nextPrompt: string): Promise<void> => {
    const doc = docRef.current;
    if (!doc) {
      return;
    }
    const boundary = guardCopilotEditRequest(copilot?.scene ?? { docType: doc.docType, routeMode: "edit" }, nextPrompt);
    if (!boundary.allowed) {
      appendMessage(
        createMessage("assistant", boundary.message ?? "我还在成长中，当前请求暂不支持。", {
          tone: "error",
          bullets: boundary.recommendations
        })
      );
      return;
    }
    const traceId = createAiTraceId();
    const getLatency = createAiTimer();
    emitAiTelemetry({
      traceId,
      stage: "start",
      surface: "chat_bridge",
      action: "generate_plan",
      source: "ai",
      context: telemetryContext,
      meta: {
        promptLength: nextPrompt.length,
        selectedCount: selection.selectedIds.length
      }
    });
    try {
      const response = await aiOrchestrationRepo.proposeEdit(
        buildEditProposalRequest({
          doc,
          prompt: nextPrompt,
          selection,
          baseRevision: store.baseRevision
        })
      );
      if (response.unsupported) {
        appendMessage(createMessage("assistant", response.unsupported.message, { tone: "error", bullets: response.unsupported.recommendations }));
        return;
      }
      if (response.proposal) {
        const proposalResult = buildProposalResultItem(resultSceneId, response.proposal, response.route, {
          threadId,
          originSceneKind: copilot?.scene.sceneKind,
          originRouteMode: copilot?.scene.routeMode,
          originLabel: copilot?.scene.title
        });
        copilot?.upsertResult(proposalResult);
        const targetNodeId =
          response.proposal.scopeId ??
          response.route.resolvedObjects.find((item) => item.kind === "chart")?.objectId ??
          selection.primaryId;
        const preview = buildChartPreviewData(doc, selection.selectedIds, response.proposal, targetNodeId);
        if (preview) {
          const message = createMessage("assistant", response.ui?.message || `我先按当前图表做了一版修改预览。`, {
            bullets: response.ui?.bullets?.length ? response.ui.bullets : response.proposal.explanation.slice(0, 2),
            card: {
              kind: "proposal-preview",
              proposal: proposalResult,
              previewDataDoc: preview.previewDataDoc,
              previewNode: preview.previewNode,
              status: "ready",
              confirmHint: response.ui?.confirmHint,
              confirmLabel: response.ui?.confirmLabel,
              appliedMessage: response.ui?.appliedMessage
            }
          });
          setMessages((current) => appendCopilotChatMessages(current, message));
        } else {
          appendMessage(
            createMessage("assistant", response.ui?.message || `我准备了一条修改建议：${response.proposal.summary}`, {
              bullets: response.ui?.bullets?.length ? response.ui.bullets : response.proposal.explanation.slice(0, 2)
            })
          );
        }
        emitAiTelemetry({
          traceId,
          stage: "success",
          surface: "chat_bridge",
          action: "generate_plan",
          source: response.proposal.source === "provider" ? "ai" : "rule",
          latencyMs: getLatency(),
          context: telemetryContext,
          meta: {
            promptLength: nextPrompt.length,
            commandCount: response.proposal.commandPlan.commands.length,
            resolvedObjectCount: response.route.resolvedObjects.length,
            risk: response.proposal.risk,
            scopeType: response.proposal.scopeType,
            orchestration: true
          }
        });
        return;
      }
      appendMessage(createMessage("assistant", formatClarification(response.route.clarificationQuestion)));
      emitAiTelemetry({
        traceId,
        stage: "success",
        surface: "chat_bridge",
        action: "generate_plan",
        source: "ai",
        latencyMs: getLatency(),
        context: telemetryContext,
        meta: {
          promptLength: nextPrompt.length,
          resolvedObjectCount: response.route.resolvedObjects.length,
          needsClarification: true,
          orchestration: true
        }
      });
    } catch (error) {
      emitAiTelemetryError(
        {
          traceId,
          surface: "chat_bridge",
          action: "generate_plan",
          source: "ai",
          context: telemetryContext,
          latencyMs: getLatency(),
          meta: {
            promptLength: nextPrompt.length,
            orchestration: true
          }
        },
        error
      );
      appendMessage(
        createMessage("assistant", "AI 编排服务暂时不可用，我还在成长中。你可以稍后再试，或先通过传统编辑入口手动调整。", {
          tone: "error",
          bullets: capabilitySummary.supported.slice(0, 3)
        })
      );
    }
  };

  const submitGeneration = async (nextPrompt: string): Promise<void> => {
    const doc = docRef.current;
    if (!doc) {
      return;
    }
    const boundary = guardCopilotGenerationRequest(copilot?.scene ?? { docType: doc.docType, routeMode: "edit" }, nextPrompt);
    if (!boundary.allowed) {
      appendMessage(createMessage("assistant", boundary.message ?? "我还在成长中，当前请求暂不支持。", { tone: "error", bullets: boundary.recommendations }));
      return;
    }
    const traceId = createAiTraceId();
    const getLatency = createAiTimer();
    emitAiTelemetry({
      traceId,
      stage: "start",
      surface: "chat_bridge",
      action: "create_generation_job",
      source: "ai",
      context: telemetryContext,
      meta: {
        promptLength: nextPrompt.length,
        docType: doc.docType
      }
    });
    try {
      const response = await aiOrchestrationRepo.createGenerationJob({
        threadId: threadId ?? getAiThreadId(doc.docId),
        docId: doc.docId,
        docType: doc.docType,
        baseRevision: store.baseRevision,
        userText: nextPrompt,
        snapshotDsl: doc,
        templateVariables: buildTemplateVariables(doc)
      });
      if (response.unsupported) {
        appendMessage(createMessage("assistant", response.unsupported.message, { tone: "error", bullets: response.unsupported.recommendations }));
        return;
      }
      if (!response.job) {
        appendMessage(createMessage("assistant", "生成任务暂未创建成功，请稍后重试。", { tone: "error" }));
        return;
      }
      const job = response.job;
      const outlineResult = buildOutlineResultItem(resultSceneId, job, {
        threadId,
        originSceneKind: copilot?.scene.sceneKind,
        originRouteMode: copilot?.scene.routeMode,
        originLabel: copilot?.scene.title
      });
      copilot?.upsertResult(outlineResult);
      const previewMeta = buildOutlinePreviewMeta(doc, outlineResult);
      appendMessage(
        createMessage("assistant", response.ui?.message || `我先生成了一版大纲：${job.outline.title}`, {
          bullets: response.ui?.bullets?.length ? response.ui.bullets : previewMeta.helperText ? [previewMeta.helperText] : undefined,
          card: {
            kind: "outline-preview",
            outline: outlineResult,
            status: "ready",
            confirmHint: response.ui?.confirmHint,
            confirmLabel: response.ui?.confirmLabel
          }
        })
      );
      emitAiTelemetry({
        traceId,
        stage: "success",
        surface: "chat_bridge",
        action: "create_generation_job",
        source: "ai",
        latencyMs: getLatency(),
        context: telemetryContext,
        meta: {
          promptLength: nextPrompt.length,
          flowType: job.flowType,
          unitCount: job.units.length,
          status: job.status
        }
      });
    } catch (error) {
      appendMessage(createMessage("assistant", error instanceof Error ? error.message : String(error), { tone: "error" }));
      emitAiTelemetryError(
        {
          traceId,
          surface: "chat_bridge",
          action: "create_generation_job",
          source: "ai",
          context: telemetryContext,
          latencyMs: getLatency(),
          meta: {
            promptLength: nextPrompt.length,
            docType: doc.docType
          }
        },
        error
      );
    }
  };

  const submitDataQuery = async (nextPrompt: string): Promise<void> => {
    const doc = docRef.current;
    if (!doc) {
      return;
    }
    const selectedNode = selection.primaryId ? findNodeById(doc.root, selection.primaryId) : undefined;
    const sourceId = selectedNode?.data?.sourceId ?? doc.dataSources?.[0]?.id;
    const source = doc.dataSources?.find((item) => item.id === sourceId) ?? doc.dataSources?.[0];
    if (!source) {
      appendMessage(
        createMessage("assistant", "我还在成长中，当前文档里还没有可直接复用的数据源。你可以先通过传统入口配置数据接口。", {
          tone: "error"
        })
      );
      return;
    }
    const fields = extractSourceFields(source);
    if (fields.length === 0) {
      appendMessage(
        createMessage("assistant", "我还在成长中，当前数据源字段还不够明确。你可以先在传统配置里补齐字段信息。", {
          tone: "error"
        })
      );
      return;
    }
    const parent =
      (doc.docType === "dashboard"
        ? doc.root
        : doc.docType === "report"
          ? findAncestorByKind(doc.root, selection.primaryId, "section") ?? doc.root.children?.find((item) => item.kind === "section")
          : findAncestorByKind(doc.root, selection.primaryId, "slide") ?? doc.root.children?.find((item) => item.kind === "slide")) ?? doc.root;
    const artifact = await buildGeneratedArtifact({
      doc,
      title: buildChartTitleFromPrompt(nextPrompt, inferRequestedChartType(nextPrompt)),
      chartType: inferRequestedChartType(nextPrompt),
      sourceId: source.id,
      parent
    });
    const result = {
      ...artifact,
      sceneId: resultSceneId,
      threadId,
      originSceneKind: copilot?.scene.sceneKind,
      originRouteMode: copilot?.scene.routeMode,
      originLabel: copilot?.scene.title
    } satisfies CopilotArtifactResultItem;
    copilot?.upsertResult(result);
    const message = createMessage(
      "assistant",
      doc.docType === "dashboard" ? "我先基于当前数据生成了一张候选图。你可以直接插入，也可以拖到左侧画布。" : "我先基于当前数据生成了一张候选图。你可以直接插入到当前内容里。",
      {
        bullets: result.notes.slice(0, 2),
        card: {
          kind: "artifact-preview",
          artifact: result,
          previewDataDoc: buildPreviewDataDoc(doc),
          previewNode: result.node.kind === "chart" ? result.node : undefined,
          status: "ready",
          draggable: doc.docType === "dashboard" && Boolean(copilot?.scene.supportsDropArtifacts),
          helperText: doc.docType === "dashboard" ? "也可以直接拖到左侧画布的目标位置。" : undefined,
          primaryLabel: "插入到当前位置"
        }
      }
    );
    setMessages((current) => appendCopilotChatMessages(current, message));
  };

  const submitPrompt = async (promptOverride?: string): Promise<void> => {
    if (!docRef.current) {
      return;
    }
    const nextPrompt = (promptOverride ?? input).trim();
    if (!nextPrompt || isSubmitting) {
      return;
    }
    setInput(nextPrompt);
    appendMessage(createMessage("user", nextPrompt));
    setIsSubmitting(true);
    try {
      if (isGenerationPrompt(nextPrompt)) {
        await submitGeneration(nextPrompt);
        return;
      }
      if (isDataQueryPrompt(nextPrompt)) {
        await submitDataQuery(nextPrompt);
        return;
      }
      await submitEdit(nextPrompt);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickAction = (action: QuickAction): void => {
    setInput(action.prompt);
    void submitPrompt(action.prompt);
  };

  const handleSubmit = async (): Promise<void> => {
    await submitPrompt();
  };

  const composerPlaceholder =
    persona === "ai" ? "例如：帮我修改 title、改成柱状图、或查询当前数据生成候选图" : "输入你的目标";

  return (
    <div className="copilot-chat">
      <div ref={feedRef} className="copilot-chat-feed" data-testid="copilot-chat-feed">
        {messages.map((message) => {
          const card = message.card;
          return (
            <div
              key={message.id}
              className={`copilot-chat-message ${message.role === "user" ? "is-user" : "is-assistant"} ${
                message.tone === "error" ? "is-error" : ""
              }`}
            >
              <div className="copilot-chat-message-label">{message.role === "user" ? "你" : "Copilot"}</div>
              <div className="copilot-chat-bubble">
                <span>{message.text}</span>
                {message.bullets?.length ? (
                  <ul className="diff-list">
                    {message.bullets.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {card?.kind === "proposal-preview" && card.status !== "dismissed" ? (
                  <ProposalPreviewCard
                    previewDataDoc={card.previewDataDoc}
                    previewNode={card.previewNode}
                    proposal={card.proposal}
                    status={card.status}
                    confirmHint={card.confirmHint}
                    confirmLabel={card.confirmLabel}
                    onApply={() => applyProposal(message.id, card.proposal, card.appliedMessage)}
                    onDismiss={() => {
                      copilot?.upsertResult(withProposalResultStatus(card.proposal, "rejected"));
                      updateMessageCard(message.id, (nextCard) => ({ ...nextCard, status: "dismissed" }));
                    }}
                  />
                ) : null}
                {card?.kind === "artifact-preview" && card.status !== "dismissed" ? (
                  <ArtifactPreviewCard
                    artifact={card.artifact}
                    previewDataDoc={card.previewDataDoc}
                    previewNode={card.previewNode}
                    status={card.status}
                    draggable={card.draggable}
                    helperText={card.helperText}
                    primaryLabel={card.primaryLabel}
                    onApply={() => insertArtifact(message.id, card.artifact)}
                    onDismiss={() => {
                      copilot?.removeResult(card.artifact.resultId);
                      removeCardMessage(message.id);
                    }}
                  />
                ) : null}
                {card?.kind === "outline-preview" && card.status !== "dismissed" ? (
                  <OutlinePreviewCard
                    outline={card.outline}
                    status={card.status}
                    confirmHint={card.confirmHint}
                    confirmLabel={card.confirmLabel}
                    onApply={docMeta.docType === "report" ? () => applyOutline(message.id, card.outline) : undefined}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
        {isSubmitting ? (
          <div className="copilot-chat-message is-assistant">
            <div className="copilot-chat-message-label">Copilot</div>
            <div className="copilot-chat-bubble is-loading">
              <span>正在处理你的请求...</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="copilot-chat-composer">
        <div className="copilot-chat-quick-actions">
          {quickActions.map((action) => (
            <button key={action.id} className="btn mini-btn" onClick={() => handleQuickAction(action)}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="copilot-chat-input-row">
          <input
            aria-label="Copilot 输入"
            className="input"
            placeholder={composerPlaceholder}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <button className="btn primary" disabled={isSubmitting} onClick={() => void handleSubmit()}>
            {isSubmitting ? "处理中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
