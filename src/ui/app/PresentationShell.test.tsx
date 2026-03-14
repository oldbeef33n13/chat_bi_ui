import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createBuiltInDoc } from "../../core/doc/examples";
import { PresentationPage } from "./PresentationShell";

vi.mock("../components/DocRuntimeView", () => ({
  DocRuntimeView: () => <div data-testid="mock-runtime-view">runtime</div>
}));

describe("PresentationPage", () => {
  it("keeps runtime variables inside the hidden presentation toolbar", () => {
    const doc = createBuiltInDoc("dashboard", "dashboard.noc");
    const onVariableChange = vi.fn();
    const onApplyVariables = vi.fn();

    render(
      <PresentationPage
        record={{
          id: "tpl_1",
          name: "网络运维总览",
          docType: "dashboard",
          description: "test",
          currentRevision: 3,
          updatedAt: "2026-03-10T00:00:00Z",
          tags: [],
          canEdit: true,
          canPublish: true
        }}
        doc={doc}
        variableDefs={[
          {
            key: "bizDate",
            label: "统计日期",
            type: "date",
            required: true
          }
        ]}
        variableValues={{ bizDate: "2026-03-10" }}
        resolvedVariables={{ bizDate: "2026-03-10" }}
        onVariableChange={onVariableChange}
        onApplyVariables={onApplyVariables}
        onBack={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "运行参数" }));
    expect(screen.getByLabelText("统计日期 *")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("统计日期 *"), { target: { value: "2026-03-11" } });
    expect(onVariableChange).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "更新预览" }));
    expect(onApplyVariables).toHaveBeenCalledTimes(1);
  });
});
