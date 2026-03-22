import { expect, test } from "@playwright/test";

test.describe.serial("full stack smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.open = () => null;
    });
  });

  test("loads backend templates, manages schedules, exports a report, and opens ppt edit mode", async ({ page }) => {
    await page.goto("/#/docs");

    const dashboardCard = page.locator("article.doc-card").filter({ hasText: "网络运维总览" });
    const reportCard = page.locator("article.doc-card").filter({ hasText: "网络周报" });
    const pptCard = page.locator("article.doc-card").filter({ hasText: "网络运营汇报" });

    await expect(dashboardCard).toBeVisible();
    await expect(reportCard).toBeVisible();
    await expect(pptCard).toBeVisible();

    await page.getByRole("button", { name: "数据接口" }).click();
    const endpointDialog = page.getByRole("dialog", { name: "数据接口管理" });
    await expect(endpointDialog).toBeVisible();
    await expect(endpointDialog.getByText("告警趋势")).toBeVisible();
    await endpointDialog.getByRole("button", { name: "关闭" }).click();
    await expect(endpointDialog).toBeHidden();

    await dashboardCard.getByRole("button", { name: "定时任务" }).click();
    const scheduleDialog = page.getByRole("dialog", { name: "定时任务管理" });
    await expect(scheduleDialog.getByText("定时任务 · 网络运维总览")).toBeVisible();
    await scheduleDialog.getByRole("button", { name: "保存" }).click();
    await expect(scheduleDialog.getByText(/已(创建|更新)定时任务/)).toBeVisible();
    await scheduleDialog.getByRole("button", { name: "立即执行" }).click();
    await expect(scheduleDialog.getByText(/已触发执行/)).toBeVisible();
    await expect(scheduleDialog.locator(".schedule-artifact-link").filter({ hasText: ".json" }).first()).toBeVisible();
    await scheduleDialog.getByRole("button", { name: "关闭" }).click();

    await reportCard.getByRole("button", { name: "查看详情" }).click();
    await expect(page.getByRole("button", { name: "生成并下载" })).toBeVisible();
    await page.getByRole("button", { name: "生成并下载" }).click();
    await expect(page.getByText("最近导出")).toBeVisible();
    await expect(page.locator(".runtime-artifact-link").filter({ hasText: ".docx" })).toHaveCount(1);
    await page.getByRole("button", { name: "返回列表" }).click();

    await pptCard.getByRole("button", { name: "进入编辑" }).click();
    await expect(page.getByRole("button", { name: "发布", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "返回运行态" })).toBeVisible();
    await expect(page.getByText("与发布版本一致")).toBeVisible();
    await expect(page.locator("[data-testid^='ppt-slide-canvas-']")).toBeVisible();
  });
});
