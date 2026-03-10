export type DocType = "chart" | "dashboard" | "report" | "ppt";
export type LayoutMode = "flow" | "grid" | "absolute";
export type DashboardDisplayMode = "fit_screen" | "scroll_page";
export type DashboardPreset = "wallboard" | "workbench";

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
  bgOpacity?: number;
  fg?: string;
  opacity?: number;
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
  valign?: "top" | "middle" | "bottom";
  writingMode?: "horizontal-tb" | "vertical-rl";
  lineHeight?: number;
  letterSpacing?: number;
}

export interface VDataBinding {
  sourceId?: string;
  endpointId?: string;
  queryId?: string;
  params?: Record<string, unknown>;
  paramBindings?: Record<
    string,
    {
      from: "const" | "templateVar" | "systemVar" | "filter";
      value?: unknown;
      key?: string;
    }
  >;
  filterRefs?: string[];
}

export interface TemplateVariableDef {
  key: string;
  label?: string;
  type: "string" | "number" | "boolean" | "date" | "datetime";
  required?: boolean;
  defaultValue?: unknown;
  description?: string;
}

export type BindingRole =
  | "x"
  | "y"
  | "y1"
  | "y2"
  | "secondary"
  | "ysecondary"
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
  axis?: "primary" | "secondary" | number;
  xAxis?: number;
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
  | "combo"
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
  titleStyle?: VStyle;
  subtitleStyle?: VStyle;
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
  runtimeAskEnabled?: boolean;
  actions?: ChartAction[];
  optionPatch?: Record<string, unknown>;
}

export interface DashboardProps {
  dashTitle?: string;
  titleStyle?: VStyle;
  displayMode?: DashboardDisplayMode;
  designWidthPx?: number;
  designHeightPx?: number;
  pageWidthPx?: number;
  pageMarginPx?: number;
  gridCols?: number;
  rowH?: number;
  gap?: number;
  bgMode?: "solid" | "image";
  bgAssetId?: string;
  showFilterBar?: boolean;
  headerShow?: boolean;
  headerText?: string;
  headerStyle?: VStyle;
  footerShow?: boolean;
  footerText?: string;
  footerStyle?: VStyle;
}

export interface ReportProps {
  reportTitle?: string;
  tocShow?: boolean;
  headerShow?: boolean;
  footerShow?: boolean;
  pageSize?: "A4" | "Letter" | { w: number; h: number };
  paginationStrategy?: "section" | "continuous";
  marginPreset?: "narrow" | "normal" | "wide" | "custom";
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  coverEnabled?: boolean;
  coverTitle?: string;
  coverTitleStyle?: VStyle;
  coverSubtitle?: string;
  coverNote?: string;
  summaryEnabled?: boolean;
  summaryTitle?: string;
  summaryTitleStyle?: VStyle;
  summaryText?: string;
  headerText?: string;
  headerStyle?: VStyle;
  footerText?: string;
  footerStyle?: VStyle;
  showPageNumber?: boolean;
  sectionTitleStyle?: VStyle;
  /**
   * 报告页正文内边距（像素）：用于 Web 预览与导出间距映射。
   */
  bodyPaddingPx?: number;
  /**
   * 章节标题与正文块之间的垂直间距（像素）。
   */
  sectionGapPx?: number;
  /**
   * 正文块（图表/表格/文本）之间的垂直间距（像素）。
   */
  blockGapPx?: number;
  nativeChartEnabled?: boolean;
  nativeChartWidthEmu?: number;
  nativeChartHeightEmu?: number;
}

export interface DeckProps {
  size?: "16:9" | "4:3" | { w: number; h: number };
  defaultBg?: string;
  masterShowHeader?: boolean;
  masterHeaderText?: string;
  headerStyle?: VStyle;
  masterShowFooter?: boolean;
  masterFooterText?: string;
  footerStyle?: VStyle;
  masterShowSlideNumber?: boolean;
  masterAccentColor?: string;
  /**
   * 母版头尾布局参数（像素），用于 Web/PPT 导出统一呈现。
   */
  masterPaddingXPx?: number;
  masterHeaderTopPx?: number;
  masterHeaderHeightPx?: number;
  masterFooterBottomPx?: number;
  masterFooterHeightPx?: number;
  nativeChartEnabled?: boolean;
  nativeChartWidthEmu?: number;
  nativeChartHeightEmu?: number;
}

export interface SlideProps {
  title?: string;
  layoutTemplateId?: string;
  bg?: string;
}

export interface SectionProps {
  title: string;
  editorMode?: "canvas";
  canvasCols?: number;
  canvasPageHeightPx?: number;
  canvasSnapPx?: number;
  canvasGapPx?: number;
  canvasPaddingPx?: number;
  canvasOverflow?: "paginate" | "grow";
}

export interface TextProps {
  text: string;
  format?: "plain" | "markdown-lite";
}

export interface ImageProps {
  assetId: string;
  title?: string;
  alt?: string;
  fit?: "contain" | "cover" | "stretch";
  opacity?: number;
}

export interface TableColumnSpec {
  key: string;
  title?: string;
  width?: number;
  align?: "left" | "center" | "right";
  format?: string;
}

export interface TableHeaderCellSpec {
  text?: string;
  title?: string;
  colSpan?: number;
  rowSpan?: number;
  align?: "left" | "center" | "right";
}

export interface TableMergeSpec {
  row: number;
  col: number;
  rowSpan?: number;
  colSpan?: number;
  scope?: "header" | "body";
}

export interface TablePivotSpec {
  enabled?: boolean;
  rowFields: string[];
  columnField: string;
  valueField: string;
  agg?: "sum" | "avg" | "min" | "max" | "count";
  fill?: number;
  valueTitle?: string;
}

export interface TableSpec {
  titleText?: string;
  titleStyle?: VStyle;
  columns?: TableColumnSpec[];
  headerRows?: TableHeaderCellSpec[][];
  mergeCells?: TableMergeSpec[];
  rows?: Array<Record<string, unknown> | unknown[]>;
  repeatHeader?: boolean;
  zebra?: boolean;
  maxRows?: number;
  pivot?: TablePivotSpec;
}

export type NodeProps =
  | ChartSpec
  | DashboardProps
  | ReportProps
  | DeckProps
  | SlideProps
  | SectionProps
  | TextProps
  | ImageProps
  | TableSpec
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
  templateVariables?: TemplateVariableDef[];
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
