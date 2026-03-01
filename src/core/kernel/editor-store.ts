import { signal } from "@preact/signals-react";
import { applyPatches } from "../doc/patch";
import { validateCommandPlan, validateDoc } from "../doc/validator";
import type { Command, CommandPlan, VDoc } from "../doc/types";
import { executeCommands, guessChangedNodeIds, type ExecutorContext } from "./command-executor";
import type { Actor, AuditEntry, CommandExecutionOptions, DryRunResult, HistoryEntry, SelectionState } from "./types";
import { randomUUID } from "../utils/id";

const clone = <T>(value: T): T => structuredClone(value);

const nowIso = (): string => new Date().toISOString();

export class EditorStore {
  readonly doc = signal<VDoc | null>(null);
  readonly selection = signal<SelectionState>({ selectedIds: [] });
  readonly historyPast = signal<HistoryEntry[]>([]);
  readonly historyFuture = signal<HistoryEntry[]>([]);
  readonly auditLogs = signal<AuditEntry[]>([]);
  readonly pendingPlan = signal<CommandPlan | null>(null);
  readonly pendingPlanDryRun = signal<DryRunResult | null>(null);
  readonly lastError = signal<string | null>(null);

  constructor(
    initialDoc: VDoc,
    private readonly context: ExecutorContext = { selectedIds: [] }
  ) {
    const validation = validateDoc(initialDoc);
    if (!validation.ok) {
      throw new Error(`Invalid initial doc: ${validation.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`);
    }
    this.doc.value = clone(initialDoc);
  }

  setDoc(nextDoc: VDoc): void {
    const validation = validateDoc(nextDoc);
    if (!validation.ok) {
      this.lastError.value = validation.errors?.map((e) => `${e.instancePath} ${e.message}`).join("; ") ?? "invalid doc";
      return;
    }
    this.doc.value = clone(nextDoc);
    this.historyPast.value = [];
    this.historyFuture.value = [];
    this.selection.value = { selectedIds: [] };
    this.pendingPlan.value = null;
    this.pendingPlanDryRun.value = null;
    this.lastError.value = null;
  }

  clearError(): void {
    this.lastError.value = null;
  }

  setSelection(nodeId: string, multi = false): void {
    const current = this.selection.value;
    if (!multi) {
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

  setHover(nodeId?: string): void {
    const current = this.selection.value;
    this.selection.value = { ...current, hoveredId: nodeId };
  }

  clearSelection(): void {
    this.selection.value = { selectedIds: [] };
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
      this.context.selectedIds = [...this.selection.value.selectedIds];
      const result = executeCommands(this.doc.value, commands, this.context);
      if (result.patches.length === 0) {
        return true;
      }
      this.doc.value = applyPatches(this.doc.value, result.patches);
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
}
