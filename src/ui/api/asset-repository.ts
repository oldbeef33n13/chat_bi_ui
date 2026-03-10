import type { AssetRef } from "../../core/doc/types";

export interface UploadedImageAsset {
  asset: AssetRef;
  width: number;
  height: number;
}

export interface AssetRepository {
  uploadImage(file: File): Promise<UploadedImageAsset>;
}
