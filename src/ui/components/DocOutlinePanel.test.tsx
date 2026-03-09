import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import type { VDoc } from "../../core/doc/types";
import { createPptDoc, createReportDoc } from "../../core/doc/defaults";
import { EditorProvider, useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { DocOutlinePanel } from "./DocOutlinePanel";

function DocObserver({ onDoc }: { onDoc: (doc: VDoc) => void }): null {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  useEffect(() => {
    if (doc) {
      onDoc(doc);
    }
  }, [doc, onDoc]);
  return null;
}

describe("DocOutlinePanel structure ops", () => {
  it("supports report section insert/copy/remove in outline", async () => {
    let latestDoc = createReportDoc();
    const { container } = render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DocOutlinePanel />
      </EditorProvider>
    );

    expect(screen.getByText(/2 节点/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /\+章节/ }));
    await waitFor(() => {
      const sectionCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "section").length;
      expect(sectionCount).toBe(3);
    });

    const topMenuWraps = (): HTMLDivElement[] =>
      Array.from(container.querySelectorAll<HTMLDivElement>(".outline-item:not(.sublevel) .outline-more-wrap"));
    const topMenus = (): HTMLButtonElement[] =>
      Array.from(container.querySelectorAll<HTMLButtonElement>(".outline-item:not(.sublevel) .outline-more-btn"));

    // 悬停预览：移入显示，移出关闭
    expect(screen.queryByRole("button", { name: "下方插入章节" })).toBeNull();
    fireEvent.mouseEnter(topMenuWraps()[0]!);
    expect(screen.queryByRole("button", { name: "下方插入章节" })).toBeTruthy();
    fireEvent.mouseLeave(topMenuWraps()[0]!);
    expect(screen.queryByRole("button", { name: "下方插入章节" })).toBeNull();

    // 点击锁定：移出不关闭，再次点击关闭
    fireEvent.click(topMenus()[0]!);
    expect(screen.queryByRole("button", { name: "下方插入章节" })).toBeTruthy();
    fireEvent.mouseLeave(topMenuWraps()[0]!);
    expect(screen.queryByRole("button", { name: "下方插入章节" })).toBeTruthy();
    fireEvent.click(topMenus()[0]!);
    expect(screen.queryByRole("button", { name: "下方插入章节" })).toBeNull();

    fireEvent.click(topMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "下方插入章节" }));
    await waitFor(() => {
      const sectionCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "section").length;
      expect(sectionCount).toBe(4);
    });

    fireEvent.click(topMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "复制章节" }));
    await waitFor(() => {
      const sectionCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "section").length;
      expect(sectionCount).toBe(5);
    });

    fireEvent.click(topMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    const reportRenameInput = screen.getByPlaceholderText("请输入标题");
    fireEvent.change(reportRenameInput, { target: { value: "重命名章节A" } });
    fireEvent.keyDown(reportRenameInput, { key: "Enter" });
    await waitFor(() => {
      const renamed = String((((latestDoc.root.children ?? [])[0]?.props as Record<string, unknown> | undefined)?.title ?? ""));
      expect(renamed).toBe("重命名章节A");
    });

    fireEvent.click(topMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "删除章节" }));
    await waitFor(() => {
      const sectionCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "section").length;
      expect(sectionCount).toBe(4);
    });

    fireEvent.click(topMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "新增子章节" }));
    await waitFor(() => {
      const top = (latestDoc.root.children ?? []).filter((item) => item.kind === "section")[0];
      const subCount = (top?.children ?? []).filter((item) => item.kind === "section").length;
      expect(subCount).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(topMenus()[1]!);
    fireEvent.click(screen.getByRole("button", { name: "新增子章节" }));
    await waitFor(() => {
      const sections = (latestDoc.root.children ?? []).filter((item) => item.kind === "section");
      const subCountA = (sections[0]?.children ?? []).filter((item) => item.kind === "section").length;
      const subCountB = (sections[1]?.children ?? []).filter((item) => item.kind === "section").length;
      expect(subCountA).toBeGreaterThanOrEqual(1);
      expect(subCountB).toBeGreaterThanOrEqual(1);
    });

    // 子章节跨章节拖拽换位
    const subDragButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".outline-item.sublevel .outline-main"));
    expect(subDragButtons.length).toBeGreaterThanOrEqual(2);
    const sectionsBeforeSubMove = (latestDoc.root.children ?? []).filter((item) => item.kind === "section");
    const sourceSubId = (sectionsBeforeSubMove[0]?.children ?? []).find((item) => item.kind === "section")?.id;
    const targetParentId = sectionsBeforeSubMove[1]?.id;
    fireEvent.dragStart(subDragButtons[0]!);
    fireEvent.dragOver(subDragButtons[1]!);
    fireEvent.drop(subDragButtons[1]!);
    await waitFor(() => {
      const sections = (latestDoc.root.children ?? []).filter((item) => item.kind === "section");
      const owner = sections.find((section) => (section.children ?? []).some((item) => item.id === sourceSubId));
      expect(owner?.id).toBe(targetParentId);
    });

    // 顶层章节拖拽换位
    const dragButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".outline-item:not(.sublevel) .outline-main"));
    expect(dragButtons.length).toBeGreaterThanOrEqual(2);
    const firstId = (latestDoc.root.children ?? [])[0]?.id;
    const secondId = (latestDoc.root.children ?? [])[1]?.id;
    fireEvent.dragStart(dragButtons[1]!);
    fireEvent.dragOver(dragButtons[0]!);
    fireEvent.drop(dragButtons[0]!);
    await waitFor(() => {
      const rootSections = (latestDoc.root.children ?? []).filter((item) => item.kind === "section");
      expect(rootSections[0]?.id).toBe(secondId);
      expect(rootSections[1]?.id).toBe(firstId);
    });
  });

  it("supports ppt slide insert/copy/remove in outline", async () => {
    let latestDoc = createPptDoc();
    const { container } = render(
      <EditorProvider initialDoc={latestDoc}>
        <DocObserver
          onDoc={(doc) => {
            latestDoc = structuredClone(doc);
          }}
        />
        <DocOutlinePanel />
      </EditorProvider>
    );

    expect(screen.getByText(/1 页/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /\+页面/ }));
    await waitFor(() => {
      const slideCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "slide").length;
      expect(slideCount).toBe(2);
    });

    const slideMenus = (): HTMLButtonElement[] => Array.from(container.querySelectorAll<HTMLButtonElement>(".outline-item .outline-more-btn"));

    fireEvent.click(slideMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "复制页面" }));
    await waitFor(() => {
      const slideCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "slide").length;
      expect(slideCount).toBe(3);
    });

    fireEvent.click(slideMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "重命名" }));
    const pptRenameInput = screen.getByPlaceholderText("请输入标题");
    fireEvent.change(pptRenameInput, { target: { value: "重命名页面A" } });
    fireEvent.keyDown(pptRenameInput, { key: "Enter" });
    await waitFor(() => {
      const firstSlide = (latestDoc.root.children ?? []).filter((item) => item.kind === "slide")[0];
      const title = String(((firstSlide?.props as Record<string, unknown> | undefined)?.title ?? ""));
      expect(title).toBe("重命名页面A");
    });

    fireEvent.click(slideMenus()[0]!);
    fireEvent.click(screen.getByRole("button", { name: "删除页面" }));
    await waitFor(() => {
      const slideCount = (latestDoc.root.children ?? []).filter((item) => item.kind === "slide").length;
      expect(slideCount).toBe(2);
    });

    const slideButtons = Array.from(container.querySelectorAll<HTMLButtonElement>(".outline-main"));
    expect(slideButtons.length).toBeGreaterThanOrEqual(2);
    const firstSlideId = (latestDoc.root.children ?? [])[0]?.id;
    const secondSlideId = (latestDoc.root.children ?? [])[1]?.id;
    fireEvent.dragStart(slideButtons[1]!);
    fireEvent.dragOver(slideButtons[0]!);
    fireEvent.drop(slideButtons[0]!);
    await waitFor(() => {
      const slides = (latestDoc.root.children ?? []).filter((item) => item.kind === "slide");
      expect(slides[0]?.id).toBe(secondSlideId);
      expect(slides[1]?.id).toBe(firstSlideId);
    });
  });
});
