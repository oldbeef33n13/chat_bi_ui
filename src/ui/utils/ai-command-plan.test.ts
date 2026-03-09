import { describe, expect, it } from "vitest";
import { explainPlan, inferCommandPlan } from "./ai-command-plan";

describe("ai-command-plan utils", () => {
  it("infers chart update commands from text prompt", () => {
    const plan = inferCommandPlan("改成折线图并开启平滑和标签", "chart_1");
    expect(plan.commands.some((command) => command.type === "UpdateProps" && command.nodeId === "chart_1")).toBe(true);
    expect(plan.commands.length).toBeGreaterThanOrEqual(1);
  });

  it("renders explain text with command count", () => {
    const plan = inferCommandPlan("改成柱状图", "chart_2");
    const explain = explainPlan(plan);
    expect(explain).toContain("命令数");
    expect(explain).toContain("UpdateProps");
  });
});
