import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TemplateMeta } from "../api/template-repository";
import { CopilotLibraryPanel } from "./CopilotLibraryPanel";

const templates: TemplateMeta[] = [
  {
    id: "report_weekly",
    docType: "report",
    name: "经营周报模板",
    description: "适合管理层周报汇报",
    tags: ["周报", "经营"],
    updatedAt: "2026-03-14T08:00:00Z",
    currentRevision: 3,
    canEdit: true
  },
  {
    id: "dash_ops",
    docType: "dashboard",
    name: "运维总览 Dashboard",
    description: "核心指标与告警概览",
    tags: ["dashboard", "运维"],
    updatedAt: "2026-03-12T08:00:00Z",
    currentRevision: 5,
    canEdit: true
  }
];

describe("CopilotLibraryPanel", () => {
  afterEach(() => {
    window.location.hash = "";
  });

  it("lists matching templates and jumps to edit on click", async () => {
    render(<CopilotLibraryPanel templates={templates} />);

    fireEvent.click(screen.getByRole("button", { name: "找周报模板" }));

    await waitFor(() => expect(screen.getByText("经营周报模板")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "进入编辑" }));

    expect(window.location.hash).toBe("#/docs/report_weekly/edit");
  });
});
