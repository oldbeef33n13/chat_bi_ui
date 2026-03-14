import { useEffect, useMemo, useRef, useState } from "react";
import type { ChartSpec, VDoc, VNode } from "../../core/doc/types";
import { findNodeById, listNodes, nodeTitle } from "../../core/doc/tree";
import { useDataEngine } from "../hooks/use-data-engine";
import { aiOrchestrationRepo, buildTemplateVariables, getAiThreadId } from "../utils/ai-edit-orchestration";
import { askChartAssistant } from "../utils/chart-assistant";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";
import { resolveDataEndpointParams } from "../utils/data-endpoint-binding";
import { useCopilot } from "./copilot-context";
import { appendCopilotChatMessages, trimCopilotChatMessages } from "./chat-history";
import {
  buildArtifactFromInsight,
  buildAnalysisInsightResultItem,
  buildChartInsightResultItem,
  buildRuntimeProposalResultItem,
  buildScopedStoryInsightResultItem,
  buildStoryInsightResultItem,
  type CopilotInsightResultItem,
  type CopilotProposalResultItem
} from "./copilot-results";

type ChatRole = "assistant" | "user";
type ChatTone = "neutral" | "error";
type RuntimeAction = "focus_summary" | "focus_chart_ask" | "focus_chart_analysis" | "doc_summary" | "doc_analysis";
type RuntimeCardStatus = "ready" | "saved" | "opened";

type RuntimeChatCard =
  | {
      kind: "draft-actions";
      insight: CopilotInsightResultItem;
      status: RuntimeCardStatus;
      confirmHint?: string;
      confirmLabel?: string;
      appliedMessage?: string;
    }
  | {
      kind: "proposal-handoff";
      proposal: CopilotProposalResultItem;
      status: RuntimeCardStatus;
    };

interface ChatMessage {
  id: string;
  role: ChatRole;
  tone: ChatTone;
  text: string;
  bullets?: string[];
  card?: RuntimeChatCard;
}

interface RuntimeQuickAction {
  id: string;
  label: string;
  action: RuntimeAction;
  prompt: string;
}

const createMessage = (
  role: ChatRole,
  text: string,
  options: { tone?: ChatTone; bullets?: string[]; card?: RuntimeChatCard } = {}
): ChatMessage => ({
  id: `${role}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
  role,
  tone: options.tone ?? "neutral",
  text,
  bullets: options.bullets,
  card: options.card
});

const toEditHash = (docId: string): string => `#/docs/${encodeURIComponent(docId)}/edit`;

const toDraftLabel = (docType: VDoc["docType"]): string => {
  if (docType === "ppt") {
    return "保存页面草稿";
  }
  if (docType === "dashboard") {
    return "保存模块草稿";
  }
  return "保存章节草稿";
};

const objectKindLabel = (kind: VNode["kind"]): string => {
  switch (kind) {
    case "chart":
      return "图表";
    case "table":
      return "表格";
    case "text":
      return "文本块";
    case "image":
      return "图片";
    case "section":
      return "章节";
    case "slide":
      return "页面";
    default:
      return "对象";
  }
};

const defaultObjectPrompt = (node: VNode): string =>
  node.kind === "chart"
    ? "这个图最近的趋势和异常点是什么？"
    : `请总结这个${objectKindLabel(node.kind)}的核心信息，并给我一句更适合汇报的表达`;

const defaultChartAnalysisPrompt = (): string => "为什么最近有明显波动？请给出重点原因和建议追问。";
const defaultDocSummaryPrompt = (): string => "请总结这份文档的核心结论和后续建议";
const defaultDocAnalysisPrompt = (): string => "请找出整份文档里最值得关注的变化、风险和建议动作";

const collectObjectInsights = (node: VNode, scene: ReturnType<typeof useCopilot>["scene"]): string[] => {
  const entries = [nodeTitle(node), scene.sectionLabel, scene.slideLabel];
  if (node.kind === "text") {
    const text = String((node.props as Record<string, unknown> | undefined)?.text ?? "").trim();
    if (text) {
      entries.push(text.slice(0, 80));
    }
  }
  if (node.children?.length) {
    entries.push(...node.children.slice(0, 3).map((child) => nodeTitle(child)));
  }
  return entries.filter((item): item is string => Boolean(item));
};

const collectDocInsights = (doc: VDoc): string[] =>
  listNodes(doc.root)
    .filter((node) => node.kind === "section" || node.kind === "slide" || node.kind === "chart" || node.kind === "table" || node.kind === "text")
    .map((node) => nodeTitle(node))
    .filter(Boolean)
    .slice(0, 8);

const fallbackObjectSummary = (node: VNode, prompt: string, scene: ReturnType<typeof useCopilot>["scene"]) => {
  const focus = collectObjectInsights(node, scene);
  return {
    source: "rule",
    headline: `${nodeTitle(node)} - 对象总结`,
    conclusion:
      node.kind === "text"
        ? `当前文本块已覆盖主要表达，但建议围绕“${prompt}”补齐更明确的结论和证据。`
        : `当前${objectKindLabel(node.kind)}已被定位，建议围绕“${prompt}”补充更清晰的说明和下一步动作。`,
    evidence: focus.slice(0, 3),
    advice: ["补充一句管理层可直接复述的结论", "继续围绕当前对象追问", "如果这版结论合适，可以直接保存成草稿"],
    ui: undefined,
  };
};

const fallbackStorySummary = (doc: VDoc, prompt: string) => {
  const insights = collectDocInsights(doc);
  return {
    source: "rule",
    headline: `${doc.title ?? "当前文档"} - 运行态总结`,
    conclusion: insights[0] ?? "当前文档已具备基础展示结构，建议补齐关键结论。",
    evidence: insights.slice(0, 3),
    advice: [prompt || "先明确核心结论，再补证据。", "对异常和变化点补充一段说明。", "如果这版结论合适，可以直接保存成草稿"],
    ui: undefined,
  };
};

const inferFieldType = (rows: Array<Record<string, unknown>>, field: string): string => {
  for (const row of rows) {
    const value = row[field];
    if (typeof value === "number") {
      return "number";
    }
    if (typeof value === "boolean") {
      return "boolean";
    }
    if (value instanceof Date) {
      return "time";
    }
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return "time";
    }
    if (typeof value === "string") {
      return "string";
    }
  }
  return "string";
};

const buildAnalysisCandidateSource = (node: VNode, rows: Array<Record<string, unknown>>) => {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return {
    sourceId: String(node.data?.sourceId ?? node.id),
    name: nodeTitle(node),
    schema: keys.map((field) => ({
      name: field,
      type: inferFieldType(rows, field)
    })),
    rows
  };
};

const resolveNodeRequest = (doc: VDoc, node: VNode): { endpointId?: string; sourceId?: string; queryId?: string; params?: Record<string, unknown> } => {
  const endpointId = node.data?.endpointId;
  const fallbackSourceId = doc.dataSources?.[0]?.id;
  const sourceId = node.data?.sourceId ?? fallbackSourceId;
  const fallbackQueryId = sourceId ? doc.queries?.find((item) => item.sourceId === sourceId)?.queryId : undefined;
  const queryId = node.data?.queryId ?? fallbackQueryId;
  const params = endpointId ? resolveDataEndpointParams(doc, node) : node.data?.params;
  return {
    endpointId: endpointId ?? undefined,
    sourceId: sourceId ?? undefined,
    queryId: queryId ?? undefined,
    params: (params as Record<string, unknown> | undefined) ?? undefined
  };
};

const fetchNodeRows = async (
  doc: VDoc,
  node: VNode,
  engine: ReturnType<typeof useDataEngine>["engine"]
): Promise<Array<Record<string, unknown>>> => {
  const request = resolveNodeRequest(doc, node);
  if (!request.endpointId && !request.sourceId) {
    return [];
  }
  const response = await engine.execute(request);
  const rawRows = Array.isArray(response)
    ? response
    : response && typeof response === "object" && "rows" in (response as Record<string, unknown>) && Array.isArray((response as Record<string, unknown>).rows)
      ? ((response as Record<string, unknown>).rows as Array<Record<string, unknown>>)
      : [];
  const withComputed = node.kind === "chart" ? applyComputedFields(rawRows, (node.props ?? {}) as ChartSpec) : rawRows;
  return applyFilters(withComputed, doc.filters ?? [], node);
};

const fallbackChartAnalysis = (node: VNode, prompt: string, rows: Array<Record<string, unknown>>) => {
  const sourceId = String(node.data?.sourceId ?? node.id);
  return {
    source: "rule",
    headline: `${nodeTitle(node)} - 深度分析`,
    conclusion: `已基于 ${sourceId} 的 ${rows.length} 行样本，对“${prompt}”完成一轮受限分析。`,
    evidence: [`本次分析覆盖 ${rows.length} 行样本`, "已对当前图表的核心字段做聚合和排序"],
    advice: ["建议继续查看峰值对应对象和时间分布", "如果这版分析合适，可以直接保存成草稿"],
    router: {},
    plan: {},
    execution: {},
    ui: undefined,
  };
};

const fallbackDocAnalysis = (doc: VDoc, prompt: string, candidateSources: Array<{ sourceId: string; rows: Array<Record<string, unknown>> }>) => {
  const sampleRows = candidateSources.reduce((sum, item) => sum + item.rows.length, 0);
  return {
    source: "rule",
    headline: `${doc.title ?? "当前文档"} - 深度分析`,
    conclusion: `已基于 ${candidateSources.length} 个候选数据源，对“${prompt}”完成文档级分析摘要。`,
    evidence: [`本次汇总 ${candidateSources.length} 个候选数据源`, `累计覆盖 ${sampleRows} 行样本数据`],
    advice: ["建议先沉淀成草稿，再进入编辑态补充图表和说明", "如需继续处理，可以直接去编辑态"],
    router: {},
    plan: {},
    execution: {},
    ui: undefined,
  };
};

const buildQuickActions = (selectedObjectNode?: VNode): RuntimeQuickAction[] => {
  if (selectedObjectNode?.kind === "chart") {
    return [
      { id: "chart-ask", label: "解释当前图表", action: "focus_chart_ask", prompt: defaultObjectPrompt(selectedObjectNode) },
      { id: "chart-analysis", label: "深度分析", action: "focus_chart_analysis", prompt: defaultChartAnalysisPrompt() },
      { id: "doc-summary", label: "总结整份文档", action: "doc_summary", prompt: defaultDocSummaryPrompt() }
    ];
  }
  if (selectedObjectNode) {
    return [
      { id: "focus-summary", label: "总结当前对象", action: "focus_summary", prompt: defaultObjectPrompt(selectedObjectNode) },
      { id: "doc-summary", label: "总结整份文档", action: "doc_summary", prompt: defaultDocSummaryPrompt() },
      { id: "doc-analysis", label: "深度分析文档", action: "doc_analysis", prompt: defaultDocAnalysisPrompt() }
    ];
  }
  return [
    { id: "doc-summary", label: "总结整份文档", action: "doc_summary", prompt: defaultDocSummaryPrompt() },
    { id: "doc-analysis", label: "深度分析文档", action: "doc_analysis", prompt: defaultDocAnalysisPrompt() }
  ];
};

const buildIntroMessage = (doc: VDoc, selectedObjectNode?: VNode, scene?: ReturnType<typeof useCopilot>["scene"]): ChatMessage => {
  if (selectedObjectNode) {
    return createMessage(
      "assistant",
      `我会围绕当前${objectKindLabel(selectedObjectNode.kind)}“${scene?.objectLabel ?? nodeTitle(selectedObjectNode)}”来回答。也可以直接让我总结整份文档。`
    );
  }
  return createMessage("assistant", `我当前先围绕整份文档来帮你总结。若想分析具体图表，请先在主画布里点中那个对象。`);
};

const buildRuntimeDraftCard = (
  insight: CopilotInsightResultItem,
  ui?: { confirmHint?: string; confirmLabel?: string; appliedMessage?: string }
): RuntimeChatCard => ({
  kind: "draft-actions",
  insight,
  status: "ready",
  confirmHint: ui?.confirmHint,
  confirmLabel: ui?.confirmLabel,
  appliedMessage: ui?.appliedMessage
});

const sameObjectContext = (
  left: { docId: string; objectId?: string; objectKind?: VNode["kind"]; objectLabel?: string; sectionLabel?: string; slideLabel?: string },
  right: { docId: string; objectId?: string; objectKind?: VNode["kind"]; objectLabel?: string; sectionLabel?: string; slideLabel?: string }
): boolean =>
  left.docId === right.docId &&
  left.objectId === right.objectId &&
  left.objectKind === right.objectKind &&
  left.objectLabel === right.objectLabel &&
  left.sectionLabel === right.sectionLabel &&
  left.slideLabel === right.slideLabel;

export function CopilotRuntimePanel({ doc }: { doc: VDoc }): JSX.Element {
  const { scene, upsertResult, focusResult } = useCopilot();
  const threadId = getAiThreadId(doc.docId);
  const { engine } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(defaultDocSummaryPrompt());
  const [action, setAction] = useState<RuntimeAction>("doc_summary");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const chartNodes = useMemo(
    () =>
      listNodes(doc.root).filter((node) => {
        if (node.kind !== "chart") {
          return false;
        }
        const spec = (node.props ?? {}) as ChartSpec;
        return spec.runtimeAskEnabled !== false;
      }),
    [doc]
  );
  const selectedObjectNode = useMemo(() => {
    if (scene.docId !== doc.docId || !scene.objectId) {
      return undefined;
    }
    return findNodeById(doc.root, scene.objectId)?.node;
  }, [doc, scene.docId, scene.objectId]);
  const objectContext = useMemo(
    () => ({
      docId: doc.docId,
      objectId: selectedObjectNode?.id,
      objectKind: selectedObjectNode?.kind,
      objectLabel: scene.objectLabel,
      sectionLabel: scene.sectionLabel,
      slideLabel: scene.slideLabel
    }),
    [doc.docId, scene.objectLabel, scene.sectionLabel, scene.slideLabel, selectedObjectNode?.id, selectedObjectNode?.kind]
  );
  const quickActions = useMemo(() => buildQuickActions(selectedObjectNode), [selectedObjectNode]);

  const lastContextRef = useRef<typeof objectContext | null>(null);

  useEffect(() => {
    if (lastContextRef.current && sameObjectContext(lastContextRef.current, objectContext)) {
      return;
    }
    lastContextRef.current = objectContext;
    setMessages((current) => {
      const nextIntro = buildIntroMessage(doc, selectedObjectNode, scene);
      if (current.length === 1 && current[0]?.role === "assistant" && current[0].text === nextIntro.text) {
        return current;
      }
      return trimCopilotChatMessages([nextIntro]);
    });
    if (selectedObjectNode?.kind === "chart") {
      setAction((current) => (current === "focus_chart_ask" ? current : "focus_chart_ask"));
      setInput((current) => {
        const next = defaultObjectPrompt(selectedObjectNode);
        return current === next ? current : next;
      });
      return;
    }
    if (selectedObjectNode) {
      setAction((current) => (current === "focus_summary" ? current : "focus_summary"));
      setInput((current) => {
        const next = defaultObjectPrompt(selectedObjectNode);
        return current === next ? current : next;
      });
      return;
    }
    setAction((current) => (current === "doc_summary" ? current : "doc_summary"));
    setInput((current) => {
      const next = defaultDocSummaryPrompt();
      return current === next ? current : next;
    });
  }, [doc, objectContext, scene, selectedObjectNode]);

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

  const updateMessageCard = (messageId: string, updater: (card: RuntimeChatCard) => RuntimeChatCard): void => {
    setMessages((current) =>
      current.map((item) => {
        if (item.id !== messageId || !item.card) {
          return item;
        }
        return { ...item, card: updater(item.card) };
      })
    );
  };

  const handleQuickAction = (item: RuntimeQuickAction): void => {
    setAction(item.action);
    setInput(item.prompt);
    void handleSubmit(item.prompt, item.action);
  };

  const saveInsightDraft = (
    messageId: string,
    insight: CopilotInsightResultItem,
    openInEdit: boolean,
    appliedMessage?: string
  ): void => {
    const artifact = buildArtifactFromInsight(scene.sceneId, insight);
    upsertResult(artifact);
    focusResult(artifact.resultId);
    updateMessageCard(messageId, (card) => ({ ...card, status: openInEdit ? "opened" : "saved" }));
    if (openInEdit) {
      window.location.hash = toEditHash(doc.docId);
      return;
    }
    appendMessage(createMessage("assistant", appliedMessage ?? `已为你保存一份${doc.docType === "ppt" ? "页面" : doc.docType === "dashboard" ? "模块" : "章节"}草稿。`));
  };

  const handoffProposalToEdit = (messageId: string, proposal: CopilotProposalResultItem): void => {
    focusResult(proposal.resultId);
    updateMessageCard(messageId, (card) => ({ ...card, status: "opened" }));
    window.location.hash = toEditHash(doc.docId);
  };

  const runFocusSummary = async (node: VNode, prompt: string): Promise<void> => {
    let response;
    try {
      response = await aiOrchestrationRepo.summarizeStory({
        docType: doc.docType,
        title: nodeTitle(node),
        insights: collectObjectInsights(node, scene),
        focus: prompt
      });
    } catch {
      response = fallbackObjectSummary(node, prompt, scene);
    }
    const insight = buildScopedStoryInsightResultItem({
      sceneId: scene.sceneId,
      threadId,
      docId: doc.docId,
      docType: doc.docType,
      title: `${nodeTitle(node)} - 对象总结`,
      prompt,
      response,
      scopeType: "node",
      scopeId: node.id,
      originSceneKind: scene.sceneKind,
      originRouteMode: scene.routeMode,
      originLabel: scene.title
    });
    upsertResult(insight);
    appendMessage(
      createMessage("assistant", response.ui?.message || response.conclusion, {
        bullets: response.ui?.bullets?.length ? response.ui.bullets : response.evidence.slice(0, 3),
        card: buildRuntimeDraftCard(insight, response.ui)
      })
    );
  };

  const runChartAsk = async (node: VNode, prompt: string): Promise<void> => {
    const rows = await fetchNodeRows(doc, node, engine);
    let response;
    try {
      response = await aiOrchestrationRepo.askChart({
        prompt,
        nodeId: node.id,
        spec: (node.props ?? {}) as ChartSpec,
        rows
      });
    } catch {
      const fallback = askChartAssistant({
        prompt,
        nodeId: node.id,
        spec: (node.props ?? {}) as ChartSpec,
        rows
      });
      response = {
        source: "rule",
        answer: fallback.answer,
        suggestions: fallback.suggestions,
        plan: fallback.plan,
        planSummary: fallback.planSummary
      };
    }
    const insight = buildChartInsightResultItem({
      sceneId: scene.sceneId,
      threadId,
      docId: doc.docId,
      docType: doc.docType,
      nodeId: node.id,
      title: nodeTitle(node),
      prompt,
      response,
      originSceneKind: scene.sceneKind,
      originRouteMode: scene.routeMode,
      originLabel: scene.title
    });
    upsertResult(insight);
    const proposal = buildRuntimeProposalResultItem({
      sceneId: scene.sceneId,
      threadId,
      docId: doc.docId,
      docType: doc.docType,
      nodeId: node.id,
      title: nodeTitle(node),
      prompt,
      response,
      originSceneKind: scene.sceneKind,
      originRouteMode: scene.routeMode,
      originLabel: scene.title
    });
    if (proposal) {
      upsertResult(proposal);
    }
    appendMessage(
      createMessage("assistant", response.answer, {
        bullets: response.suggestions.slice(0, 3),
        card: proposal
          ? {
              kind: "proposal-handoff",
              proposal,
              status: "ready"
            }
          : undefined
      })
    );
  };

  const runChartAnalysis = async (node: VNode, prompt: string): Promise<void> => {
    const rows = await fetchNodeRows(doc, node, engine);
    let response;
    try {
      response = await aiOrchestrationRepo.analyzeRuntime({
        threadId,
        docId: doc.docId,
        docType: doc.docType,
        question: prompt,
        selectedObjectIds: [node.id],
        lastResolvedObjectId: node.id,
        templateVariables: buildTemplateVariables(doc),
        candidateSources: [buildAnalysisCandidateSource(node, rows)]
      });
    } catch {
      response = fallbackChartAnalysis(node, prompt, rows);
    }
    const insight = buildAnalysisInsightResultItem({
      sceneId: scene.sceneId,
      threadId,
      docId: doc.docId,
      docType: doc.docType,
      scopeType: "chart",
      scopeId: node.id,
      title: `${nodeTitle(node)} - 深度分析`,
      prompt,
      response,
      originSceneKind: scene.sceneKind,
      originRouteMode: scene.routeMode,
      originLabel: scene.title
    });
    upsertResult(insight);
    appendMessage(
      createMessage("assistant", response.ui?.message || response.conclusion, {
        bullets: response.ui?.bullets?.length ? response.ui.bullets : response.evidence.slice(0, 3),
        card: buildRuntimeDraftCard(insight, response.ui)
      })
    );
  };

  const runDocSummary = async (prompt: string): Promise<void> => {
    let response;
    try {
      response = await aiOrchestrationRepo.summarizeStory({
        docType: doc.docType,
        title: doc.title ?? "当前文档",
        insights: collectDocInsights(doc),
        focus: prompt
      });
    } catch {
      response = fallbackStorySummary(doc, prompt);
    }
    const insight = buildStoryInsightResultItem({
      sceneId: scene.sceneId,
      threadId,
      docId: doc.docId,
      docType: doc.docType,
      title: doc.title ?? "当前文档",
      prompt,
      response,
      originSceneKind: scene.sceneKind,
      originRouteMode: scene.routeMode,
      originLabel: scene.title
    });
    upsertResult(insight);
    appendMessage(
      createMessage("assistant", response.ui?.message || response.conclusion, {
        bullets: response.ui?.bullets?.length ? response.ui.bullets : response.evidence.slice(0, 3),
        card: buildRuntimeDraftCard(insight, response.ui)
      })
    );
  };

  const runDocAnalysis = async (prompt: string): Promise<void> => {
    const candidateSources = [];
    for (const node of chartNodes.slice(0, 4)) {
      try {
        const rows = await fetchNodeRows(doc, node, engine);
        if (rows.length === 0) {
          continue;
        }
        candidateSources.push(buildAnalysisCandidateSource(node, rows));
      } catch {
        // keep gathering other sources
      }
    }
    let response;
    try {
      response = await aiOrchestrationRepo.analyzeRuntime({
        threadId,
        docId: doc.docId,
        docType: doc.docType,
        question: prompt,
        selectedObjectIds: chartNodes.slice(0, 4).map((node) => node.id),
        templateVariables: buildTemplateVariables(doc),
        candidateSources
      });
    } catch {
      response = fallbackDocAnalysis(doc, prompt, candidateSources);
    }
    const insight = buildAnalysisInsightResultItem({
      sceneId: scene.sceneId,
      threadId,
      docId: doc.docId,
      docType: doc.docType,
      scopeType: "doc",
      scopeId: doc.docId,
      title: `${doc.title ?? "当前文档"} - 深度分析`,
      prompt,
      response,
      originSceneKind: scene.sceneKind,
      originRouteMode: scene.routeMode,
      originLabel: scene.title
    });
    upsertResult(insight);
    appendMessage(
      createMessage("assistant", response.ui?.message || response.conclusion, {
        bullets: response.ui?.bullets?.length ? response.ui.bullets : response.evidence.slice(0, 3),
        card: buildRuntimeDraftCard(insight, response.ui)
      })
    );
  };

  const handleSubmit = async (promptOverride?: string, actionOverride?: RuntimeAction): Promise<void> => {
    const prompt = (promptOverride ?? input).trim();
    const nextAction = actionOverride ?? action;
    if (!prompt || isSubmitting) {
      return;
    }
    setInput(prompt);
    setAction(nextAction);
    appendMessage(createMessage("user", prompt));
    setIsSubmitting(true);
    try {
      if (nextAction === "focus_summary" && selectedObjectNode) {
        await runFocusSummary(selectedObjectNode, prompt);
        return;
      }
      if (nextAction === "focus_chart_ask" && selectedObjectNode?.kind === "chart") {
        await runChartAsk(selectedObjectNode, prompt);
        return;
      }
      if (nextAction === "focus_chart_analysis" && selectedObjectNode?.kind === "chart") {
        await runChartAnalysis(selectedObjectNode, prompt);
        return;
      }
      if (nextAction === "doc_analysis") {
        await runDocAnalysis(prompt);
        return;
      }
      await runDocSummary(prompt);
    } catch (error) {
      appendMessage(createMessage("assistant", error instanceof Error ? error.message : String(error), { tone: "error" }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const placeholder =
    selectedObjectNode
      ? `直接问当前${objectKindLabel(selectedObjectNode.kind)}，或让它转成更适合汇报的结论`
      : "先总结当前文档，或先在主场景点中一个对象后再追问";

  return (
    <div className="copilot-chat">
      <div ref={feedRef} className="copilot-chat-feed" data-testid="copilot-runtime-feed">
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
                {card?.kind === "draft-actions" ? (
                  <div className="copilot-inline-card">
                    <div className="copilot-inline-card-header">
                      <strong>{card.insight.headline}</strong>
                      <span className="chip">{card.status === "ready" ? "可保存" : card.status === "saved" ? "已保存" : "已带入编辑态"}</span>
                    </div>
                    <span className="muted">{card.insight.summary}</span>
                    <span className="muted">{card.confirmHint ?? "确认后只会生成一份草稿，不会直接覆盖当前内容。"}</span>
                    <div className="copilot-inline-card-actions">
                      <button
                        className="btn primary"
                        disabled={card.status !== "ready"}
                        onClick={() => saveInsightDraft(message.id, card.insight, false, card.appliedMessage)}
                      >
                        {card.confirmLabel ?? toDraftLabel(doc.docType)}
                      </button>
                      <button className="btn" disabled={card.status === "opened"} onClick={() => saveInsightDraft(message.id, card.insight, true)}>
                        去编辑态继续处理
                      </button>
                    </div>
                  </div>
                ) : null}
                {card?.kind === "proposal-handoff" ? (
                  <div className="copilot-inline-card">
                    <div className="copilot-inline-card-header">
                      <strong>{card.proposal.summary}</strong>
                      <span className="chip">{card.status === "opened" ? "已带入编辑态" : "修改建议"}</span>
                    </div>
                    <span className="muted">这条建议需要回到编辑态再确认和应用，我已经帮你保留好了。</span>
                    <div className="copilot-inline-card-actions">
                      <button className="btn primary" disabled={card.status === "opened"} onClick={() => handoffProposalToEdit(message.id, card.proposal)}>
                        去编辑态继续处理
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
        {isSubmitting ? (
          <div className="copilot-chat-message is-assistant">
            <div className="copilot-chat-message-label">Copilot</div>
            <div className="copilot-chat-bubble is-loading">
              <span>正在整理答案...</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="copilot-chat-composer">
        <div className="copilot-chat-quick-actions">
          {quickActions.map((item) => (
            <button
              key={item.id}
              className={`btn mini-btn ${action === item.action && input === item.prompt ? "primary" : ""}`}
              onClick={() => handleQuickAction(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="copilot-chat-input-row">
          <input
            aria-label="运行态 Copilot 输入"
            className="input"
            placeholder={placeholder}
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
