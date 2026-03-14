import { signal } from "@preact/signals-react";
import { applyPatches, getAtPath } from "../doc/patch";
import { validateCommandPlan, validateDoc } from "../doc/validator";
import type { Command, CommandPlan, PatchOp, VDoc } from "../doc/types";
import { executeCommands, guessChangedNodeIds, type ExecutorContext } from "./command-executor";
import type { Actor, AuditEntry, CommandExecutionOptions, DryRunResult, HistoryEntry, SelectionState } from "./types";
import { randomUUID } from "../utils/id";

const clone = <T>(value: T): T => structuredClone(value);

const nowIso = (): string => new Date().toISOString();

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
      return false;
    }
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
};

const collectDiffPaths = (baseline: unknown, current: unknown, path = ""): string[] => {
  if (deepEqual(baseline, current)) {
    return [];
  }
  if (Array.isArray(baseline) && Array.isArray(current)) {
    const maxLength = Math.max(baseline.length, current.length);
    const next = Array.from({ length: maxLength }, (_, index) =>
      collectDiffPaths(baseline[index], current[index], `${path}/${index}`)
    ).flat();
    return next.length > 0 ? next : [path || "/"];
  }
  if (isObject(baseline) && isObject(current)) {
    const keys = [...new Set([...Object.keys(baseline), ...Object.keys(current)])];
    const next = keys.flatMap((key) => collectDiffPaths(baseline[key], current[key], `${path}/${key}`));
    return next.length > 0 ? next : [path || "/"];
  }
  return [path || "/"];
};

const normalizeTrackedPath = (path: string): string => {
  if (!path || path === "/") {
    return "/";
  }
  const parts = path.split("/").slice(1);
  const last = parts[parts.length - 1];
  if (last !== undefined && (/^\d+$/.test(last) || last === "-")) {
    const parent = parts.slice(0, -1).join("/");
    return parent ? `/${parent}` : "/";
  }
  return path;
};

const pathsOverlap = (left: string, right: string): boolean =>
  left === right || left === "/" || right === "/" || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);

const valueAtTrackedPath = (doc: VDoc, path: string): unknown => (path === "/" ? doc : getAtPath(doc, path));

const trackedPathsFromPatches = (patches: PatchOp[]): string[] =>
  [...new Set(patches.flatMap((patch) => [patch.path, patch.from].filter(Boolean) as string[]).map(normalizeTrackedPath))];

interface EditorUiState {
  dashboardInsertPanelOpen: boolean;
  dashboardRecentInsertItemIds: string[];
  reportInsertPanelOpen: boolean;
  reportRecentInsertItemIds: string[];
  pptInsertPanelOpen: boolean;
  pptRecentInsertItemIds: string[];
}

/**
 * 编辑器状态核心：
 * 1) 管理文档与选区；
 * 2) 执行命令并维护 undo/redo；
 * 3) 支持 CommandPlan 预览/接受/拒绝；
 * 4) 输出审计日志。
 */
export class EditorStore {
  readonly baseRevision: number;
  readonly doc = signal<VDoc | null>(null);
  readonly docRevision = signal(0);
  readonly isDirty = signal(false);
  readonly selection = signal<SelectionState>({ selectedIds: [] });
  readonly historyPast = signal<HistoryEntry[]>([]);
  readonly historyFuture = signal<HistoryEntry[]>([]);
  readonly auditLogs = signal<AuditEntry[]>([]);
  readonly pendingPlan = signal<CommandPlan | null>(null);
  readonly pendingPlanDryRun = signal<DryRunResult | null>(null);
  readonly lastError = signal<string | null>(null);
  private baselineDoc: VDoc;
  private readonly dirtyPaths = new Set<string>();
  readonly ui = signal<EditorUiState>({
    dashboardInsertPanelOpen: false,
    dashboardRecentInsertItemIds: [],
    reportInsertPanelOpen: false,
    reportRecentInsertItemIds: [],
    pptInsertPanelOpen: false,
    pptRecentInsertItemIds: []
  });

  constructor(
    initialDoc: VDoc,
    private readonly context: ExecutorContext = { selectedIds: [] },
    baselineDoc?: VDoc,
    baseRevision = 0
  ) {
    // 构造时即校验初始文档，避免无效状态进入运行期。
    const validation = validateDoc(initialDoc);
    if (!validation.ok) {
      throw new Error(`Invalid initial doc: ${validation.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`);
    }
    this.baseRevision = baseRevision;
    this.baselineDoc = clone(baselineDoc ?? initialDoc);
    const nextDoc = clone(initialDoc);
    this.doc.value = nextDoc;
    this.docRevision.value = 1;
    this.resetDirtyState(nextDoc);
  }

  setDoc(nextDoc: VDoc): void {
    // setDoc 是“硬重置”语义：替换文档并清空历史/预览态。
    const validation = validateDoc(nextDoc);
    if (!validation.ok) {
      this.lastError.value = validation.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ") ?? "invalid doc";
      return;
    }
    const nextSnapshot = clone(nextDoc);
    this.doc.value = nextSnapshot;
    this.docRevision.value += 1;
    this.baselineDoc = clone(nextSnapshot);
    this.dirtyPaths.clear();
    this.isDirty.value = false;
    this.historyPast.value = [];
    this.historyFuture.value = [];
    this.selection.value = { selectedIds: [] };
    this.pendingPlan.value = null;
      this.pendingPlanDryRun.value = null;
      this.lastError.value = null;
    this.ui.value = {
      dashboardInsertPanelOpen: false,
      dashboardRecentInsertItemIds: [...this.ui.value.dashboardRecentInsertItemIds],
      reportInsertPanelOpen: false,
      reportRecentInsertItemIds: [...this.ui.value.reportRecentInsertItemIds],
      pptInsertPanelOpen: false,
      pptRecentInsertItemIds: [...this.ui.value.pptRecentInsertItemIds]
    };
  }

  clearError(): void {
    this.lastError.value = null;
  }

  setSelection(nodeId: string, multi = false): void {
    const current = this.selection.value;
    if (!multi) {
      if (current.primaryId === nodeId && current.selectedIds.length === 1 && current.selectedIds[0] === nodeId) {
        return;
      }
      this.selection.value = {
        primaryId: nodeId,
        selectedIds: [nodeId],
        hoveredId: current.hoveredId
      };
      return;
    }
    const selected = new Set(current.selectedIds);
    if (selected.has(nodeId)) {
      selected.delete(nodeId);
    } else {
      selected.add(nodeId);
    }
    const selectedIds = [...selected];
    this.selection.value = {
      primaryId: selectedIds[selectedIds.length - 1],
      selectedIds,
      hoveredId: current.hoveredId
    };
  }

  setSelectionIds(nodeIds: string[], primaryId?: string): void {
    const current = this.selection.value;
    const selectedIds = [...new Set(nodeIds.filter(Boolean))];
    const nextPrimaryId =
      selectedIds.length === 0 ? undefined : selectedIds.includes(primaryId ?? "") ? primaryId : selectedIds[selectedIds.length - 1];
    const sameSelection =
      current.primaryId === nextPrimaryId &&
      current.selectedIds.length === selectedIds.length &&
      current.selectedIds.every((id, index) => id === selectedIds[index]);
    if (sameSelection) {
      return;
    }
    this.selection.value = {
      primaryId: nextPrimaryId,
      selectedIds,
      hoveredId: current.hoveredId
    };
  }

  setHover(nodeId?: string): void {
    const current = this.selection.value;
    if (current.hoveredId === nodeId) {
      return;
    }
    this.selection.value = { ...current, hoveredId: nodeId };
  }

  clearSelection(): void {
    if (this.selection.value.selectedIds.length === 0 && !this.selection.value.primaryId && !this.selection.value.hoveredId) {
      return;
    }
    this.selection.value = { selectedIds: [] };
  }

  setDashboardInsertPanelOpen(open: boolean): void {
    this.ui.value = { ...this.ui.value, dashboardInsertPanelOpen: open };
  }

  toggleDashboardInsertPanel(): void {
    this.setDashboardInsertPanelOpen(!this.ui.value.dashboardInsertPanelOpen);
  }

  rememberDashboardInsertItem(itemId: string): void {
    const recentIds = [itemId, ...this.ui.value.dashboardRecentInsertItemIds.filter((id) => id !== itemId)].slice(0, 6);
    this.ui.value = { ...this.ui.value, dashboardRecentInsertItemIds: recentIds };
  }

  setReportInsertPanelOpen(open: boolean): void {
    this.ui.value = { ...this.ui.value, reportInsertPanelOpen: open };
  }

  toggleReportInsertPanel(): void {
    this.setReportInsertPanelOpen(!this.ui.value.reportInsertPanelOpen);
  }

  rememberReportInsertItem(itemId: string): void {
    const recentIds = [itemId, ...this.ui.value.reportRecentInsertItemIds.filter((id) => id !== itemId)].slice(0, 6);
    this.ui.value = { ...this.ui.value, reportRecentInsertItemIds: recentIds };
  }

  setPptInsertPanelOpen(open: boolean): void {
    this.ui.value = { ...this.ui.value, pptInsertPanelOpen: open };
  }

  togglePptInsertPanel(): void {
    this.setPptInsertPanelOpen(!this.ui.value.pptInsertPanelOpen);
  }

  rememberPptInsertItem(itemId: string): void {
    const recentIds = [itemId, ...this.ui.value.pptRecentInsertItemIds.filter((id) => id !== itemId)].slice(0, 6);
    this.ui.value = { ...this.ui.value, pptRecentInsertItemIds: recentIds };
  }

  executeCommand(command: Command, options: CommandExecutionOptions = {}): boolean {
    return this.executeCommands([command], options);
  }

  executeCommands(commands: Command[], options: CommandExecutionOptions = {}): boolean {
    if (!this.doc.value) {
      return false;
    }
    this.lastError.value = null;
    try {
      // 执行前注入当前选区，便于命令执行器处理 selection scope。
      this.context.selectedIds = [...this.selection.value.selectedIds];
      const result = executeCommands(this.doc.value, commands, this.context);
      if (result.patches.length === 0) {
        return true;
      }
      this.doc.value = applyPatches(this.doc.value, result.patches);
      this.docRevision.value += 1;
      this.captureDocMutation(result.patches);
      this.pushHistory(
        {
          id: randomUUID(),
          createdAt: Date.now(),
          actor: options.actor ?? "ui",
          summary: options.summary ?? result.summary ?? commands.map((cmd) => cmd.type).join(", "),
          patches: result.patches,
          inversePatches: result.inversePatches
        },
        options.mergeWindowMs
      );
      this.historyFuture.value = [];
      // 每次成功执行都写一条审计日志，供回溯和问题定位。
      this.auditLogs.value = [
        {
          id: randomUUID(),
          actor: options.actor ?? "ui",
          at: nowIso(),
          summary: options.summary ?? result.summary ?? commands.map((cmd) => cmd.type).join(", "),
          changedPaths: result.patches.map((p) => p.path)
        },
        ...this.auditLogs.value
      ];
      return true;
    } catch (error) {
      this.lastError.value = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  previewPlan(planTextOrObject: string | CommandPlan): boolean {
    if (!this.doc.value) {
      return false;
    }
    this.lastError.value = null;
    try {
      const plan = typeof planTextOrObject === "string" ? (JSON.parse(planTextOrObject) as CommandPlan) : planTextOrObject;
      // 先做 schema 校验，再 dry-run，避免非法计划污染状态。
      const validation = validateCommandPlan(plan);
      if (!validation.ok) {
        this.lastError.value = validation.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ") ?? "invalid plan";
        return false;
      }
      this.context.selectedIds = [...this.selection.value.selectedIds];
      const result = executeCommands(this.doc.value, plan.commands, this.context);
      const changedNodeIds = guessChangedNodeIds(this.doc.value, result.patches);
      this.pendingPlan.value = plan;
      this.pendingPlanDryRun.value = {
        ...result,
        changedPaths: result.patches.map((p) => p.path),
        summary: plan.preview?.summary ?? plan.explain ?? result.summary,
        sideEffects: result.sideEffects
      };
      if (!this.pendingPlan.value.preview) {
        // 兜底自动生成 preview，便于前端无需依赖模型也能展示 Diff 摘要。
        this.pendingPlan.value.preview = {
          summary: this.pendingPlanDryRun.value.summary,
          expectedChangedNodeIds: changedNodeIds,
          risk: result.patches.length > 10 ? "medium" : "low"
        };
      }
      return true;
    } catch (error) {
      this.lastError.value = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  acceptPreview(actor: Actor = "ai"): boolean {
    if (!this.pendingPlan.value) {
      return false;
    }
    const ok = this.executeCommands(this.pendingPlan.value.commands, {
      actor,
      summary: this.pendingPlan.value.explain ?? this.pendingPlan.value.preview?.summary ?? "apply command plan"
    });
    if (!ok) {
      return false;
    }
    this.auditLogs.value = [
      {
        id: randomUUID(),
        actor,
        at: nowIso(),
        summary: `accept preview: ${this.pendingPlan.value.explain ?? this.pendingPlan.value.intent}`,
        commandPlan: clone(this.pendingPlan.value),
        changedPaths: this.pendingPlanDryRun.value?.changedPaths ?? []
      },
      ...this.auditLogs.value
    ];
    this.pendingPlan.value = null;
    this.pendingPlanDryRun.value = null;
    return true;
  }

  rejectPreview(): void {
    if (this.pendingPlan.value) {
      this.auditLogs.value = [
        {
          id: randomUUID(),
          actor: "ai",
          at: nowIso(),
          summary: `reject preview: ${this.pendingPlan.value.explain ?? this.pendingPlan.value.intent}`,
          commandPlan: clone(this.pendingPlan.value),
          changedPaths: []
        },
        ...this.auditLogs.value
      ];
    }
    this.pendingPlan.value = null;
    this.pendingPlanDryRun.value = null;
  }

  undo(): boolean {
    if (!this.doc.value || this.historyPast.value.length === 0) {
      return false;
    }
    const entry = this.historyPast.value[0];
    if (!entry) {
      return false;
    }
    const rest = this.historyPast.value.slice(1);
    this.doc.value = applyPatches(this.doc.value, entry.inversePatches);
    this.docRevision.value += 1;
    this.captureDocMutation(entry.inversePatches);
    this.historyPast.value = rest;
    this.historyFuture.value = [entry, ...this.historyFuture.value];
    this.auditLogs.value = [
      {
        id: randomUUID(),
        actor: "ui",
        at: nowIso(),
        summary: `undo: ${entry.summary}`,
        changedPaths: entry.inversePatches.map((p) => p.path)
      },
      ...this.auditLogs.value
    ];
    return true;
  }

  redo(): boolean {
    if (!this.doc.value || this.historyFuture.value.length === 0) {
      return false;
    }
    const entry = this.historyFuture.value[0];
    if (!entry) {
      return false;
    }
    const rest = this.historyFuture.value.slice(1);
    this.doc.value = applyPatches(this.doc.value, entry.patches);
    this.docRevision.value += 1;
    this.captureDocMutation(entry.patches);
    this.historyFuture.value = rest;
    this.historyPast.value = [entry, ...this.historyPast.value];
    this.auditLogs.value = [
      {
        id: randomUUID(),
        actor: "ui",
        at: nowIso(),
        summary: `redo: ${entry.summary}`,
        changedPaths: entry.patches.map((p) => p.path)
      },
      ...this.auditLogs.value
    ];
    return true;
  }

  private pushHistory(entry: HistoryEntry, mergeWindowMs = 0): void {
    // mergeWindow 用于输入类操作（如文本编辑）的历史压缩，减少 undo 粒度噪音。
    if (mergeWindowMs > 0 && this.historyPast.value.length > 0) {
      const latest = this.historyPast.value[0];
      const rest = this.historyPast.value.slice(1);
      if (!latest) {
        this.historyPast.value = [entry, ...this.historyPast.value];
        return;
      }
      if (entry.createdAt - latest.createdAt <= mergeWindowMs && latest.actor === entry.actor) {
        const merged: HistoryEntry = {
          ...latest,
          createdAt: entry.createdAt,
          summary: entry.summary,
          patches: [...latest.patches, ...entry.patches],
          inversePatches: [...entry.inversePatches, ...latest.inversePatches]
        };
        this.historyPast.value = [merged, ...rest];
        return;
      }
    }
    this.historyPast.value = [entry, ...this.historyPast.value];
  }

  private resetDirtyState(nextDoc: VDoc): void {
    this.dirtyPaths.clear();
    collectDiffPaths(this.baselineDoc, nextDoc)
      .map(normalizeTrackedPath)
      .forEach((path) => this.dirtyPaths.add(path));
    this.isDirty.value = this.dirtyPaths.size > 0;
  }

  private captureDocMutation(patches: PatchOp[]): void {
    if (!this.doc.value) {
      return;
    }
    const candidatePaths = new Set<string>(trackedPathsFromPatches(patches));
    this.dirtyPaths.forEach((path) => {
      if ([...candidatePaths].some((candidate) => pathsOverlap(candidate, path))) {
        candidatePaths.add(path);
      }
    });
    candidatePaths.forEach((path) => {
      if (deepEqual(valueAtTrackedPath(this.baselineDoc, path), valueAtTrackedPath(this.doc.value!, path))) {
        this.dirtyPaths.delete(path);
        return;
      }
      this.dirtyPaths.add(path);
    });
    this.isDirty.value = this.dirtyPaths.size > 0;
  }
}
