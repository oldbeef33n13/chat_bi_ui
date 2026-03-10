import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateSchedulePanel } from "./TemplateSchedulePanel";

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

describe("TemplateSchedulePanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads schedule history and supports run now", async () => {
    const schedules = [
      {
        id: "schedule-report-1",
        templateId: "template-report-weekly",
        name: "日报导出",
        enabled: true,
        cronExpr: "0 0 9 * * *",
        timezone: "Asia/Shanghai",
        outputType: "report_docx",
        variables: { region: "north" },
        retentionDays: 7,
        nextTriggeredAt: "2026-03-10T01:00:00Z"
      }
    ];
    const runs = [
      {
        id: "run-report-1",
        triggerType: "scheduled",
        templateId: "template-report-weekly",
        scheduleJobId: "schedule-report-1",
        templateRevisionNo: 3,
        outputType: "report_docx",
        status: "succeeded",
        variables: { region: "north" },
        startedAt: "2026-03-09T01:00:00Z",
        createdAt: "2026-03-09T01:00:00Z",
        artifacts: [
          {
            id: "artifact-report-1",
            artifactType: "report_docx",
            fileName: "weekly-report.docx",
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            sizeBytes: 20480,
            createdAt: "2026-03-09T01:00:02Z",
            downloadUrl: "/files/artifacts/artifact-report-1"
          }
        ]
      }
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/schedules?templateId=template-report-weekly")) {
        return createJsonResponse(schedules);
      }
      if (url.includes("/api/v1/schedules/schedule-report-1/runs")) {
        return createJsonResponse(runs);
      }
      if (url.includes("/api/v1/schedules/schedule-report-1/run-now")) {
        runs.unshift({
          id: "run-report-2",
          triggerType: "schedule_run_now",
          templateId: "template-report-weekly",
          scheduleJobId: "schedule-report-1",
          templateRevisionNo: 3,
          outputType: "report_docx",
          status: "running",
          variables: { region: "north" },
          startedAt: "2026-03-09T02:00:00Z",
          createdAt: "2026-03-09T02:00:00Z",
          artifacts: []
        });
        return createJsonResponse({ runId: "run-report-2", status: "queued" });
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TemplateSchedulePanel
        open
        template={{ id: "template-report-weekly", name: "网络日报", docType: "report" }}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("日报导出")).toBeTruthy();
      expect(screen.getByText("weekly-report.docx")).toBeTruthy();
    });

    const artifactLink = screen.getByRole("link", { name: /weekly-report\.docx/i }) as HTMLAnchorElement;
    expect(artifactLink.href).toContain("/files/artifacts/artifact-report-1");

    fireEvent.click(screen.getByRole("button", { name: "立即执行" }));

    await waitFor(() => {
      expect(screen.getByText(/已触发执行/)).toBeTruthy();
      expect(screen.getByText(/触发方式: schedule_run_now/)).toBeTruthy();
    });
  });

  it("creates a new schedule for the current template", async () => {
    const schedules: Array<Record<string, unknown>> = [];
    let createPayload: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/schedules?templateId=template-dashboard-overview")) {
        return createJsonResponse(schedules);
      }
      if (url.includes("/api/v1/schedules") && init?.method === "POST") {
        createPayload = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        const created = {
          id: "schedule-dashboard-1",
          templateId: "template-dashboard-overview",
          name: String(createPayload.name ?? ""),
          enabled: Boolean(createPayload.enabled),
          cronExpr: String(createPayload.cronExpr ?? ""),
          timezone: String(createPayload.timezone ?? "Asia/Shanghai"),
          outputType: String(createPayload.outputType ?? "dashboard_snapshot_json"),
          variables: createPayload.variables ?? {},
          retentionDays: Number(createPayload.retentionDays ?? 30),
          nextTriggeredAt: "2026-03-10T01:00:00Z"
        };
        schedules.splice(0, schedules.length, created);
        return createJsonResponse(created);
      }
      if (url.includes("/api/v1/schedules/schedule-dashboard-1/runs")) {
        return createJsonResponse([]);
      }
      throw new Error(`unexpected fetch ${url} ${init?.method ?? "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TemplateSchedulePanel
        open
        template={{ id: "template-dashboard-overview", name: "监控总览", docType: "dashboard" }}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("当前模板共 0 个定时任务")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("任务名称"), { target: { value: "晨会快照" } });
    fireEvent.change(screen.getByLabelText("执行变量(JSON)"), { target: { value: '{"region":"north"}' } });
    fireEvent.change(screen.getByLabelText("保留天数"), { target: { value: "14" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(screen.getByText("已创建定时任务")).toBeTruthy();
      expect(screen.getByText("晨会快照")).toBeTruthy();
    });

    expect(createPayload).toMatchObject({
      templateId: "template-dashboard-overview",
      name: "晨会快照",
      outputType: "dashboard_snapshot_json",
      retentionDays: 14,
      variables: { region: "north" }
    });
  });
});
