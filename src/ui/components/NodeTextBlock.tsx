import type { CSSProperties } from "react";
import type { TextProps, VNode } from "../../core/doc/types";
import { resolveTextContainerStyle, resolveTextContentStyle } from "../utils/node-style";

export function NodeTextBlock({
  node,
  className = "",
  style
}: {
  node: VNode;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const text = String((node.props as TextProps | undefined)?.text ?? "");
  return (
    <div className={`node-text-block ${className}`.trim()} style={resolveTextContainerStyle(node.style, style)}>
      <div className="node-text-block-content" style={resolveTextContentStyle(node.style)}>
        {text}
      </div>
    </div>
  );
}
