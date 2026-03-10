import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TemplateVariableDef } from "../../core/doc/types";
import type { EditorDocType } from "../api/doc-repository";
import { HttpScheduleRepository } from "../api/http-schedule-repository";
import type { ScheduleJobMeta, ScheduleOutputType, ScheduleRun, UpsertScheduleInput } from "../api/schedule-repository";
import { buildTemplateVariableDefaults } from "../utils/template-variables";

interface TemplateSchedulePanelProps {
  open: boolean;
  template?: {
    id: string;
    name: string;
    docType: EditorDocType;
    templateVariables?: TemplateVariableDef[];
    defaultVariables?: Record<string, unknown>;
  };
  onClose: () => void;
}

interface ScheduleDraft {
  id?: string;
  name: string;
  enabled: boolean;
  cronExpr: string;
  timezone: string;
  outputType: ScheduleOutputType;
  variablesText: string;
  retentionDays: string;
}

const defaultOutputTypeByDocType: Record<EditorDocType, ScheduleOutputType> = {
  dashboard: "dashboard_snapshot_json",
  report: "report_docx",
  ppt: "ppt_pptx"
};

const defaultNameByDocType: Record<EditorDocType, string> = {
  dashboard: "Dashboard 定时快照",
  report: "Report 定时导出",
  ppt: "PPT 定时导出"
};

const outputLabelMap: Record<ScheduleOutputType, string> = {
  dashboard_snapshot_json: "Dashboard 快照 JSON",
  report_docx: "Word 文档 (.docx)",
  ppt_pptx: "PowerPoint (.pptx)"
};

const safeJsonParse = <T,>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

const formatStamp = (value?: string): string => {
  if (!value) {
    return "--";
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("zh-CN", { hour12: false });
};

const formatBytes = (value: number): string => {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const getRunStatusChipClass = (status: ScheduleRun["status"]): string => {
  if (status === "succeeded") {
    return "status-published";
  }
  if (status === "failed") {
    return "status-error";
  }
  return "status-neutral";
};

const createDefaultDraft = (template: TemplateSchedulePanelProps["template"]): ScheduleDraft => ({
  name: template ? defaultNameByDocType[template.docType] : "",
  enabled: true,
  cronExpr: "0 0 9 * * *",
  timezone: "Asia/Shanghai",
  outputType: template ? defaultOutputTypeByDocType[template.docType] : "dashboard_snapshot_json",
  variablesText: JSON.stringify(template?.defaultVariables ?? buildTemplateVariableDefaults(template?.templateVariables), null, 2),
  retentionDays: "30"
});

const toDraft = (schedule: ScheduleJobMeta): ScheduleDraft => ({
  id: schedule.id,
  name: schedule.name,
  enabled: schedule.enabled,
  cronExpr: schedule.cronExpr,
  timezone: schedule.timezone,
  outputType: schedule.outputType,
  variablesText: JSON.stringify(schedule.variables ?? {}, null, 2),
  retentionDays: String(schedule.retentionDays)
});

const toPayload = (templateId: string, draft: ScheduleDraft): UpsertScheduleInput => ({
  templateId,
  name: draft.name.trim(),
  enabled: draft.enabled,
  cronExpr: draft.cronExpr.trim(),
  timezone: draft.timezone.trim() || "Asia/Shanghai",
  outputType: draft.outputType,
  variables: safeJsonParse<Record<string, unknown>>(draft.variablesText, {}),
  retentionDays: Math.max(1, Number(draft.retentionDays || "30") || 30)
});

export function TemplateSchedulePanel({ open, template, onClose }: TemplateSchedulePanelProps): JSX.Element | null {
  const repo = useMemo(() => new HttpScheduleRepository("/api/v1"), []);
  const variablesInputId = "schedule_variables_text";
  const [schedules, setSchedules] = useState<ScheduleJobMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState<ScheduleDraft>(() => createDefaultDraft(template));
  const [runs, setRuns] = useState<ScheduleRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionHint, setActionHint] = useState("");
  const refreshRunsTimerRef = useRef<number | null>(null);

  const refreshRuns = async (scheduleId = selectedId): Promise<void> => {
    if (!scheduleId) {
      setRuns([]);
      return;
    }
    setRunsLoading(true);
    try {
      const nextRuns = await repo.listRuns(scheduleId, 20);
      setRuns(nextRuns);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
      setRuns([]);
    } finally {
      setRunsLoading(false);
    }
  };

  const refreshSchedules = async (targetId?: string): Promise<void> => {
    if (!template) {
      return;
    }
    setLoading(true);
    setActionError("");
    try {
      const nextSchedules = await repo.listSchedules(template.id);
      setSchedules(nextSchedules);
      const nextSelectedId =
        targetId && nextSchedules.some((item) => item.id === targetId)
          ? targetId
          : selectedId && nextSchedules.some((item) => item.id === selectedId)
            ? selectedId
            : nextSchedules[0]?.id;
      if (nextSelectedId) {
        const selected = nextSchedules.find((item) => item.id === nextSelectedId);
        setSelectedId(nextSelectedId);
        if (selected) {
          setDraft(toDraft(selected));
        }
      } else {
        setSelectedId(undefined);
        setDraft(createDefaultDraft(template));
        setRuns([]);
      }
    } catch (error) {
      setSchedules([]);
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !template) {
      return;
    }
    void refreshSchedules();
  }, [open, template?.id]);

  useEffect(() => {
    if (!open || !template) {
      return;
    }
    if (!selectedId) {
      setRuns([]);
      return;
    }
    void refreshRuns(selectedId);
  }, [open, selectedId, template?.id]);

  useEffect(() => {
    if (!open) {
      setActionError("");
      setActionHint("");
      if (refreshRunsTimerRef.current !== null) {
        window.clearTimeout(refreshRunsTimerRef.current);
        refreshRunsTimerRef.current = null;
      }
    }
  }, [open]);

  useEffect(
    () => () => {
      if (refreshRunsTimerRef.current !== null) {
        window.clearTimeout(refreshRunsTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || !template) {
    return null;
  }

  const selectedSchedule = schedules.find((item) => item.id === selectedId);

  const resetNew = (): void => {
    setSelectedId(undefined);
    setDraft(createDefaultDraft(template));
    setRuns([]);
    setActionError("");
    setActionHint("");
  };

  const selectSchedule = (schedule: ScheduleJobMeta): void => {
    setSelectedId(schedule.id);
    setDraft(toDraft(schedule));
    setActionError("");
    setActionHint("");
  };

  const saveSchedule = async (): Promise<void> => {
    setSaving(true);
    setActionError("");
    setActionHint("");
    try {
      const payload = toPayload(template.id, draft);
      const saved = draft.id ? await repo.updateSchedule(draft.id, payload) : await repo.createSchedule(payload);
      await refreshSchedules(saved.id);
      setDraft(toDraft(saved));
      setSelectedId(saved.id);
      setActionHint(draft.id ? "已更新定时任务" : "已创建定时任务");
      await refreshRuns(saved.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async (): Promise<void> => {
    if (!draft.id) {
      setActionError("请先保存任务，再触发执行");
      return;
    }
    setRunning(true);
    setActionError("");
    setActionHint("");
    try {
      const result = await repo.runNow(draft.id);
      setActionHint(`已触发执行 · ${result.runId}`);
      await refreshSchedules(draft.id);
      await refreshRuns(draft.id);
      if (refreshRunsTimerRef.current !== null) {
        window.clearTimeout(refreshRunsTimerRef.current);
      }
      refreshRunsTimerRef.current = window.setTimeout(() => {
        void refreshRuns(draft.id);
      }, 1200);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  return createPortal(
    <div className="overlay-shell" role="presentation">
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className="schedule-panel" role="dialog" aria-modal="true" aria-label="定时任务管理">
        <div className="schedule-panel-header row">
          <div className="col" style={{ gap: 2 }}>
            <strong>定时任务 · {template.name}</strong>
            <span className="muted">
              {template.docType} · 输出 {outputLabelMap[defaultOutputTypeByDocType[template.docType]]}
            </span>
          </div>
          <div className="row">
            <button className="btn" onClick={resetNew}>
              新建任务
            </button>
            <button className="btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="schedule-panel-body">
          <section className="schedule-list">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>任务列表</strong>
              <button className="btn mini-btn" onClick={() => void refreshSchedules(selectedId)}>
                刷新
              </button>
            </div>
            <div className="muted">当前模板共 {schedules.length} 个定时任务</div>
            {loading ? <div className="muted">加载中...</div> : null}
            <div className="schedule-list-scroll">
              {schedules.map((item) => (
                <button key={item.id} className={`schedule-item ${selectedId === item.id ? "active" : ""}`} onClick={() => selectSchedule(item)}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{item.name}</strong>
                    <span className="chip">{item.enabled ? "启用" : "停用"}</span>
                  </div>
                  <div className="muted">{item.cronExpr}</div>
                  <div className="muted">下次执行: {formatStamp(item.nextTriggeredAt)}</div>
                </button>
              ))}
              {!loading && schedules.length === 0 ? <div className="muted">还没有定时任务，先创建一个。</div> : null}
            </div>
          </section>
          <section className="schedule-editor">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{draft.id ? `编辑任务 · ${draft.id}` : "新建任务"}</strong>
              <div className="row">
                <button className="btn" onClick={() => void refreshRuns()} disabled={!selectedId || runsLoading}>
                  {runsLoading ? "刷新中..." : "刷新历史"}
                </button>
                <button className="btn" onClick={() => void runNow()} disabled={running || !draft.id}>
                  {running ? "执行中..." : "立即执行"}
                </button>
                <button className="btn primary" onClick={() => void saveSchedule()} disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
            {actionError ? <div className="chip" style={{ color: "#b91c1c" }}>{actionError}</div> : null}
            {actionHint ? <div className="chip">{actionHint}</div> : null}
            <div className="schedule-form">
              <label className="col">
                <span>任务名称</span>
                <input className="input" value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
              </label>
              <label className="col">
                <span>Cron 表达式</span>
                <input className="input" value={draft.cronExpr} onChange={(event) => setDraft((prev) => ({ ...prev, cronExpr: event.target.value }))} />
              </label>
              <label className="col">
                <span>时区</span>
                <input className="input" value={draft.timezone} onChange={(event) => setDraft((prev) => ({ ...prev, timezone: event.target.value }))} />
              </label>
              <label className="col">
                <span>输出文件</span>
                <select
                  className="select"
                  value={draft.outputType}
                  onChange={(event) => setDraft((prev) => ({ ...prev, outputType: event.target.value as ScheduleOutputType }))}
                >
                  <option value={defaultOutputTypeByDocType[template.docType]}>{outputLabelMap[defaultOutputTypeByDocType[template.docType]]}</option>
                </select>
              </label>
              <label className="col">
                <span>保留天数</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={draft.retentionDays}
                  onChange={(event) => setDraft((prev) => ({ ...prev, retentionDays: event.target.value }))}
                />
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((prev) => ({ ...prev, enabled: event.target.checked }))} />
                <span>启用任务</span>
              </label>
              <div className="schedule-panel-note">Cron 使用 Spring 六段格式：秒 分 时 日 月 周，例如 `0 0 9 * * *` 代表每天 09:00。</div>
              <label className="col schedule-form-wide" htmlFor={variablesInputId}>
                <span>执行变量(JSON)</span>
                <textarea
                  id={variablesInputId}
                  aria-label="执行变量(JSON)"
                  className="textarea code-textarea"
                  value={draft.variablesText}
                  onChange={(event) => setDraft((prev) => ({ ...prev, variablesText: event.target.value }))}
                />
                <span className="muted">
                  这里填写的是任务运行时变量，会覆盖模板默认值；设计器测试仍使用模板默认值、系统变量和筛选默认值。
                </span>
              </label>
            </div>
            <div className="schedule-history">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>执行历史</strong>
                {selectedSchedule ? <span className="chip">下次执行: {formatStamp(selectedSchedule.nextTriggeredAt)}</span> : null}
              </div>
              <div className="schedule-run-list">
                {runsLoading ? <div className="muted">执行历史加载中...</div> : null}
                {!runsLoading && runs.length === 0 ? <div className="muted">暂无执行历史</div> : null}
                {runs.map((run) => (
                  <article key={run.id} className="schedule-run-card">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong>{run.outputType}</strong>
                      <span className={`chip ${getRunStatusChipClass(run.status)}`}>{run.status}</span>
                    </div>
                    <div className="muted">
                      触发方式: {run.triggerType} · 开始 {formatStamp(run.startedAt ?? run.createdAt)}
                    </div>
                    {run.errorMessage ? <div className="chip" style={{ color: "#b91c1c" }}>{run.errorMessage}</div> : null}
                    <div className="schedule-run-artifacts">
                      {run.artifacts.map((artifact) => (
                        <a
                          key={artifact.id}
                          className="schedule-artifact-link"
                          href={artifact.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <strong>{artifact.fileName}</strong>
                          <span className="muted">
                            {artifact.artifactType} · {formatBytes(artifact.sizeBytes)}
                          </span>
                        </a>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        </div>
      </aside>
    </div>,
    document.body
  );
}
