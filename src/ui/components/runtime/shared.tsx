import type { ChartSpec, ImageProps, TableSpec, VDoc, VNode } from "../../../core/doc/types";
import { EChartView } from "../../../runtime/chart/EChartView";
import { TableView } from "../../../runtime/table/TableView";
import { useDataEngine } from "../../hooks/use-data-engine";
import { useNodeRows } from "../../hooks/use-node-rows";
import { resolveDashboardBackgroundStyle, resolveImageAsset } from "../../utils/dashboard-surface";
import {
  isRemoteDataNode,
  resolveNodeDisplayTitle,
  resolveNodeSurfaceStyle,
  resolveNodeTitleStyle,
  resolveTitleTextStyle,
  shouldRenderOuterNodeTitle
} from "../../utils/node-style";
import { ChartAskAssistant } from "../ChartAskAssistant";
import { NodeDataState } from "../NodeDataState";
import { NodeTextBlock } from "../NodeTextBlock";

export function RuntimeChartAskHeaderAction({
  doc,
  node,
  engine,
  dataVersion
}: {
  doc: VDoc;
  node: VNode;
  engine: ReturnType<typeof useDataEngine>["engine"];
  dataVersion: number | string;
}): JSX.Element | null {
  const spec = (node.props ?? {}) as ChartSpec;
  const enabled = node.kind === "chart" && spec.runtimeAskEnabled !== false;
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);
  if (!enabled || loading || error) {
    return null;
  }
  return (
    <div className="runtime-chart-ask-entry">
      <ChartAskAssistant doc={doc} node={node} rows={rows} compact triggerMode="icon" />
    </div>
  );
}

export function RuntimeNodeContent({
  doc,
  node,
  engine,
  dataVersion,
  height
}: {
  doc: VDoc;
  node: VNode;
  engine: ReturnType<typeof useDataEngine>["engine"];
  dataVersion: number | string;
  height: number | string;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(doc, node, engine, dataVersion);
  if (loading) {
    return <NodeDataState loading remote={isRemoteDataNode(doc, node)} />;
  }
  if (error) {
    return <NodeDataState error={error} remote={isRemoteDataNode(doc, node)} />;
  }
  if (node.kind === "chart") {
    return <EChartView spec={node.props as ChartSpec} rows={rows} height={height} />;
  }
  if (node.kind === "table") {
    return <TableView spec={node.props as TableSpec} rows={rows} height={height} />;
  }
  if (node.kind === "text") {
    return <NodeTextBlock node={node} style={{ height }} />;
  }
  if (node.kind === "image") {
    const props = (node.props ?? {}) as ImageProps;
    const asset = resolveImageAsset(doc, props.assetId);
    if (!asset?.uri) {
      return <div className="muted">图片资源缺失</div>;
    }
    return (
      <img
        src={asset.uri}
        alt={props.alt ?? asset.name ?? props.title ?? "图片"}
        style={{
          width: "100%",
          height: "100%",
          objectFit: props.fit === "stretch" ? "fill" : props.fit ?? "contain",
          opacity: Math.max(0, Math.min(1, Number(props.opacity ?? 1)))
        }}
      />
    );
  }
  return <div className="muted">暂未支持: {node.kind}</div>;
}

export const renderRuntimeNodeHeader = (doc: VDoc, node: VNode, engine: ReturnType<typeof useDataEngine>["engine"], dataVersion: number | string): JSX.Element | null => {
  const showOuterTitle = shouldRenderOuterNodeTitle(node);
  const showHeader = node.kind !== "text" && (showOuterTitle || node.kind === "chart");
  if (!showHeader) {
    return null;
  }
  const title = resolveNodeDisplayTitle(node);
  return (
    <div className="node-floating-label runtime-node-header row" style={{ justifyContent: "space-between", gap: 6 }}>
      {showOuterTitle ? (
        <span className="node-floating-label-text" style={resolveTitleTextStyle({ fontSize: 12, bold: true }, resolveNodeTitleStyle(node))}>
          {title}
        </span>
      ) : (
        <span className="node-floating-label-text" />
      )}
      {node.kind === "chart" ? <RuntimeChartAskHeaderAction doc={doc} node={node} engine={engine} dataVersion={dataVersion} /> : null}
    </div>
  );
};

export const renderDashboardCardHeader = (doc: VDoc, node: VNode, engine: ReturnType<typeof useDataEngine>["engine"], dataVersion: number | string): JSX.Element | null => {
  const showOuterTitle = shouldRenderOuterNodeTitle(node);
  const showHeader = node.kind !== "text" && (showOuterTitle || node.kind === "chart");
  const title = node.kind === "image" ? String((node.props as ImageProps | undefined)?.title ?? node.name ?? node.id) : resolveNodeDisplayTitle(node);
  if (!showHeader) {
    return null;
  }
  return (
    <div className="card-head card-head-floating row" style={{ justifyContent: "space-between", gap: 6 }}>
      {showOuterTitle ? (
        <span className="card-head-title" style={resolveTitleTextStyle({ fontSize: 13, bold: true }, resolveNodeTitleStyle(node))}>
          {title}
        </span>
      ) : (
        <span className="card-head-title" />
      )}
      {node.kind === "chart" ? <RuntimeChartAskHeaderAction doc={doc} node={node} engine={engine} dataVersion={dataVersion} /> : null}
    </div>
  );
};

export { resolveDashboardBackgroundStyle, resolveNodeSurfaceStyle, resolveTitleTextStyle };
