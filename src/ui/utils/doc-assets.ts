import type { AssetRef } from "../../core/doc/types";

export const upsertDocAsset = (assets: AssetRef[] | undefined, asset: AssetRef): AssetRef[] => {
  const next = [...(assets ?? []).filter((item) => item.assetId !== asset.assetId)];
  next.push(asset);
  return next;
};
