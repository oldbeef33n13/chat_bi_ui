import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpAssetRepository } from "./http-asset-repository";

const createJsonResponse = (payload: unknown): Response =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });

describe("HttpAssetRepository", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uploads image assets and maps them to asset refs", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({
        id: "asset_image_1",
        assetType: "image",
        name: "network-topology",
        mimeType: "image/png",
        originalFileName: "topology.png",
        fileExt: "png",
        sizeBytes: 2048,
        widthPx: 1280,
        heightPx: 720,
        sha256: "abc123",
        createdAt: "2026-03-09T02:00:00Z",
        fileUrl: "/files/assets/asset_image_1"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const repo = new HttpAssetRepository("/api/v1");
    const uploaded = await repo.uploadImage(new File(["demo"], "topology.png", { type: "image/png" }));

    expect(fetchMock).toHaveBeenCalled();
    expect(uploaded).toMatchObject({
      width: 1280,
      height: 720,
      asset: {
        assetId: "asset_image_1",
        type: "image",
        uri: "/files/assets/asset_image_1"
      }
    });
  });
});
