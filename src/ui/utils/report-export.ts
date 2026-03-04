import type { ChartSpec, ReportProps, VDoc, VNode } from "../../core/doc/types";
import { applyComputedFields, applyFilters } from "../../runtime/data/transforms";
import { summarizeChartRows } from "./chart-summary";

interface NormalizedReportExportProps extends ReportProps {
  reportTitle: string;
  tocShow: boolean;
  coverEnabled: boolean;
  coverTitle: string;
  coverSubtitle: string;
  coverNote: string;
  summaryEnabled: boolean;
  summaryTitle: string;
  summaryText: string;
  headerShow: boolean;
  footerShow: boolean;
  headerText: string;
  footerText: string;
  showPageNumber: boolean;
}

interface ExportSection {
  id: string;
  title: string;
  blocks: ExportBlock[];
}

type ExportBlock =
  | { kind: "text"; text: string }
  | { kind: "chart"; title: string; summary: string; bindingHint: string }
  | { kind: "other"; text: string };

interface ExportContentPage {
  pageNo: number;
  items: Array<{ kind: "section"; title: string } | { kind: "block"; block: ExportBlock }>;
}

interface ExportPageSize {
  widthMm: number;
  heightMm: number;
  cssSize: "A4" | "Letter";
}

/** HTML 安全转义，避免导出内容被当作标签执行。 */
const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** 统一文本化，避免导出阶段处理 undefined/null。 */
const asText = (value: unknown): string => String(value ?? "");

/** 报告尺寸映射：当前支持 A4 / Letter。 */
const resolvePageSize = (pageSize: ReportProps["pageSize"]): ExportPageSize => {
  if (pageSize === "Letter") {
    return { widthMm: 216, heightMm: 279, cssSize: "Letter" };
  }
  return { widthMm: 210, heightMm: 297, cssSize: "A4" };
};

/** 补全运行时导出属性默认值。 */
const normalizeReportProps = (doc: VDoc): NormalizedReportExportProps => {
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
    headerShow: raw.headerShow ?? true,
    footerShow: raw.footerShow ?? true,
    headerText: raw.headerText ?? reportTitle,
    footerText: raw.footerText ?? "Visual Document OS",
    showPageNumber: raw.showPageNumber ?? true,
    pageSize: raw.pageSize ?? "A4"
  };
};

/** 粗略估算文本块高度（毫米），用于分页。 */
const estimateTextHeightMm = (text: string): number => {
  const lines = Math.max(2, Math.ceil(text.length / 28));
  return Math.min(95, 12 + lines * 4.6);
};

/** 粗略估算图表摘要块高度（毫米），用于分页。 */
const estimateChartHeightMm = (summary: string): number => {
  const lines = Math.max(2, Math.ceil(summary.length / 30));
  return Math.min(120, 62 + lines * 4.4);
};

/** 提取图表核心绑定提示，写入导出文本。 */
const blockBindingHint = (spec: ChartSpec): string => {
  const x = spec.bindings.find((item) => item.role === "x" || item.role === "category");
  const y = spec.bindings.find((item) => item.role === "y" || item.role === "value");
  return `字段: ${x?.field ?? "-"} / ${y?.field ?? "-"}`;
};

/** 拉取用于导出摘要的图表行数据，并应用计算字段与过滤条件。 */
const chartRowsForExport = (doc: VDoc, node: VNode, spec: ChartSpec): Array<Record<string, unknown>> => {
  const sourceId = node.data?.sourceId;
  if (!sourceId) {
    return [];
  }
  const source = doc.dataSources?.find((item) => item.id === sourceId);
  if (!source || source.type !== "static" || !Array.isArray(source.staticData)) {
    return [];
  }
  const rows = source.staticData.filter((row): row is Record<string, unknown> => !!row && typeof row === "object");
  const withComputed = applyComputedFields(rows, spec);
  return applyFilters(withComputed, doc.filters ?? [], node);
};

/** 将报告 DSL 结构转换成导出中间模型。 */
const buildExportSections = (doc: VDoc): ExportSection[] => {
  const sections = (doc.root.children ?? []).filter((node) => node.kind === "section");
  return sections.map((section, index) => {
    const title = asText((section.props as Record<string, unknown> | undefined)?.title) || `章节 ${index + 1}`;
    const blocks: ExportBlock[] = (section.children ?? []).map((block) => {
      if (block.kind === "text") {
        const text = asText((block.props as Record<string, unknown> | undefined)?.text);
        return { kind: "text", text };
      }
      if (block.kind === "chart") {
        const spec = (block.props ?? { chartType: "line", bindings: [] }) as ChartSpec;
        const rows = chartRowsForExport(doc, block, spec);
        return {
          kind: "chart",
          title: spec.titleText ?? block.name ?? block.id,
          bindingHint: blockBindingHint(spec),
          summary: summarizeChartRows(spec, rows)
        };
      }
      return { kind: "other", text: `未导出块类型: ${block.kind}` };
    });
    return { id: section.id, title, blocks };
  });
};

const paginateContentPages = ({
  sections,
  contentHeightMm,
  startPageNo
}: {
  sections: ExportSection[];
  contentHeightMm: number;
  startPageNo: number;
}): { pages: ExportContentPage[]; sectionPageMap: Map<string, number> } => {
  // 基于估算高度分页，确保前端导出时页眉页脚和目录页逻辑可控。
  const pages: ExportContentPage[] = [];
  const sectionPageMap = new Map<string, number>();
  let current: ExportContentPage = { pageNo: startPageNo, items: [] };
  let used = 0;

  const pushPage = (): void => {
    pages.push(current);
    current = { pageNo: current.pageNo + 1, items: [] };
    used = 0;
  };

  const ensureSpace = (heightMm: number): void => {
    if (used > 0 && used + heightMm > contentHeightMm) {
      pushPage();
    }
  };

  sections.forEach((section) => {
    const sectionHeight = 12;
    ensureSpace(sectionHeight);
    if (!sectionPageMap.has(section.id)) {
      sectionPageMap.set(section.id, current.pageNo);
    }
    current.items.push({ kind: "section", title: section.title });
    used += sectionHeight;

    section.blocks.forEach((block) => {
      const blockHeight =
        block.kind === "text" ? estimateTextHeightMm(block.text) : block.kind === "chart" ? estimateChartHeightMm(block.summary) : 22;
      ensureSpace(blockHeight);
      current.items.push({ kind: "block", block });
      used += blockHeight;
    });
  });

  if (current.items.length > 0) {
    pages.push(current);
  }
  return { pages, sectionPageMap };
};

/** 自动总结文案兜底。 */
const buildAutoSummaryForExport = (sections: ExportSection[]): string => {
  if (sections.length === 0) {
    return "本报告暂无章节内容。";
  }
  const chartCount = sections.reduce((sum, section) => sum + section.blocks.filter((block) => block.kind === "chart").length, 0);
  const textCount = sections.reduce((sum, section) => sum + section.blocks.filter((block) => block.kind === "text").length, 0);
  return `本报告共 ${sections.length} 个章节，包含 ${chartCount} 张图表与 ${textCount} 段文本。建议优先关注峰值异常区间及后续处置动作。`;
};

/** 渲染单个内容项为 HTML 片段。 */
const renderContentItem = (item: ExportContentPage["items"][number]): string => {
  if (item.kind === "section") {
    return `<h2 class="section-title">${escapeHtml(item.title)}</h2>`;
  }
  const block = item.block;
  if (block.kind === "text") {
    return `<div class="text-block"><pre>${escapeHtml(block.text)}</pre></div>`;
  }
  if (block.kind === "chart") {
    return `<div class="chart-block">
      <div class="chart-title">${escapeHtml(block.title)}</div>
      <div class="chart-hint">${escapeHtml(block.bindingHint)}</div>
      <div class="chart-summary">${escapeHtml(block.summary)}</div>
    </div>`;
  }
  return `<div class="other-block">${escapeHtml(block.text)}</div>`;
};

/** 渲染单页壳结构（页眉、正文、页脚）。 */
const renderPageShell = ({
  props,
  pageNo,
  body
}: {
  props: NormalizedReportExportProps;
  pageNo: number;
  body: string;
}): string => {
  const header = props.headerShow
    ? `<div class="page-header"><span>${escapeHtml(props.headerText || props.reportTitle)}</span>${props.showPageNumber ? `<span>Page ${pageNo}</span>` : ""}</div>`
    : "";
  const footer = props.footerShow
    ? `<div class="page-footer"><span>${escapeHtml(props.footerText || "Visual Document OS")}</span>${props.showPageNumber ? `<span>#${pageNo}</span>` : ""}</div>`
    : "";
  return `<section class="page">
    ${header}
    <div class="page-body">${body}</div>
    ${footer}
  </section>`;
};

/** 生成可打印 HTML（浏览器 print / 另存为 PDF）。 */
const buildPrintHtml = (doc: VDoc): string => {
  const props = normalizeReportProps(doc);
  const pageSize = resolvePageSize(props.pageSize);
  const headerH = props.headerShow ? 10 : 0;
  const footerH = props.footerShow ? 10 : 0;
  const contentHeightMm = pageSize.heightMm - 24 - headerH - footerH;
  const sections = buildExportSections(doc);
  const tocRowsPerPage = Math.max(1, Math.floor((contentHeightMm - 20) / 6));
  const tocPages = props.tocShow ? Math.max(1, Math.ceil(sections.length / tocRowsPerPage)) : 0;
  const coverPages = props.coverEnabled ? 1 : 0;
  const sectionStartPage = coverPages + tocPages + 1;
  const { pages: contentPages, sectionPageMap } = paginateContentPages({
    sections,
    contentHeightMm,
    startPageNo: sectionStartPage
  });

  const parts: string[] = [];
  let pageNo = 1;

  if (props.coverEnabled) {
    parts.push(
      renderPageShell({
        props,
        pageNo,
        body: `<div class="cover">
          <h1>${escapeHtml(props.coverTitle || props.reportTitle)}</h1>
          <p class="cover-subtitle">${escapeHtml(props.coverSubtitle)}</p>
          <p class="cover-note">${escapeHtml(props.coverNote)}</p>
        </div>`
      })
    );
    pageNo += 1;
  }

  if (props.tocShow) {
    for (let i = 0; i < tocPages; i += 1) {
      const slice = sections.slice(i * tocRowsPerPage, (i + 1) * tocRowsPerPage);
      const tocBody = `<div class="toc">
        <h2>目录</h2>
        ${slice
          .map((section, idx) => {
            const page = sectionPageMap.get(section.id) ?? "-";
            return `<div class="toc-row"><span>${escapeHtml(`${i * tocRowsPerPage + idx + 1}. ${section.title}`)}</span><span>${page}</span></div>`;
          })
          .join("")}
      </div>`;
      parts.push(renderPageShell({ props, pageNo, body: tocBody }));
      pageNo += 1;
    }
  }

  contentPages.forEach((page) => {
    parts.push(
      renderPageShell({
        props,
        pageNo,
        body: `<div class="content-page">${page.items.map(renderContentItem).join("")}</div>`
      })
    );
    pageNo += 1;
  });

  if (props.summaryEnabled) {
    const summary = props.summaryText.trim() || buildAutoSummaryForExport(sections);
    parts.push(
      renderPageShell({
        props,
        pageNo,
        body: `<div class="summary-page"><h2>${escapeHtml(props.summaryTitle)}</h2><pre>${escapeHtml(summary)}</pre></div>`
      })
    );
  }

  const style = `
    @page { size: ${pageSize.cssSize}; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f9;
      font-family: "Source Sans 3", "Segoe UI", sans-serif;
      color: #0f172a;
    }
    .page {
      position: relative;
      width: ${pageSize.widthMm}mm;
      min-height: ${pageSize.heightMm}mm;
      margin: 8mm auto;
      padding: 12mm 14mm;
      background: #fff;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
      page-break-after: always;
      overflow: hidden;
    }
    .page-header, .page-footer {
      position: absolute;
      left: 14mm;
      right: 14mm;
      font-size: 10pt;
      color: #475569;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #dbe6f7;
      padding-bottom: 2mm;
    }
    .page-header {
      top: 6mm;
    }
    .page-footer {
      bottom: 6mm;
      border-bottom: none;
      border-top: 1px solid #dbe6f7;
      padding-top: 2mm;
      padding-bottom: 0;
    }
    .page-body {
      margin-top: ${props.headerShow ? "12mm" : "0"};
      margin-bottom: ${props.footerShow ? "12mm" : "0"};
    }
    .cover {
      min-height: ${Math.max(140, contentHeightMm - 4)}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 4mm;
    }
    .cover h1 { margin: 0; font-size: 34pt; }
    .cover-subtitle { margin: 0; color: #475569; font-size: 14pt; }
    .cover-note { margin: 0; color: #64748b; font-size: 11pt; }
    .toc h2, .summary-page h2, .section-title {
      margin: 0 0 4mm 0;
      font-size: 16pt;
      color: #1e293b;
    }
    .toc-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #dbe6f7;
      padding: 2mm 0;
      font-size: 11pt;
    }
    .text-block, .chart-block, .other-block {
      border: 1px solid #dbe6f7;
      border-radius: 3mm;
      padding: 3mm;
      margin-bottom: 3mm;
      background: #f8fbff;
    }
    .text-block pre, .summary-page pre {
      margin: 0;
      white-space: pre-wrap;
      font-family: inherit;
      line-height: 1.5;
      font-size: 11pt;
    }
    .chart-title {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 1mm;
    }
    .chart-hint {
      font-size: 10pt;
      color: #475569;
      margin-bottom: 2mm;
    }
    .chart-summary {
      font-size: 10.5pt;
      line-height: 1.45;
    }
    .summary-page pre {
      border: 1px solid #dbe6f7;
      border-radius: 3mm;
      background: #f8fbff;
      padding: 3mm;
    }
    @media print {
      body { background: #fff; }
      .page {
        margin: 0;
        box-shadow: none;
      }
    }
  `;

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(props.reportTitle)} - Export</title>
      <style>${style}</style>
    </head>
    <body>
      ${parts.join("\n")}
    </body>
  </html>`;
};

/** 导出入口：前端打开新窗口并触发浏览器打印。 */
export const exportReportToPrint = (doc: VDoc): { ok: boolean; message: string } => {
  if (typeof window === "undefined") {
    return { ok: false, message: "当前环境不支持浏览器导出" };
  }
  const html = buildPrintHtml(doc);
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    return { ok: false, message: "浏览器拦截了弹窗，请允许后重试" };
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 180);
  return { ok: true, message: "已打开打印窗口，可选择“另存为 PDF”" };
};
