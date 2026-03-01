export type DocType = "chart" | "dashboard" | "report" | "ppt";
export type LayoutMode = "flow" | "grid" | "absolute";

export interface AssetRef {
  assetId: string;
  type: "image" | "icon" | "font" | "palette" | "theme" | "file";
  name?: string;
  uri?: string;
  meta?: Record<string, unknown>;
}

export interface VLayout {
  mode: LayoutMode;
  gx?: number;
  gy?: number;
  gw?: number;
  gh?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  r?: number;
  z?: number;
  lock?: boolean;
  group?: string;
  groupConstraint?: "free" | "x" | "y";
}

export interface VStyle {
  tokenId?: string;
  bg?: string;
  fg?: string;
  borderW?: number;
  borderC?: string;
  radius?: number;
  shadow?: string;
  pad?: number | [number, number, number, number];
  mar?: number | [number, number, number, number];
  font?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
}

export interface VDataBinding {
  sourceId: string;
  queryId?: string;
  params?: Record<string, string | number | boolean | string[]>;
  filterRefs?: string[];
}

export type BindingRole =
  | "x"
  | "y"
  | "series"
  | "color"
  | "size"
  | "label"
  | "category"
  | "value"
  | "node"
  | "linkSource"
  | "linkTarget"
  | "linkValue"
  | "geo"
  | "lat"
  | "lng"
  | "tooltip"
  | "facet";

export interface FieldBinding {
  role: BindingRole;
  field: string;
  agg?: "sum" | "avg" | "min" | "max" | "count" | "distinctCount" | "p50" | "p95" | "p99";
  as?: string;
  sort?: "asc" | "desc";
  topK?: number;
  format?: string;
  timeGrain?: "minute" | "hour" | "day" | "week" | "month";
  bin?: number;
  unit?: "bytes" | "bps" | "ms" | "pct" | "count";
}

export type ChartType =
  | "auto"
  | "line"
  | "bar"
  | "pie"
  | "scatter"
  | "radar"
  | "heatmap"
  | "kline"
  | "boxplot"
  | "sankey"
  | "graph"
  | "treemap"
  | "sunburst"
  | "parallel"
  | "funnel"
  | "gauge"
  | "calendar"
  | "custom";

export interface ChartAction {
  on: "click" | "hover";
  type: "filter" | "drill" | "highlight" | "call" | "navigate";
  targetFilterId?: string;
  map?: { fromRole: BindingRole; toParam: string };
  fnName?: string;
  payload?: Record<string, unknown>;
  url?: string;
}

export interface ChartSpec {
  chartType: ChartType;
  titleText?: string;
  subtitleText?: string;
  bindings: FieldBinding[];
  computedFields?: Array<{ name: string; expression: string }>;
  legendShow?: boolean;
  legendPos?: "top" | "right" | "bottom" | "left";
  tooltipShow?: boolean;
  gridShow?: boolean;
  xAxisShow?: boolean;
  xAxisTitle?: string;
  xAxisType?: "category" | "value" | "time" | "log";
  yAxisShow?: boolean;
  yAxisTitle?: string;
  yAxisType?: "value" | "log";
  themeRef?: string;
  paletteRef?: string;
  smooth?: boolean;
  stack?: boolean;
  area?: boolean;
  labelShow?: boolean;
  valueFormat?: string;
  timeFormat?: string;
  actions?: ChartAction[];
  optionPatch?: Record<string, unknown>;
}

export interface DashboardProps {
  dashTitle?: string;
  gridCols?: number;
  rowH?: number;
  gap?: number;
  bgMode?: "solid" | "image";
  bgAssetId?: string;
  showFilterBar?: boolean;
}

export interface ReportProps {
  reportTitle?: string;
  tocShow?: boolean;
  headerShow?: boolean;
  footerShow?: boolean;
  pageSize?: "A4" | "Letter" | { w: number; h: number };
  coverEnabled?: boolean;
  coverTitle?: string;
  coverSubtitle?: string;
  coverNote?: string;
  summaryEnabled?: boolean;
  summaryTitle?: string;
  summaryText?: string;
  headerText?: string;
  footerText?: string;
  showPageNumber?: boolean;
}

export interface DeckProps {
  size?: "16:9" | "4:3" | { w: number; h: number };
  defaultBg?: string;
}

export interface SlideProps {
  title?: string;
  layoutTemplateId?: string;
  bg?: string;
}

export interface SectionProps {
  title: string;
}

export interface TextProps {
  text: string;
  format?: "plain" | "markdown-lite";
}

export type NodeProps =
  | ChartSpec
  | DashboardProps
  | ReportProps
  | DeckProps
  | SlideProps
  | SectionProps
  | TextProps
  | Record<string, unknown>;

export interface VNode<TProps extends NodeProps = NodeProps> {
  id: string;
  kind: string;
  name?: string;
  layout?: VLayout;
  style?: VStyle;
  data?: VDataBinding;
  props?: TProps;
  children?: VNode[];
}

export interface FilterDef {
  filterId: string;
  type: "timeRange" | "select" | "multiSelect" | "text" | "numberRange";
  title?: string;
  bindField?: string;
  bindParam?: string;
  scope?: "global" | { nodeId: string };
  optionsSourceId?: string;
  optionsField?: string;
  optionsStatic?: Array<{ label: string; value: unknown }>;
  defaultValue?: unknown;
}

export interface DataSourceField {
  name: string;
  type: "string" | "number" | "boolean" | "time" | "json";
  label?: string;
  unit?: FieldBinding["unit"];
  aggAble?: boolean;
}

export interface DataSourceDef {
  id: string;
  type: "static" | "remote";
  staticData?: unknown;
  url?: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | string[]>;
  pollingEnabled?: boolean;
  pollingInterval?: number;
  cacheEnabled?: boolean;
  cacheTtl?: number;
  retryEnabled?: boolean;
  retryMax?: number;
  retryInterval?: number;
  schemaFields?: DataSourceField[];
}

export interface QueryDef {
  queryId: string;
  sourceId: string;
  kind?: "sql" | "api" | "static";
  text?: string;
  paramSchema?: Record<
    string,
    {
      type?: "string" | "number" | "boolean" | "array";
      required?: boolean;
      default?: unknown;
    }
  >;
}

export interface VDoc {
  docId: string;
  docType: DocType;
  schemaVersion: string;
  title?: string;
  locale?: string;
  themeId?: string;
  assets?: AssetRef[];
  dataSources?: DataSourceDef[];
  queries?: QueryDef[];
  filters?: FilterDef[];
  root: VNode;
}

export type CommandType =
  | "InsertNode"
  | "RemoveNode"
  | "MoveNode"
  | "UpdateDoc"
  | "UpdateProps"
  | "UpdateData"
  | "UpdateLayout"
  | "UpdateStyle"
  | "ResetStyle"
  | "Batch"
  | "Transaction"
  | "Group"
  | "Ungroup"
  | "ApplyTheme"
  | "ApplyTemplate";

export interface Command {
  type: CommandType;
  doc?: Record<string, unknown>;
  nodeId?: string;
  parentId?: string;
  index?: number;
  node?: VNode;
  newParentId?: string;
  newIndex?: number;
  props?: Record<string, unknown>;
  data?: Partial<VDataBinding>;
  layout?: Partial<VLayout>;
  style?: Partial<VStyle>;
  commands?: Command[];
  txId?: string;
  txMode?: "begin" | "commit" | "rollback";
  nodeIds?: string[];
  groupId?: string;
  themeId?: string;
  scope?: "doc" | "selection" | { nodeId: string };
  templateId?: string;
  templateTarget?: "dashboard" | "report" | "ppt" | "slide" | "section";
}

export interface CommandPlan {
  intent: "create" | "update" | "structure" | "bulk" | "query" | "explain";
  targets?: string[];
  commands: Command[];
  explain?: string;
  preview?: {
    summary?: string;
    expectedChangedNodeIds?: string[];
    risk?: "low" | "medium" | "high";
  };
}

export interface PatchOp {
  op: "add" | "remove" | "replace" | "move";
  path: string;
  value?: unknown;
  from?: string;
}

export interface SideEffects {
  reflow?: boolean;
  requery?: boolean;
  rerender?: boolean;
}

export interface CommandResult {
  patches: PatchOp[];
  inversePatches: PatchOp[];
  sideEffects?: SideEffects;
  summary?: string;
}
