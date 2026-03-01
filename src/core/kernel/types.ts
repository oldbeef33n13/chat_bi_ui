import type { CommandPlan, CommandResult, PatchOp } from "../doc/types";

export type Actor = "ui" | "ai";

export interface SelectionState {
  primaryId?: string;
  selectedIds: string[];
  hoveredId?: string;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  actor: Actor;
  summary: string;
  patches: PatchOp[];
  inversePatches: PatchOp[];
}

export interface AuditEntry {
  id: string;
  actor: Actor;
  at: string;
  summary: string;
  commandPlan?: CommandPlan;
  changedPaths: string[];
}

export interface CommandExecutionOptions {
  actor?: Actor;
  summary?: string;
  mergeWindowMs?: number;
}

export interface DryRunResult extends CommandResult {
  changedPaths: string[];
}
