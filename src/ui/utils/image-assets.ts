import type { AssetRef, ImageProps, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";

export interface EmbeddedImageAsset {
  asset: AssetRef;
  width: number;
  height: number;
}

const readFileAsDataUrl = async (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("读取图片失败"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

const loadImageSize = async (src: string): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("解析图片尺寸失败"));
    image.onload = () => resolve({ width: image.naturalWidth || image.width, height: image.naturalHeight || image.height });
    image.src = src;
  });

export const buildEmbeddedImageAsset = async (file: File): Promise<EmbeddedImageAsset> => {
  const dataUrl = await readFileAsDataUrl(file);
  const { width, height } = await loadImageSize(dataUrl);
  return {
    asset: {
      assetId: prefixedId("asset"),
      type: "image",
      name: file.name,
      uri: dataUrl,
      meta: {
        mimeType: file.type,
        width,
        height,
        bytes: file.size
      }
    },
    width,
    height
  };
};

export const buildImageNode = ({
  assetId,
  title,
  layout
}: {
  assetId: string;
  title?: string;
  layout: NonNullable<VNode["layout"]>;
}): VNode<ImageProps> => ({
  id: prefixedId("image"),
  kind: "image",
  name: title ?? "图片",
  layout,
  props: {
    assetId,
    title: title ?? "图片",
    fit: "contain",
    opacity: 1
  }
});

