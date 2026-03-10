import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDashboardDoc, createPptDoc, createReportDoc } from "../core/doc/defaults";
import { App } from "./App";

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

describe("App library integrations", () => {
  beforeEach(() => {
    window.location.hash = "#/docs";
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.location.hash = "";
    window.sessionStorage.clear();
  });

  it("opens schedule panel from template cards", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v1/templates/seeds")) {
        return createJsonResponse({
          items: [
            {
              id: "template-report-weekly",
              templateType: "report",
              name: "网络日报模板",
              description: "日报示例",
              tags: ["report", "seed"]
            }
          ]
        });
      }
      if (url.includes("/api/v1/templates?")) {
        return createJsonResponse({
          items: [
            {
              id: "template-report-weekly",
              templateType: "report",
              name: "网络日报",
              description: "日报模板",
              tags: ["ops"],
              updatedAt: "2026-03-09T01:00:00Z",
              currentRevision: 3
            }
          ],
          total: 1,
          page: 1,
          pageSize: 20
        });
      }
      if (url.includes("/api/v1/schedules?templateId=template-report-weekly")) {
        return createJsonResponse([]);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("网络日报")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "定时任务" }));

    await waitFor(() => {
      expect(screen.getByText("定时任务 · 网络日报")).toBeTruthy();
    });
  });

  it("creates templates from blank and seed flows", async () => {
    let createPayload: Record<string, unknown> | null = null;
    const createdDoc = createReportDoc();
    createdDoc.docId = "template-created-1";
    createdDoc.title = "新建模板";
    createdDoc.dataSources = [];
    createdDoc.queries = [];
    createdDoc.filters = [];
    createdDoc.root.children = [
      {
        id: "section-1",
        kind: "section",
        props: { title: "新建章节" },
        children: []
      }
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/templates/seeds")) {
        return createJsonResponse({
          items: [
            {
              id: "template-report-weekly",
              templateType: "report",
              name: "网络周报",
              description: "标准周报示例",
              tags: ["report", "seed"]
            }
          ]
        });
      }
      if (url.includes("/api/v1/templates?")) {
        return createJsonResponse({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20
        });
      }
      if (url.endsWith("/api/v1/templates") && init?.method === "POST") {
        createPayload = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            meta: {
              id: "template-created-1",
              templateType: createPayload.templateType,
              name: createPayload.name ?? "新建模板",
              description: "新建模板",
              tags: [String(createPayload.templateType ?? "report")],
              updatedAt: "2026-03-09T01:00:00Z",
              currentRevision: 1
            },
            content: {
              dsl: { ...createdDoc, docType: createPayload.templateType },
              revision: 1
            }
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/api/v1/templates/template-created-1")) {
        return createJsonResponse({
          id: "template-created-1",
          templateType: "report",
          name: "新建模板",
          description: "新建模板",
          tags: ["report"],
          updatedAt: "2026-03-09T01:00:00Z",
          currentRevision: 1
        });
      }
      if (url.endsWith("/api/v1/templates/template-created-1/content")) {
        return createJsonResponse({ dsl: createdDoc, revision: 1 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建模板 ▾" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "新建模板 ▾" }));
    await waitFor(() => {
      expect(screen.getByText("空白创建")).toBeTruthy();
      expect(screen.getByText("从示例创建")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /空白报告/i }));
    await waitFor(() => {
      expect(createPayload).toMatchObject({
        templateType: "report"
      });
    });
  });

  it("creates templates from selected seed templates", async () => {
    let createPayload: Record<string, unknown> | null = null;
    const createdDoc = createPptDoc();
    createdDoc.docId = "template-created-seed";
    createdDoc.title = "网络运营汇报";
    createdDoc.dataSources = [];
    createdDoc.queries = [];
    createdDoc.filters = [];
    createdDoc.root.children = [
      {
        id: "slide-1",
        kind: "slide",
        props: { title: "新建页面" },
        children: [],
        layout: { mode: "absolute", x: 0, y: 0, w: 960, h: 540 }
      }
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/v1/templates/seeds")) {
        return createJsonResponse({
          items: [
            {
              id: "template-ppt-review",
              templateType: "ppt",
              name: "网络运营汇报",
              description: "适合周会例会的双页汇报模板",
              tags: ["ppt", "seed"]
            }
          ]
        });
      }
      if (url.includes("/api/v1/templates?")) {
        return createJsonResponse({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20
        });
      }
      if (url.endsWith("/api/v1/templates") && init?.method === "POST") {
        createPayload = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            meta: {
              id: "template-created-seed",
              templateType: "ppt",
              name: "网络运营汇报",
              description: "新建模板",
              tags: ["ppt"],
              updatedAt: "2026-03-09T01:00:00Z",
              currentRevision: 1
            },
            content: {
              dsl: createdDoc,
              revision: 1
            }
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.endsWith("/api/v1/templates/template-created-seed")) {
        return createJsonResponse({
          id: "template-created-seed",
          templateType: "ppt",
          name: "网络运营汇报",
          description: "新建模板",
          tags: ["ppt"],
          updatedAt: "2026-03-09T01:00:00Z",
          currentRevision: 1
        });
      }
      if (url.endsWith("/api/v1/templates/template-created-seed/content")) {
        return createJsonResponse({ dsl: createdDoc, revision: 1 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "新建模板 ▾" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "新建模板 ▾" }));
    await waitFor(() => {
      expect(screen.getByText("网络运营汇报")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /网络运营汇报/i }));

    await waitFor(() => {
      expect(createPayload).toMatchObject({
        templateType: "ppt",
        seedTemplateId: "template-ppt-review"
      });
    });
  });

  it("supports detail runtime variables, preview, and export download", async () => {
    window.location.hash = "#/docs/template-report-weekly";
    const reportDoc = createReportDoc();
    reportDoc.title = "网络日报";
    reportDoc.templateVariables = [
      {
        key: "region",
        label: "区域",
        type: "string",
        defaultValue: "north"
      }
    ];
    reportDoc.root.children = [
      {
        id: "section_runtime_report",
        kind: "section",
        props: { title: "总览" },
        children: [{ id: "text_runtime_report", kind: "text", props: { text: "发布版内容", format: "plain" } }]
      }
    ];

    const previewDoc = structuredClone(reportDoc);
    previewDoc.root.children = [
      {
        id: "section_runtime_preview",
        kind: "section",
        props: { title: "动态预览" },
        children: [{ id: "text_runtime_preview", kind: "text", props: { text: "动态预览 south", format: "plain" } }]
      }
    ];

    let previewPayload: Record<string, unknown> | null = null;
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/templates?")) {
        return createJsonResponse({
          items: [
            {
              id: "template-report-weekly",
              templateType: "report",
              name: "网络日报",
              description: "日报模板",
              tags: ["ops"],
              updatedAt: "2026-03-09T01:00:00Z",
              currentRevision: 3
            }
          ],
          total: 1,
          page: 1,
          pageSize: 20
        });
      }
      if (url.endsWith("/api/v1/templates/template-report-weekly")) {
        return createJsonResponse({
          id: "template-report-weekly",
          templateType: "report",
          name: "网络日报",
          description: "日报模板",
          tags: ["ops"],
          updatedAt: "2026-03-09T01:00:00Z",
          currentRevision: 3
        });
      }
      if (url.endsWith("/api/v1/templates/template-report-weekly/content")) {
        return createJsonResponse({ dsl: reportDoc, revision: 3 });
      }
      if (url.endsWith("/api/v1/templates/template-report-weekly/preview")) {
        previewPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return createJsonResponse({
          templateId: "template-report-weekly",
          revision: 3,
          snapshot: previewDoc,
          resolvedVariables: { region: "south" }
        });
      }
      if (url.endsWith("/api/v1/templates/template-report-weekly/exports")) {
        return createJsonResponse({ runId: "run-report-1", status: "queued" });
      }
      if (url.endsWith("/api/v1/runs/run-report-1")) {
        return createJsonResponse({
          id: "run-report-1",
          triggerType: "manual_export",
          templateId: "template-report-weekly",
          templateRevisionNo: 3,
          outputType: "report_docx",
          status: "succeeded",
          variables: { region: "south" },
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
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("发布版内容")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "运行变量" }));
    fireEvent.change(screen.getByLabelText("区域"), { target: { value: "south" } });
    fireEvent.click(screen.getByRole("button", { name: "动态预览" }));

    await waitFor(() => {
      expect(screen.getByText("动态预览 south")).toBeTruthy();
      expect(screen.getByText("region=south")).toBeTruthy();
    });

    expect(previewPayload).toMatchObject({
      variables: { region: "south" }
    });

    fireEvent.click(screen.getByRole("button", { name: "生成并下载" }));

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith("/files/artifacts/artifact-report-1", "_blank", "noopener,noreferrer");
      expect(screen.getByRole("link", { name: /weekly-report\.docx/i })).toBeTruthy();
    });
  });

  it("publishes current edits directly from edit mode", async () => {
    window.location.hash = "#/docs/template-dashboard-edit/edit";
    const dashboardDoc = createDashboardDoc();
    dashboardDoc.title = "旧大盘标题";
    dashboardDoc.root.children = [];
    dashboardDoc.dataSources = [];
    dashboardDoc.queries = [];
    dashboardDoc.filters = [];

    let currentMeta = {
      id: "template-dashboard-edit",
      templateType: "dashboard",
      name: "旧大盘标题",
      description: "可编辑大盘",
      tags: ["ops"],
      updatedAt: "2026-03-09T01:00:00Z",
      currentRevision: 3
    };
    let currentDoc = structuredClone(dashboardDoc);
    let publishPayload: Record<string, unknown> | null = null;

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/templates?")) {
        return createJsonResponse({
          items: [currentMeta],
          total: 1,
          page: 1,
          pageSize: 20
        });
      }
      if (url.endsWith("/api/v1/templates/template-dashboard-edit")) {
        return createJsonResponse(currentMeta);
      }
      if (url.endsWith("/api/v1/templates/template-dashboard-edit/content")) {
        return createJsonResponse({ dsl: currentDoc, revision: currentMeta.currentRevision });
      }
      if (url.endsWith("/api/v1/templates/template-dashboard-edit/publish")) {
        publishPayload = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        currentDoc = structuredClone(publishPayload.dsl as typeof currentDoc);
        currentMeta = {
          ...currentMeta,
          name: String((currentDoc.title ?? "").toString()),
          updatedAt: "2026-03-09T03:00:00Z",
          currentRevision: 4
        };
        return createJsonResponse({
          meta: currentMeta,
          content: {
            dsl: currentDoc,
            revision: 4
          }
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("文档标题")).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText("文档标题"), { target: { value: "新的大盘标题" } });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    await waitFor(() => {
      expect(publishPayload).toMatchObject({
        baseRevision: 3,
        dsl: {
          title: "新的大盘标题"
        }
      });
      expect(screen.getByText("已发布当前改动")).toBeTruthy();
    });
  });

  it("surfaces api errors without switching to a local fallback", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("templates api down");
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("templates api down")).toBeTruthy();
    });

    expect(screen.queryByText(/本地兜底/)).toBeNull();
  });
});
