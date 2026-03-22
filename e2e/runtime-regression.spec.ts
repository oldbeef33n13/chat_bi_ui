import { expect, test, type Page } from "@playwright/test";

const captureEndpointRequests = (page: Page): Set<string> => {
  const seen = new Set<string>();
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/v1/data-endpoints/")) {
      seen.add(url);
    }
  });
  return seen;
};

const expectRuntimeLoadingFinished = async (page: Page): Promise<void> => {
  await expect(page.locator("text=远程数据加载中")).toHaveCount(0, { timeout: 15_000 });
};

test.describe.serial("runtime regressions", () => {
  test("dashboard detail loads current runtime data on first open", async ({ page }) => {
    const requests = captureEndpointRequests(page);

    await page.goto("/#/docs/template-dashboard-overview");

    await expect(page.locator("[data-testid^='runtime-dashboard-node-']").first()).toBeVisible();
    await expect
      .poll(() => [...requests].some((url) => url.includes("/api/v1/data-endpoints/ops_alarm_trend/test")), { timeout: 15_000 })
      .toBe(true);
    await expectRuntimeLoadingFinished(page);
  });

  test("report detail loads current runtime data on first open", async ({ page }) => {
    const requests = captureEndpointRequests(page);

    await page.goto("/#/docs/template-report-weekly");

    await expect(page.locator("[data-testid^='runtime-report-node-']").first()).toBeVisible();
    await expect
      .poll(() => [...requests].some((url) => url.includes("/api/v1/data-endpoints/ops_alarm_trend/test")), { timeout: 15_000 })
      .toBe(true);
    await expectRuntimeLoadingFinished(page);
  });

  test("ppt detail loads current slide data and keeps absolute layout", async ({ page }) => {
    const requests = captureEndpointRequests(page);

    await page.goto("/#/docs/template-ppt-review");

    await expect(page.locator("[data-testid^='runtime-ppt-node-']").first()).toBeVisible();
    await expect
      .poll(
        () =>
          [...requests].some((url) => url.includes("/api/v1/data-endpoints/ops_alarm_trend/test")) &&
          [...requests].some((url) => url.includes("/api/v1/data-endpoints/ops_region_health/test")),
        { timeout: 15_000 }
      )
      .toBe(true);
    await expectRuntimeLoadingFinished(page);

    const nodes = await page.locator("[data-testid^='runtime-ppt-node-']").evaluateAll((items) =>
      items.map((item) => ({
        top: item instanceof HTMLElement ? item.style.top : "",
        left: item instanceof HTMLElement ? item.style.left : "",
        position: item instanceof HTMLElement ? item.style.position : ""
      }))
    );

    expect(nodes).toEqual([
      { top: "28px", left: "36px", position: "absolute" },
      { top: "92px", left: "36px", position: "absolute" },
      { top: "92px", left: "492px", position: "absolute" }
    ]);
  });
});
