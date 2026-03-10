import type { AssetRef } from "../../core/doc/types";
import { DocApiError } from "./doc-repository";
import type { AssetRepository, UploadedImageAsset } from "./asset-repository";

const ensureObject = (value: unknown): Record<string, unknown> => (value && typeof value === "object" ? (value as Record<string, unknown>) : {});

const parseImageAsset = (value: unknown): UploadedImageAsset => {
  const raw = ensureObject(value);
  const width = Number(raw.widthPx ?? 0);
  const height = Number(raw.heightPx ?? 0);
  return {
    asset: {
      assetId: String(raw.id ?? ""),
      type: "image",
      name: String(raw.name ?? raw.originalFileName ?? "图片"),
      uri: String(raw.fileUrl ?? ""),
      meta: {
        mimeType: raw.mimeType === undefined ? undefined : String(raw.mimeType),
        width,
        height,
        bytes: Number(raw.sizeBytes ?? 0),
        originalFileName: raw.originalFileName === undefined ? undefined : String(raw.originalFileName)
      }
    },
    width,
    height
  };
};

export class HttpAssetRepository implements AssetRepository {
  constructor(private readonly baseUrl = "/api/v1") {}

  async uploadImage(file: File): Promise<UploadedImageAsset> {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch(`${this.baseUrl}/assets/images`, {
      method: "POST",
      body
    });
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const message = ensureObject(payload).message ? String(ensureObject(payload).message) : `HTTP ${response.status}`;
      throw new DocApiError(message, response.status, payload);
    }
    return parseImageAsset(payload);
  }
}
