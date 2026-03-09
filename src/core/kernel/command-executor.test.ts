import { describe, expect, it } from "vitest";
import { createDashboardDoc } from "../doc/defaults";
import { applyPatches } from "../doc/patch";
import { executeCommands } from "./command-executor";

describe("executeCommands ApplyTheme", () => {
  it("creates style object when applying selection theme on node without style", () => {
    const doc = createDashboardDoc();
    const nodeId = doc.root.children?.[0]?.id;
    expect(nodeId).toBeTruthy();
    const result = executeCommands(
      doc,
      [{ type: "ApplyTheme", scope: "selection", themeId: "theme.tech.dark" }],
      { selectedIds: [nodeId!] }
    );
    const next = applyPatches(doc, result.patches);
    const node = next.root.children?.find((item) => item.id === nodeId);
    expect((node?.style as Record<string, unknown> | undefined)?.tokenId).toBe("theme.tech.dark");
  });

  it("replaces invalid style shape before writing tokenId", () => {
    const doc = createDashboardDoc();
    const nodeId = doc.root.children?.[0]?.id;
    expect(nodeId).toBeTruthy();
    const node = doc.root.children?.find((item) => item.id === nodeId);
    if (node) {
      // 模拟历史坏数据：style 被污染成非对象。
      (node as unknown as { style: unknown }).style = "bad-style-shape";
    }
    const result = executeCommands(
      doc,
      [{ type: "ApplyTheme", scope: "selection", themeId: "theme.business.light" }],
      { selectedIds: [nodeId!] }
    );
    const next = applyPatches(doc, result.patches);
    const patched = next.root.children?.find((item) => item.id === nodeId);
    expect(typeof patched?.style).toBe("object");
    expect((patched?.style as Record<string, unknown> | undefined)?.tokenId).toBe("theme.business.light");
  });
});
