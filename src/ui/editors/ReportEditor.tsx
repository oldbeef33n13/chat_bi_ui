import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { defaultChartSpec } from "../../core/doc/defaults";
import type { ChartSpec, ReportProps, TableSpec, VDoc, VNode } from "../../core/doc/types";
import { DataEngine } from "../../runtime/data/data-engine";
import { EChartView } from "../../runtime/chart/EChartView";
import { TableView } from "../../runtime/table/TableView";
import { useNodeRows } from "../hooks/use-node-rows";
import { useDataEngine } from "../hooks/use-data-engine";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { ChartQuickActions } from "../components/ChartQuickActions";
import { ChartAskAssistant } from "../components/ChartAskAssistant";
import { computeVirtualWindow } from "../utils/report-virtual";
import { exportReportToPrint } from "../utils/report-export";
import { prefixedId } from "../../core/utils/id";

interface ReportEditorProps {
  doc: VDoc;
}

interface ReportRuntimeProps extends ReportProps {
  reportTitle: string;
  tocShow: boolean;
  coverEnabled: boolean;
  coverTitle: string;
  coverSubtitle: string;
  coverNote: string;
  summaryEnabled: boolean;
  summaryTitle: string;
  summaryText: string;
  headerText: string;
  footerText: string;
  showPageNumber: boolean;
}

interface ReportEntryBase {
  key: string;
  height: number;
  pageIndex: number;
}

interface CoverEntry extends ReportEntryBase {
  kind: "cover";
}

interface SectionHeaderEntry extends ReportEntryBase {
  kind: "section-header";
  section: VNode;
  sectionIndex: number;
}

interface BlockEntry extends ReportEntryBase {
  kind: "block";
  section: VNode;
  block: VNode;
}

interface QuickInsertEntry extends ReportEntryBase {
  kind: "quick-insert";
  section: VNode;
}

interface SummaryEntry extends ReportEntryBase {
  kind: "summary";
}

interface TocEntry extends ReportEntryBase {
  kind: "toc";
}

type ReportEntry = CoverEntry | TocEntry | SectionHeaderEntry | BlockEntry | QuickInsertEntry | SummaryEntry;

export function ReportEditor({ doc }: ReportEditorProps): JSX.Element {
  const store = useEditorStore();
  const selection = useSignalValue(store.selection);
  const { engine, dataVersion } = useDataEngine(doc.dataSources ?? [], doc.queries ?? [], { debounceMs: 120 });
  const sections = (doc.root.children ?? []).filter((n) => n.kind === "section");
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [exportHint, setExportHint] = useState("");
  const [quickInsertBySection, setQuickInsertBySection] = useState<Record<string, string>>({});
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(620);
  const reportProps = useMemo(() => normalizeReportProps(doc), [doc]);
  const autoSummary = useMemo(() => buildAutoSummary(doc), [doc]);
  const sectionPageMap = useMemo(() => buildPreviewSectionPageMap(reportProps, sections), [reportProps, sections]);

  const updateReportProps = (partial: Partial<ReportRuntimeProps>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: doc.root.id,
        props: partial as Record<string, unknown>
      },
      { summary, mergeWindowMs }
    );
  };

  const insertBlock = (section: VNode, blockKind: "text" | "chart" | "table"): void => {
    const fallbackSourceId = doc.dataSources?.[0]?.id;
    const fallbackQueryId = doc.queries?.find((item) => item.sourceId === fallbackSourceId)?.queryId;
    const node: VNode =
      blockKind === "text"
        ? {
            id: prefixedId("text"),
            kind: "text",
            props: { text: "新段落", format: "plain" }
          }
        : blockKind === "chart"
          ? {
            id: prefixedId("chart"),
            kind: "chart",
            props: defaultChartSpec("新图表")
          }
          : {
            id: prefixedId("table"),
            kind: "table",
            data: fallbackSourceId
              ? {
                sourceId: fallbackSourceId,
                queryId: fallbackQueryId
              }
              : undefined,
            props: {
              titleText: "新表格",
              columns: [],
              repeatHeader: true,
              zebra: true
            }
          };
    store.executeCommand(
      {
        type: "InsertNode",
        parentId: section.id,
        node
      },
      { summary: `insert ${blockKind} into ${section.id}` }
    );
  };

  const moveSection = (sectionId: string, delta: number): void => {
    const index = sections.findIndex((s) => s.id === sectionId);
    if (index < 0) {
      return;
    }
    const target = index + delta;
    if (target < 0 || target >= sections.length) {
      return;
    }
    store.executeCommand(
      {
        type: "MoveNode",
        nodeId: sectionId,
        newParentId: doc.root.id,
        newIndex: target
      },
      { summary: "reorder section" }
    );
  };

  const entries = useMemo<ReportEntry[]>(() => {
    const list: ReportEntry[] = [];
    let pageIndex = 0;

    if (reportProps.coverEnabled) {
      pageIndex += 1;
      list.push({
        kind: "cover",
        key: "report_cover",
        pageIndex,
        height: measuredHeights.report_cover ?? 340
      });
    }

    if (reportProps.tocShow) {
      pageIndex += 1;
      list.push({
        kind: "toc",
        key: "report_toc",
        pageIndex,
        height: measuredHeights.report_toc ?? 260
      });
    }

    sections.forEach((section, sectionIndex) => {
      pageIndex += 1;
      const sectionPage = pageIndex;
      list.push({
        kind: "section-header",
        key: `section_header_${section.id}`,
        section,
        sectionIndex,
        pageIndex: sectionPage,
        height: measuredHeights[`section_header_${section.id}`] ?? 96
      });
      (section.children ?? []).forEach((block) => {
        const key = `block_${block.id}`;
        list.push({
          kind: "block",
          key,
          section,
          block,
          pageIndex: sectionPage,
          height: measuredHeights[key] ?? estimateBlockHeight(block)
        });
      });
      list.push({
        kind: "quick-insert",
        key: `insert_${section.id}`,
        section,
        pageIndex: sectionPage,
        height: measuredHeights[`insert_${section.id}`] ?? 82
      });
    });

    if (reportProps.summaryEnabled) {
      pageIndex += 1;
      list.push({
        kind: "summary",
        key: "report_summary",
        pageIndex,
        height: measuredHeights.report_summary ?? 260
      });
    }

    return list;
  }, [measuredHeights, reportProps.coverEnabled, reportProps.summaryEnabled, reportProps.tocShow, sections]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const update = (): void => setViewportHeight(viewport.clientHeight);
    update();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const { totalHeight, visible } = useMemo(() => computeVirtualWindow(entries, scrollTop, viewportHeight, 420), [entries, scrollTop, viewportHeight]);

  const quickInsertValue = (sectionId: string): string => quickInsertBySection[sectionId] ?? "/";

  const setQuickInsertValue = (sectionId: string, value: string): void => {
    setQuickInsertBySection((prev) => ({ ...prev, [sectionId]: value }));
  };

  const handleMeasuredHeight = useCallback((entryKey: string, height: number): void => {
    setMeasuredHeights((prev) => {
      const current = prev[entryKey];
      if (current !== undefined && Math.abs(current - height) < 2) {
        return prev;
      }
      return { ...prev, [entryKey]: height };
    });
  }, []);

  return (
    <div className="col" style={{ height: "100%" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row">
          <span className="chip">{reportProps.reportTitle}</span>
          <span className="chip">章节 {sections.length}</span>
          <span className="chip">页 {Math.max(1, countPages(reportProps, sections.length))}</span>
          {exportHint ? <span className="chip">{exportHint}</span> : null}
        </div>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              const result = exportReportToPrint(doc);
              setExportHint(result.message);
              setTimeout(() => setExportHint(""), 3000);
            }}
          >
            导出 PDF
          </button>
          <button className={`btn ${showReportConfig ? "primary" : ""}`} onClick={() => setShowReportConfig((value) => !value)}>
            报告结构
          </button>
          <button
            className="btn"
            onClick={() =>
              store.executeCommand(
                {
                  type: "InsertNode",
                  parentId: doc.root.id,
                  node: {
                    id: prefixedId("section"),
                    kind: "section",
                    props: { title: `章节 ${sections.length + 1}` },
                    children: []
                  }
                },
                { summary: "add section" }
              )
            }
          >
            +章节
          </button>
        </div>
      </div>

      {showReportConfig ? (
        <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>封面 / 总结 / 页眉页脚</strong>
            <button className="btn" onClick={() => updateReportProps({ summaryText: autoSummary }, "refresh auto summary")}>
              刷新自动总结
            </button>
          </div>
          <div className="row">
            <label className="row">
              <input type="checkbox" checked={reportProps.tocShow} onChange={(event) => updateReportProps({ tocShow: event.target.checked }, "toggle toc")} />
              <span>目录页</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={reportProps.coverEnabled} onChange={(event) => updateReportProps({ coverEnabled: event.target.checked }, "toggle cover")} />
              <span>封面页</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={reportProps.summaryEnabled} onChange={(event) => updateReportProps({ summaryEnabled: event.target.checked }, "toggle summary")} />
              <span>总结页</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(reportProps.headerShow)} onChange={(event) => updateReportProps({ headerShow: event.target.checked }, "toggle header")} />
              <span>页眉</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={Boolean(reportProps.footerShow)} onChange={(event) => updateReportProps({ footerShow: event.target.checked }, "toggle footer")} />
              <span>页脚</span>
            </label>
            <label className="row">
              <input type="checkbox" checked={reportProps.showPageNumber} onChange={(event) => updateReportProps({ showPageNumber: event.target.checked }, "toggle page number")} />
              <span>页码</span>
            </label>
          </div>
          <div className="row">
            <label className="col" style={{ flex: 1 }}>
              <span>报告标题</span>
              <input className="input" value={reportProps.reportTitle} onChange={(event) => updateReportProps({ reportTitle: event.target.value }, "edit report title", 160)} />
            </label>
            <label className="col" style={{ width: 180 }}>
              <span>纸张</span>
              <select className="select" value={typeof reportProps.pageSize === "string" ? reportProps.pageSize : "A4"} onChange={(event) => updateReportProps({ pageSize: event.target.value as "A4" | "Letter" }, "change page size")}>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </select>
            </label>
          </div>
          <div className="row">
            <label className="col" style={{ flex: 1 }}>
              <span>封面主标题</span>
              <input className="input" value={reportProps.coverTitle} onChange={(event) => updateReportProps({ coverTitle: event.target.value }, "edit cover title", 160)} />
            </label>
            <label className="col" style={{ flex: 1 }}>
              <span>封面副标题</span>
              <input className="input" value={reportProps.coverSubtitle} onChange={(event) => updateReportProps({ coverSubtitle: event.target.value }, "edit cover subtitle", 160)} />
            </label>
          </div>
          <div className="row">
            <label className="col" style={{ flex: 1 }}>
              <span>页眉文案</span>
              <input className="input" value={reportProps.headerText} onChange={(event) => updateReportProps({ headerText: event.target.value }, "edit header text", 160)} />
            </label>
            <label className="col" style={{ flex: 1 }}>
              <span>页脚文案</span>
              <input className="input" value={reportProps.footerText} onChange={(event) => updateReportProps({ footerText: event.target.value }, "edit footer text", 160)} />
            </label>
          </div>
          <label className="col">
            <span>总结页标题</span>
            <input className="input" value={reportProps.summaryTitle} onChange={(event) => updateReportProps({ summaryTitle: event.target.value }, "edit summary title", 160)} />
          </label>
          <label className="col">
            <span>总结内容</span>
            <textarea className="textarea" value={reportProps.summaryText} onChange={(event) => updateReportProps({ summaryText: event.target.value }, "edit summary text", 160)} />
          </label>
          <div className="muted" style={{ fontSize: 12 }}>
            自动总结建议：{autoSummary}
          </div>
        </div>
      ) : null}

      <div
        ref={viewportRef}
        className="col"
        style={{ overflow: "auto", minHeight: 0, paddingRight: 4, position: "relative" }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {entries.length === 0 ? <div className="muted">暂无章节内容</div> : null}
        <div style={{ position: "relative", minHeight: totalHeight }}>
          {visible.map(({ item: entry, top }) => (
            <MeasuredEntry
              key={entry.key}
              entryKey={entry.key}
              onHeight={handleMeasuredHeight}
              style={{ position: "absolute", left: 0, right: 0, top, paddingBottom: 8 }}
            >
              {entry.kind === "cover" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="col" style={{ minHeight: 240, justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                    <div style={{ fontSize: 30, fontWeight: 700 }}>{reportProps.coverTitle || reportProps.reportTitle}</div>
                    <div className="muted" style={{ fontSize: 16 }}>
                      {reportProps.coverSubtitle}
                    </div>
                    <div className="muted" style={{ marginTop: 14 }}>
                      {reportProps.coverNote || `生成时间：${new Date().toLocaleDateString()}`}
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}

              {entry.kind === "toc" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="section">
                    <div className="section-title">目录</div>
                    <div className="block" style={{ margin: 0 }}>
                      {sections.length === 0 ? <div className="muted">暂无章节</div> : null}
                      {sections.map((section, index) => (
                        <div key={section.id} className="row" style={{ justifyContent: "space-between", borderBottom: "1px dashed var(--line)", padding: "6px 0" }}>
                          <span>{`${index + 1}. ${String((section.props as Record<string, unknown>)?.title ?? `章节 ${index + 1}`)}`}</span>
                          <span className="muted">Page {sectionPageMap.get(section.id) ?? "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}

              {entry.kind === "section-header" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="section">
                    <div className="section-title row" style={{ justifyContent: "space-between" }}>
                      <div className="row">
                        <span>{String((entry.section.props as Record<string, unknown>)?.title ?? `章节 ${entry.sectionIndex + 1}`)}</span>
                        <span className="muted">{entry.section.id}</span>
                      </div>
                      <div className="row">
                        <button className="btn" onClick={() => moveSection(entry.section.id, -1)}>
                          上移
                        </button>
                        <button className="btn" onClick={() => moveSection(entry.section.id, 1)}>
                          下移
                        </button>
                        <button className="btn" onClick={() => insertBlock(entry.section, "text")}>
                          +文本
                        </button>
                        <button className="btn" onClick={() => insertBlock(entry.section, "chart")}>
                          +图表
                        </button>
                        <button className="btn" onClick={() => insertBlock(entry.section, "table")}>
                          +表格
                        </button>
                      </div>
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}

              {entry.kind === "block" ? (
                <ReportBlock
                  doc={doc}
                  block={entry.block}
                  selected={selection.selectedIds.includes(entry.block.id)}
                  onSelect={(multi) => store.setSelection(entry.block.id, multi)}
                  engine={engine}
                  dataVersion={dataVersion}
                  lazyRootRef={viewportRef}
                  onQuickChartPatch={(patch, summary) =>
                    store.executeCommand(
                      {
                        type: "UpdateProps",
                        nodeId: entry.block.id,
                        props: patch as Record<string, unknown>
                      },
                      { summary }
                    )
                  }
                />
              ) : null}

              {entry.kind === "quick-insert" ? (
                <div className="block">
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <input
                      className="input"
                      value={quickInsertValue(entry.section.id)}
                      onChange={(event) => setQuickInsertValue(entry.section.id, event.target.value)}
                      placeholder="输入 /chart /table 或 /text"
                    />
                    <button
                      className="btn"
                      onClick={() => {
                        const value = quickInsertValue(entry.section.id).trim();
                        if (value === "/chart") {
                          insertBlock(entry.section, "chart");
                          return;
                        }
                        if (value === "/table") {
                          insertBlock(entry.section, "table");
                          return;
                        }
                        insertBlock(entry.section, "text");
                      }}
                    >
                      快捷插入
                    </button>
                  </div>
                </div>
              ) : null}

              {entry.kind === "summary" ? (
                <ReportPageFrame props={reportProps} pageIndex={entry.pageIndex}>
                  <div className="section">
                    <div className="section-title">{reportProps.summaryTitle}</div>
                    <div className="block" style={{ margin: 0 }}>
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{reportProps.summaryText || autoSummary}</pre>
                    </div>
                  </div>
                </ReportPageFrame>
              ) : null}
            </MeasuredEntry>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportBlock({
  doc,
  block,
  selected,
  onSelect,
  engine,
  dataVersion,
  lazyRootRef,
  onQuickChartPatch
}: {
  doc: VDoc;
  block: VNode;
  selected: boolean;
  onSelect: (multi: boolean) => void;
  engine: DataEngine;
  dataVersion: string;
  lazyRootRef: RefObject<HTMLDivElement>;
  onQuickChartPatch: (patch: Partial<ChartSpec>, summary: string) => void;
}): JSX.Element {
  const { rows, loading, error } = useNodeRows(doc, block, engine, dataVersion);
  const style = selected ? { borderColor: "#2563eb", boxShadow: "0 0 0 2px rgba(37, 99, 235, .2)" } : undefined;

  return (
    <div className="block" style={style} onClick={(event) => onSelect(event.ctrlKey || event.metaKey)}>
      {block.kind === "text" ? (
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{String((block.props as Record<string, unknown>)?.text ?? "")}</pre>
      ) : block.kind === "table" ? (
        loading ? (
          <div className="muted">loading...</div>
        ) : error ? (
          <div className="muted">error: {error}</div>
        ) : (
          <TableView spec={block.props as TableSpec} rows={rows} height={260} />
        )
      ) : block.kind === "chart" ? (
        loading ? (
          <div className="muted">loading...</div>
        ) : error ? (
          <div className="muted">error: {error}</div>
        ) : (
          <div className="col">
            <LazyChartPanel rootRef={lazyRootRef} height={260}>
              <div style={{ width: "100%", height: 260, position: "relative" }}>
                <div style={{ position: "absolute", top: 6, right: 6, zIndex: 5 }}>
                  <ChartAskAssistant doc={doc} node={block} rows={rows} compact />
                </div>
                {selected ? (
                  <div style={{ position: "absolute", top: 6, left: 6, zIndex: 5 }}>
                    <ChartQuickActions spec={block.props as ChartSpec} onPatch={onQuickChartPatch} />
                  </div>
                ) : null}
                <EChartView spec={block.props as ChartSpec} rows={rows} height={260} />
              </div>
            </LazyChartPanel>
          </div>
        )
      ) : (
        <div className="muted">暂未支持的块类型: {block.kind}</div>
      )}
    </div>
  );
}

function LazyChartPanel({
  rootRef,
  height,
  children
}: {
  rootRef: RefObject<HTMLDivElement>;
  height: number;
  children: ReactNode;
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      {
        root: rootRef.current,
        rootMargin: "220px"
      }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [mounted, rootRef]);

  return (
    <div ref={hostRef} style={{ minHeight: height }}>
      {mounted ? children : <div className="muted" style={{ height, display: "flex", alignItems: "center", justifyContent: "center" }}>图表离屏，滚动到可视区后加载</div>}
    </div>
  );
}

function MeasuredEntry({
  entryKey,
  onHeight,
  style,
  children
}: {
  entryKey: string;
  onHeight: (entryKey: string, height: number) => void;
  style?: CSSProperties;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    const report = (): void => onHeight(entryKey, node.getBoundingClientRect().height);
    report();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [entryKey, onHeight]);

  return (
    <div ref={ref} style={style}>
      {children}
    </div>
  );
}

function ReportPageFrame({
  props,
  pageIndex,
  children
}: {
  props: ReportRuntimeProps;
  pageIndex: number;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="report-page-frame">
      {props.headerShow ? (
        <div className="report-page-header row" style={{ justifyContent: "space-between" }}>
          <span>{props.headerText || props.reportTitle}</span>
          {props.showPageNumber ? <span className="muted">Page {pageIndex}</span> : null}
        </div>
      ) : null}
      <div className="report-page-body">{children}</div>
      {props.footerShow ? (
        <div className="report-page-footer row" style={{ justifyContent: "space-between" }}>
          <span className="muted">{props.footerText || "Visual Document OS"}</span>
          {props.showPageNumber ? <span className="muted">#{pageIndex}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

const normalizeReportProps = (doc: VDoc): ReportRuntimeProps => {
  const raw = ((doc.root.props as ReportProps | undefined) ?? {}) as ReportProps;
  const reportTitle = raw.reportTitle ?? doc.title ?? "未命名报告";
  return {
    ...raw,
    reportTitle,
    tocShow: raw.tocShow ?? true,
    coverEnabled: raw.coverEnabled ?? true,
    coverTitle: raw.coverTitle ?? reportTitle,
    coverSubtitle: raw.coverSubtitle ?? "Report",
    coverNote: raw.coverNote ?? `生成时间：${new Date().toLocaleDateString()}`,
    summaryEnabled: raw.summaryEnabled ?? true,
    summaryTitle: raw.summaryTitle ?? "执行摘要",
    summaryText: raw.summaryText ?? "",
    headerText: raw.headerText ?? reportTitle,
    footerText: raw.footerText ?? "Visual Document OS",
    showPageNumber: raw.showPageNumber ?? true,
    pageSize: raw.pageSize ?? "A4"
  };
};

const countPages = (props: ReportRuntimeProps, sectionCount: number): number =>
  sectionCount + (props.coverEnabled ? 1 : 0) + (props.tocShow ? 1 : 0) + (props.summaryEnabled ? 1 : 0);

const buildPreviewSectionPageMap = (props: ReportRuntimeProps, sections: VNode[]): Map<string, number> => {
  let page = 0;
  if (props.coverEnabled) {
    page += 1;
  }
  if (props.tocShow) {
    page += 1;
  }
  const map = new Map<string, number>();
  sections.forEach((section) => {
    page += 1;
    map.set(section.id, page);
  });
  return map;
};

const estimateBlockHeight = (block: VNode): number => {
  if (block.kind === "chart") {
    return 332;
  }
  if (block.kind === "text") {
    const text = String((block.props as Record<string, unknown>)?.text ?? "");
    const lines = Math.max(2, Math.min(8, Math.ceil(text.length / 30)));
    return 72 + lines * 20;
  }
  return 150;
};

const buildAutoSummary = (doc: VDoc): string => {
  const sections = (doc.root.children ?? []).filter((node) => node.kind === "section");
  const chartCount = sections.reduce((sum, section) => sum + (section.children ?? []).filter((node) => node.kind === "chart").length, 0);
  const textCount = sections.reduce((sum, section) => sum + (section.children ?? []).filter((node) => node.kind === "text").length, 0);
  const titles = sections
    .map((section) => String((section.props as Record<string, unknown>)?.title ?? "未命名章节"))
    .slice(0, 3)
    .join("、");
  if (sections.length === 0) {
    return "报告暂无章节，建议先新增章节并补充关键图表。";
  }
  return `本报告共 ${sections.length} 个章节，包含 ${chartCount} 张图表与 ${textCount} 段文本。重点章节：${titles}。建议优先核对峰值异常与对应处置动作。`;
};
