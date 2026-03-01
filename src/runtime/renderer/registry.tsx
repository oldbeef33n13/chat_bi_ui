import type { ReactNode } from "react";
import type { VNode } from "../../core/doc/types";
import { EChartView } from "../chart/EChartView";

export interface RenderContext {
  getRows: (node: VNode) => Array<Record<string, unknown>>;
}

export type NodeRenderer = (node: VNode, ctx: RenderContext) => ReactNode;

export class RendererRegistry {
  private readonly map = new Map<string, NodeRenderer>();

  register(kind: string, renderer: NodeRenderer): void {
    this.map.set(kind, renderer);
  }

  render(node: VNode, ctx: RenderContext): ReactNode {
    const renderer = this.map.get(node.kind);
    if (renderer) {
      return renderer(node, ctx);
    }
    return <div className="muted">unsupported node: {node.kind}</div>;
  }
}

export const createDefaultRendererRegistry = (): RendererRegistry => {
  const registry = new RendererRegistry();

  registry.register("text", (node) => {
    const text = typeof node.props === "object" && node.props && "text" in node.props ? String(node.props.text ?? "") : "";
    return <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{text}</pre>;
  });

  registry.register("chart", (node, ctx) => {
    const rows = ctx.getRows(node);
    return <EChartView spec={node.props as any} rows={rows} height="100%" />;
  });

  registry.register("table", () => <div className="muted">Table renderer placeholder</div>);
  registry.register("image", () => <div className="muted">Image renderer placeholder</div>);
  registry.register("richtext", () => <div className="muted">RichText renderer placeholder</div>);

  return registry;
};
