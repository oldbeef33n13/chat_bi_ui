import type { ImageProps, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";

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
