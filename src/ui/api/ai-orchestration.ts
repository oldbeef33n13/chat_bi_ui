import type { ChartSpec, CommandPlan, VDoc, VNode } from "../../core/doc/types";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const ensureStringArray = (value: unknown): string[] => (Array.isArray(value) ? value.map((item) => String(item)) : []);

export interface AiResolvedObject {
  objectId: string;
  kind: string;
  title: string;
  confidence: number;
}

export interface AiWorkingContext {
  docId: string;
  docType: string;
  selectedObjectIds: string[];
  activeSectionId?: string;
  activeSlideId?: string;
  lastResolvedObjectId?: string;
  currentIntent?: string;
  activeJobId?: string;
  templateVariables: Record<string, unknown>;
}

export interface AiConversationRoute {
  intent: string;
  scene?: string;
  resolvedObjects: AiResolvedObject[];
  needsClarification: boolean;
  clarificationQuestion?: string;
  workingContext: AiWorkingContext;
}

export interface AiUnsupportedResponse {
  code: "traditional_flow_only" | "cross_doc_generation" | "runtime_only" | string;
  message: string;
  recommendations: string[];
}

export interface AiUiAssistantResponse {
  message: string;
  bullets: string[];
  confirmHint?: string;
  confirmLabel?: string;
  appliedMessage?: string;
}

export interface AiPatchProposal {
  proposalId: string;
  threadId: string;
  docId: string;
  docType: string;
  baseRevision: number;
  scopeType: string;
  scopeId?: string;
  risk: "low" | "medium" | "high";
  summary: string;
  explanation: string[];
  commandPlan: CommandPlan;
  previewChangedObjectIds: string[];
  source: "rule" | "provider" | string;
  accepted: boolean;
  rejected: boolean;
  createdAt: string;
}

export interface ProposeEditRequest {
  threadId: string;
  docId: string;
  docType: string;
  userText: string;
  baseRevision?: number;
  snapshotDsl: VDoc;
  selectedObjectIds?: string[];
  activeSectionId?: string;
  activeSlideId?: string;
  templateVariables?: Record<string, unknown>;
}

export interface ProposeEditResponse {
  route: AiConversationRoute;
  proposal: AiPatchProposal | null;
  unsupported?: AiUnsupportedResponse | null;
  ui?: AiUiAssistantResponse | null;
}

export interface AiGenerationOutlineUnit {
  title: string;
  goal: string;
  unitType: "section" | "slide" | "block_region" | "summary";
  orderIndex: number;
}

export interface AiGenerationOutline {
  title: string;
  audience: string;
  goal: string;
  units: AiGenerationOutlineUnit[];
  notes: string[];
}

export interface AiGenerationUnit {
  unitId: string;
  title: string;
  goal: string;
  unitType: "section" | "slide" | "block_region" | "summary";
  orderIndex: number;
  status: "queued" | "planning" | "ready" | "accepted" | "rejected" | "failed";
  resultProposalId?: string;
  errorMessage?: string;
  artifact?: AiGeneratedArtifact;
}

export interface AiGeneratedArtifact {
  artifactId: string;
  unitId: string;
  artifactKind: "section" | "slide" | "block_region" | "summary";
  title: string;
  summary: string;
  node: VNode;
  notes: string[];
  createdAt: string;
}

export interface AiGenerationJob {
  jobId: string;
  threadId: string;
  docId: string;
  docType: string;
  baseRevision: number;
  flowType: string;
  goal: string;
  status: "queued" | "running" | "ready" | "completed" | "failed";
  outline: AiGenerationOutline;
  units: AiGenerationUnit[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGenerationJobRequest {
  threadId: string;
  docId: string;
  docType: string;
  baseRevision?: number;
  userText: string;
  goal?: string;
  snapshotDsl: VDoc;
  templateVariables?: Record<string, unknown>;
}

export interface CreateGenerationJobResponse {
  job: AiGenerationJob | null;
  unsupported?: AiUnsupportedResponse | null;
  ui?: AiUiAssistantResponse | null;
}

export interface AiChartAskRequest {
  prompt: string;
  nodeId: string;
  spec: ChartSpec;
  rows: Array<Record<string, unknown>>;
}

export interface AiChartAskResponse {
  source: "rule" | "provider" | string;
  answer: string;
  suggestions: string[];
  plan: CommandPlan | null;
  planSummary?: string;
}

export interface AiStorySummaryRequest {
  docType: string;
  title: string;
  insights: string[];
  focus?: string;
}

export interface AiStorySummaryResponse {
  source: "rule" | "provider" | string;
  headline: string;
  conclusion: string;
  evidence: string[];
  advice: string[];
  ui?: AiUiAssistantResponse;
}

export interface AiRuntimeAnalysisField {
  name: string;
  type: string;
  label?: string;
  unit?: string;
}

export interface AiRuntimeAnalysisCandidateSource {
  sourceId: string;
  name?: string;
  schema: AiRuntimeAnalysisField[];
  rows: Array<Record<string, unknown>>;
}

export interface AiRuntimeAnalysisRequest {
  threadId: string;
  docId: string;
  docType: string;
  question: string;
  selectedObjectIds?: string[];
  activeSectionId?: string;
  activeSlideId?: string;
  lastResolvedObjectId?: string;
  templateVariables?: Record<string, unknown>;
  candidateSources: AiRuntimeAnalysisCandidateSource[];
}

export interface AiRuntimeAnalysisResponse {
  source: "rule" | "provider" | string;
  headline: string;
  conclusion: string;
  evidence: string[];
  advice: string[];
  router: Record<string, unknown>;
  plan: Record<string, unknown>;
  execution: Record<string, unknown>;
  ui?: AiUiAssistantResponse;
}

export class AiOrchestrationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "AiOrchestrationApiError";
  }
}

const parseResolvedObject = (value: unknown): AiResolvedObject => {
  const raw = ensureObject(value);
  return {
    objectId: String(raw.objectId ?? ""),
    kind: String(raw.kind ?? "node"),
    title: String(raw.title ?? ""),
    confidence: Number(raw.confidence ?? 0)
  };
};

const parseWorkingContext = (value: unknown): AiWorkingContext => {
  const raw = ensureObject(value);
  return {
    docId: String(raw.docId ?? ""),
    docType: String(raw.docType ?? ""),
    selectedObjectIds: ensureStringArray(raw.selectedObjectIds),
    activeSectionId: raw.activeSectionId ? String(raw.activeSectionId) : undefined,
    activeSlideId: raw.activeSlideId ? String(raw.activeSlideId) : undefined,
    lastResolvedObjectId: raw.lastResolvedObjectId ? String(raw.lastResolvedObjectId) : undefined,
    currentIntent: raw.currentIntent ? String(raw.currentIntent) : undefined,
    activeJobId: raw.activeJobId ? String(raw.activeJobId) : undefined,
    templateVariables: ensureObject(raw.templateVariables)
  };
};

const parseRoute = (value: unknown): AiConversationRoute => {
  const raw = ensureObject(value);
  return {
    intent: String(raw.intent ?? ""),
    scene: raw.scene ? String(raw.scene) : undefined,
    resolvedObjects: Array.isArray(raw.resolvedObjects) ? raw.resolvedObjects.map(parseResolvedObject) : [],
    needsClarification: Boolean(raw.needsClarification),
    clarificationQuestion: raw.clarificationQuestion ? String(raw.clarificationQuestion) : undefined,
    workingContext: parseWorkingContext(raw.workingContext)
  };
};

const parseProposal = (value: unknown): AiPatchProposal => {
  const raw = ensureObject(value);
  return {
    proposalId: String(raw.proposalId ?? ""),
    threadId: String(raw.threadId ?? ""),
    docId: String(raw.docId ?? ""),
    docType: String(raw.docType ?? ""),
    baseRevision: Number(raw.baseRevision ?? 0),
    scopeType: String(raw.scopeType ?? "doc"),
    scopeId: raw.scopeId ? String(raw.scopeId) : undefined,
    risk: String(raw.risk ?? "low") as AiPatchProposal["risk"],
    summary: String(raw.summary ?? ""),
    explanation: ensureStringArray(raw.explanation),
    commandPlan: ensureObject(raw.commandPlan) as unknown as CommandPlan,
    previewChangedObjectIds: ensureStringArray(raw.previewChangedObjectIds),
    source: String(raw.source ?? "rule"),
    accepted: Boolean(raw.accepted),
    rejected: Boolean(raw.rejected),
    createdAt: String(raw.createdAt ?? "")
  };
};

const parseUiAssistant = (value: unknown): AiUiAssistantResponse => {
  const raw = ensureObject(value);
  return {
    message: String(raw.message ?? ""),
    bullets: ensureStringArray(raw.bullets),
    confirmHint: raw.confirmHint ? String(raw.confirmHint) : undefined,
    confirmLabel: raw.confirmLabel ? String(raw.confirmLabel) : undefined,
    appliedMessage: raw.appliedMessage ? String(raw.appliedMessage) : undefined
  };
};

const parseProposeEditResponse = (value: unknown): ProposeEditResponse => {
  const raw = ensureObject(value);
  return {
    route: parseRoute(raw.route),
    proposal: raw.proposal ? parseProposal(raw.proposal) : null,
    unsupported: raw.unsupported ? parseUnsupported(raw.unsupported) : null,
    ui: raw.ui ? parseUiAssistant(raw.ui) : null
  };
};

const parseUnsupported = (value: unknown): AiUnsupportedResponse => {
  const raw = ensureObject(value);
  return {
    code: String(raw.code ?? "traditional_flow_only"),
    message: String(raw.message ?? ""),
    recommendations: ensureStringArray(raw.recommendations)
  };
};

const parseGenerationOutlineUnit = (value: unknown): AiGenerationOutlineUnit => {
  const raw = ensureObject(value);
  return {
    title: String(raw.title ?? ""),
    goal: String(raw.goal ?? ""),
    unitType: String(raw.unitType ?? "section") as AiGenerationOutlineUnit["unitType"],
    orderIndex: Number(raw.orderIndex ?? 0)
  };
};

const parseGenerationOutline = (value: unknown): AiGenerationOutline => {
  const raw = ensureObject(value);
  return {
    title: String(raw.title ?? ""),
    audience: String(raw.audience ?? ""),
    goal: String(raw.goal ?? ""),
    units: Array.isArray(raw.units) ? raw.units.map(parseGenerationOutlineUnit) : [],
    notes: ensureStringArray(raw.notes)
  };
};

const parseGenerationUnit = (value: unknown): AiGenerationUnit => {
  const raw = ensureObject(value);
  return {
    unitId: String(raw.unitId ?? ""),
    title: String(raw.title ?? ""),
    goal: String(raw.goal ?? ""),
    unitType: String(raw.unitType ?? "section") as AiGenerationUnit["unitType"],
    orderIndex: Number(raw.orderIndex ?? 0),
    status: String(raw.status ?? "queued") as AiGenerationUnit["status"],
    resultProposalId: raw.resultProposalId ? String(raw.resultProposalId) : undefined,
    errorMessage: raw.errorMessage ? String(raw.errorMessage) : undefined,
    artifact: raw.artifact ? parseGeneratedArtifact(raw.artifact) : undefined
  };
};

const parseGeneratedArtifact = (value: unknown): AiGeneratedArtifact => {
  const raw = ensureObject(value);
  return {
    artifactId: String(raw.artifactId ?? ""),
    unitId: String(raw.unitId ?? ""),
    artifactKind: String(raw.artifactKind ?? "section") as AiGeneratedArtifact["artifactKind"],
    title: String(raw.title ?? ""),
    summary: String(raw.summary ?? ""),
    node: ensureObject(raw.node) as unknown as VNode,
    notes: ensureStringArray(raw.notes),
    createdAt: String(raw.createdAt ?? "")
  };
};

const parseGenerationJob = (value: unknown): AiGenerationJob => {
  const raw = ensureObject(value);
  return {
    jobId: String(raw.jobId ?? ""),
    threadId: String(raw.threadId ?? ""),
    docId: String(raw.docId ?? ""),
    docType: String(raw.docType ?? ""),
    baseRevision: Number(raw.baseRevision ?? 0),
    flowType: String(raw.flowType ?? ""),
    goal: String(raw.goal ?? ""),
    status: String(raw.status ?? "queued") as AiGenerationJob["status"],
    outline: parseGenerationOutline(raw.outline),
    units: Array.isArray(raw.units) ? raw.units.map(parseGenerationUnit) : [],
    createdAt: String(raw.createdAt ?? ""),
    updatedAt: String(raw.updatedAt ?? "")
  };
};

const parseCreateGenerationJobResponse = (value: unknown): CreateGenerationJobResponse => {
  const raw = ensureObject(value);
  return {
    job: raw.job ? parseGenerationJob(raw.job) : null,
    unsupported: raw.unsupported ? parseUnsupported(raw.unsupported) : null,
    ui: raw.ui ? parseUiAssistant(raw.ui) : null
  };
};

const parseChartAskResponse = (value: unknown): AiChartAskResponse => {
  const raw = ensureObject(value);
  return {
    source: String(raw.source ?? "rule"),
    answer: String(raw.answer ?? ""),
    suggestions: ensureStringArray(raw.suggestions),
    plan: raw.plan ? (ensureObject(raw.plan) as unknown as CommandPlan) : null,
    planSummary: raw.planSummary ? String(raw.planSummary) : undefined
  };
};

const parseStorySummaryResponse = (value: unknown): AiStorySummaryResponse => {
  const raw = ensureObject(value);
  return {
    source: String(raw.source ?? "rule"),
    headline: String(raw.headline ?? ""),
    conclusion: String(raw.conclusion ?? ""),
    evidence: ensureStringArray(raw.evidence),
    advice: ensureStringArray(raw.advice),
    ui: raw.ui ? parseUiAssistant(raw.ui) : undefined
  };
};

const parseRuntimeAnalysisResponse = (value: unknown): AiRuntimeAnalysisResponse => {
  const raw = ensureObject(value);
  return {
    source: String(raw.source ?? "rule"),
    headline: String(raw.headline ?? ""),
    conclusion: String(raw.conclusion ?? ""),
    evidence: ensureStringArray(raw.evidence),
    advice: ensureStringArray(raw.advice),
    router: ensureObject(raw.router),
    plan: ensureObject(raw.plan),
    execution: ensureObject(raw.execution),
    ui: raw.ui ? parseUiAssistant(raw.ui) : undefined
  };
};

export class HttpAiOrchestrationRepository {
  constructor(private readonly baseUrl = "/ai-api/api/v1/ai/orch") {}

  async proposeEdit(input: ProposeEditRequest): Promise<ProposeEditResponse> {
    const response = await fetch(`${this.baseUrl}/edit/propose`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        threadId: input.threadId,
        docId: input.docId,
        docType: input.docType,
        userText: input.userText,
        baseRevision: input.baseRevision ?? 0,
        snapshotDsl: input.snapshotDsl,
        selectedObjectIds: input.selectedObjectIds ?? [],
        activeSectionId: input.activeSectionId,
        activeSlideId: input.activeSlideId,
        templateVariables: input.templateVariables ?? {}
      })
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseProposeEditResponse(payload);
  }

  async createGenerationJob(input: CreateGenerationJobRequest): Promise<CreateGenerationJobResponse> {
    const response = await fetch(`${this.baseUrl}/generate/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        threadId: input.threadId,
        docId: input.docId,
        docType: input.docType,
        baseRevision: input.baseRevision ?? 0,
        userText: input.userText,
        goal: input.goal,
        snapshotDsl: input.snapshotDsl,
        templateVariables: input.templateVariables ?? {}
      })
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseCreateGenerationJobResponse(payload);
  }

  async getGenerationJob(jobId: string): Promise<AiGenerationJob> {
    const response = await fetch(`${this.baseUrl}/generate/jobs/${encodeURIComponent(jobId)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json"
      }
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseGenerationJob(payload);
  }

  async runGenerationUnit(jobId: string, unitId: string): Promise<AiGenerationJob> {
    const response = await fetch(`${this.baseUrl}/generate/jobs/${encodeURIComponent(jobId)}/units/${encodeURIComponent(unitId)}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseGenerationJob(payload);
  }

  async askChart(input: AiChartAskRequest): Promise<AiChartAskResponse> {
    const response = await fetch("/ai-api/api/v1/ai/chart/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseChartAskResponse(payload);
  }

  async summarizeStory(input: AiStorySummaryRequest): Promise<AiStorySummaryResponse> {
    const response = await fetch("/ai-api/api/v1/ai/story/summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseStorySummaryResponse(payload);
  }

  async analyzeRuntime(input: AiRuntimeAnalysisRequest): Promise<AiRuntimeAnalysisResponse> {
    const response = await fetch(`${this.baseUrl}/runtime/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        threadId: input.threadId,
        docId: input.docId,
        docType: input.docType,
        question: input.question,
        selectedObjectIds: input.selectedObjectIds ?? [],
        activeSectionId: input.activeSectionId,
        activeSlideId: input.activeSlideId,
        lastResolvedObjectId: input.lastResolvedObjectId,
        templateVariables: input.templateVariables ?? {},
        candidateSources: input.candidateSources
      })
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const details = ensureObject(payload);
      const message = details.message ? String(details.message) : `HTTP ${response.status}`;
      throw new AiOrchestrationApiError(message, response.status, payload);
    }
    return parseRuntimeAnalysisResponse(payload);
  }
}
