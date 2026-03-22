import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportDoc } from "../../core/doc/defaults";
import type { RouteState } from "../app/shared";
import type { TemplateRuntimeRepository } from "../api/template-runtime-repository";
import type { TemplateContent, TemplateMeta, TemplateRepository } from "../api/template-repository";
import { useTemplateDetailController } from "./use-template-detail-controller";

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value)
  };
}

function DetailControllerProbe({
  route,
  repo,
  runtimeRepo
}: {
  route: RouteState;
  repo: TemplateRepository;
  runtimeRepo: TemplateRuntimeRepository;
}): JSX.Element {
  const controller = useTemplateDetailController({
    route,
    docs: [],
    repo,
    runtimeRepo
  });

  useEffect(() => {
    void controller.detailLoading;
  }, [controller.detailLoading]);

  return (
    <div>
      <div data-testid="detail-record">{controller.currentRecord?.id ?? ""}</div>
      <div data-testid="detail-doc-title">{controller.detail?.content.doc.title ?? ""}</div>
      <div data-testid="detail-loading">{controller.detailLoading ? "loading" : "idle"}</div>
      <div data-testid="detail-error">{controller.detailError ?? ""}</div>
    </div>
  );
}

describe("useTemplateDetailController", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("keeps the latest detail response when routes switch quickly", async () => {
    const metaA = createDeferred<TemplateMeta>();
    const contentA = createDeferred<TemplateContent>();
    const metaB = createDeferred<TemplateMeta>();
    const contentB = createDeferred<TemplateContent>();

    const repo = {
      source: "api",
      listTemplates: vi.fn(),
      getTemplateMeta: vi.fn((templateId: string) => (templateId === "doc-a" ? metaA.promise : metaB.promise)),
      getTemplateContent: vi.fn((templateId: string) => (templateId === "doc-a" ? contentA.promise : contentB.promise)),
      listTemplateRevisions: vi.fn(),
      restoreTemplateRevision: vi.fn(),
      listSeedTemplates: vi.fn(),
      createTemplate: vi.fn(),
      publishTemplate: vi.fn()
    } satisfies TemplateRepository;
    const runtimeRepo = {
      previewTemplate: vi.fn(),
      exportTemplate: vi.fn(),
      getRun: vi.fn()
    } satisfies TemplateRuntimeRepository;

    const docA = createReportDoc();
    docA.docId = "doc-a";
    docA.title = "文档 A";
    const docB = createReportDoc();
    docB.docId = "doc-b";
    docB.title = "文档 B";

    const view = render(
      <DetailControllerProbe route={{ page: "detail", docId: "doc-a", mode: "view" }} repo={repo} runtimeRepo={runtimeRepo} />
    );

    view.rerender(<DetailControllerProbe route={{ page: "detail", docId: "doc-b", mode: "view" }} repo={repo} runtimeRepo={runtimeRepo} />);

    metaB.resolve({
      id: "doc-b",
      docType: "report",
      name: "文档 B",
      description: "B",
      tags: [],
      updatedAt: "2026-03-22T00:00:00Z",
      currentRevision: 2
    });
    contentB.resolve({
      doc: docB,
      revision: 2
    });

    await waitFor(() => {
      expect(screen.getByTestId("detail-record").textContent).toBe("doc-b");
      expect(screen.getByTestId("detail-doc-title").textContent).toBe("文档 B");
    });

    metaA.resolve({
      id: "doc-a",
      docType: "report",
      name: "文档 A",
      description: "A",
      tags: [],
      updatedAt: "2026-03-22T00:00:00Z",
      currentRevision: 1
    });
    contentA.resolve({
      doc: docA,
      revision: 1
    });

    await waitFor(() => {
      expect(screen.getByTestId("detail-record").textContent).toBe("doc-b");
      expect(screen.getByTestId("detail-doc-title").textContent).toBe("文档 B");
      expect(screen.getByTestId("detail-error").textContent).toBe("");
    });
  });
});
