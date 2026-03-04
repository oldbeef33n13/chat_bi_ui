import { describe, expect, it } from "vitest";
import { LocalDocRepository } from "./local-doc-repository";

describe("LocalDocRepository", () => {
  it("supports draft save and publish flow with revision checks", async () => {
    const repo = new LocalDocRepository();
    const created = await repo.createDoc({ docType: "dashboard", title: "测试文档" });
    const docId = created.meta.id;

    const draft1 = await repo.getDraftDoc(docId);
    draft1.doc.title = "测试文档 v2";
    const saved = await repo.saveDraft(docId, { doc: draft1.doc, baseRevision: draft1.revision });
    expect(saved.meta.status).toBe("draft");
    expect(saved.draft.revision).toBeGreaterThan(draft1.revision);

    await expect(
      repo.saveDraft(docId, {
        doc: saved.draft.doc,
        baseRevision: draft1.revision
      })
    ).rejects.toThrow();

    const published = await repo.publishDraft(docId, { fromDraftRevision: saved.draft.revision });
    expect(published.meta.status).toBe("published");
    expect(published.published.doc.title).toBe("测试文档 v2");
    expect(published.draft.revision).toBe(published.published.revision);
  });

  it("supports listing with filters and pagination", async () => {
    const repo = new LocalDocRepository();
    const page1 = await repo.listDocs({ type: "dashboard", page: 1, pageSize: 2 });
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(2);
    expect(page1.items.length).toBeLessThanOrEqual(2);
    page1.items.forEach((item) => expect(item.docType).toBe("dashboard"));
  });
});
