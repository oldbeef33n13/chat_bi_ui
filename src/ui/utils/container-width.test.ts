import { describe, expect, it } from "vitest";
import { resolveContainerWidth } from "./container-width";

/** 容器宽度归一化测试。 */
describe("resolveContainerWidth", () => {
  /** 无效宽度输入应回退默认值。 */
  it("falls back when value is invalid", () => {
    expect(resolveContainerWidth(undefined, 1200, 640)).toBe(1200);
    expect(resolveContainerWidth(-10, 1200, 640)).toBe(1200);
    expect(resolveContainerWidth("bad", 1200, 640)).toBe(1200);
  });

  /** 有效宽度应执行最小值限制并取整。 */
  it("clamps width to min and rounds finite values", () => {
    expect(resolveContainerWidth(500, 1200, 640)).toBe(640);
    expect(resolveContainerWidth(1199.4, 1200, 640)).toBe(1199);
    expect(resolveContainerWidth(1199.6, 1200, 640)).toBe(1200);
  });
});
