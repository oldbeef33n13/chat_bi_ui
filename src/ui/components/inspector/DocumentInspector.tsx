import { useRef, useState } from "react";
import type { Command, TemplateVariableDef, VDoc, VStyle } from "../../../core/doc/types";
import { themes } from "../../../runtime/theme/themes";
import { HttpAssetRepository } from "../../api/http-asset-repository";
import { useEditorStore } from "../../state/editor-context";
import { upsertDocAsset } from "../../utils/doc-assets";
import { resolveImageAsset } from "../../utils/dashboard-surface";
import { ColorField } from "../ColorField";
import { TextStyleEditor } from "../TextStyleEditor";
import { LayoutEditor, NumberInput } from "./LayoutEditor";
import type { InspectorTab } from "./shared";

export function DocumentInspector({ doc, activeTab }: { doc: VDoc; activeTab: InspectorTab }): JSX.Element {
  const store = useEditorStore();
  const rootProps = (doc.root.props ?? {}) as Record<string, unknown>;
  const pageSize = typeof rootProps.pageSize === "string" ? rootProps.pageSize : "A4";
  const paginationStrategy = rootProps.paginationStrategy === "continuous" ? "continuous" : "section";
  const marginPreset = typeof rootProps.marginPreset === "string" ? rootProps.marginPreset : "normal";
  const pptSize = typeof rootProps.size === "string" ? rootProps.size : "16:9";
  const templateVariables = doc.templateVariables ?? [];
  const assetRepoRef = useRef(new HttpAssetRepository("/api/v1"));
  const dashboardBgInputRef = useRef<HTMLInputElement>(null);
  const [dashboardAssetHint, setDashboardAssetHint] = useState("");
  const dashboardBackgroundAsset =
    doc.docType === "dashboard" ? resolveImageAsset(doc, typeof rootProps.bgAssetId === "string" ? rootProps.bgAssetId : undefined) : undefined;

  const updateDoc = (partial: Record<string, unknown>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateDoc",
        doc: partial
      },
      { summary, mergeWindowMs }
    );
  };

  const shouldMirrorTitleValue = (rawValue: unknown, fallbacks: string[]): boolean => {
    const value = String(rawValue ?? "").trim();
    if (!value) {
      return true;
    }
    return fallbacks.map((item) => item.trim()).filter(Boolean).includes(value);
  };

  const updateDocumentTitle = (nextTitle: string): void => {
    const previousTitle = String(doc.title ?? "").trim();
    const rootPatch: Record<string, unknown> = {};
    if (doc.docType === "dashboard") {
      const previousDashTitle = String(rootProps.dashTitle ?? previousTitle).trim();
      if (shouldMirrorTitleValue(rootProps.dashTitle, [previousTitle])) {
        rootPatch.dashTitle = nextTitle;
      }
      if (shouldMirrorTitleValue(rootProps.headerText, [previousTitle, previousDashTitle])) {
        rootPatch.headerText = nextTitle;
      }
    }
    if (doc.docType === "report") {
      const previousReportTitle = String(rootProps.reportTitle ?? previousTitle).trim();
      if (shouldMirrorTitleValue(rootProps.reportTitle, [previousTitle])) {
        rootPatch.reportTitle = nextTitle;
      }
      if (shouldMirrorTitleValue(rootProps.coverTitle, [previousTitle, previousReportTitle])) {
        rootPatch.coverTitle = nextTitle;
      }
      if (shouldMirrorTitleValue(rootProps.headerText, [previousTitle, previousReportTitle])) {
        rootPatch.headerText = nextTitle;
      }
    }
    if (doc.docType === "ppt" && shouldMirrorTitleValue(rootProps.masterHeaderText, [previousTitle])) {
      rootPatch.masterHeaderText = nextTitle;
    }

    const commands: Command[] = [
      {
        type: "UpdateDoc",
        doc: { title: nextTitle }
      }
    ];
    if (Object.keys(rootPatch).length > 0) {
      commands.push({
        type: "UpdateProps",
        nodeId: doc.root.id,
        props: rootPatch
      });
    }
    if (commands.length === 1) {
      updateDoc({ title: nextTitle }, "update doc title", 140);
      return;
    }
    store.executeCommand({ type: "Transaction", commands }, { summary: "update doc title", mergeWindowMs: 140 });
  };

  const updateRootProps = (partial: Record<string, unknown>, summary: string, mergeWindowMs = 0): void => {
    store.executeCommand(
      {
        type: "UpdateProps",
        nodeId: doc.root.id,
        props: partial
      },
      { summary, mergeWindowMs }
    );
  };

  const applyReportMarginPreset = (preset: "narrow" | "normal" | "wide" | "custom"): void => {
    if (preset === "custom") {
      updateRootProps({ marginPreset: "custom" }, "update report margin preset");
      return;
    }
    const value = preset === "narrow" ? 10 : preset === "wide" ? 20 : 14;
    updateRootProps(
      {
        marginPreset: preset,
        marginTopMm: value,
        marginRightMm: value,
        marginBottomMm: value,
        marginLeftMm: value
      },
      "update report margin preset"
    );
  };

  const updateTemplateVariables = (nextVariables: TemplateVariableDef[], summary: string): void => {
    updateDoc(
      {
        templateVariables: nextVariables
      },
      summary
    );
  };

  const patchTemplateVariable = (index: number, patch: Partial<TemplateVariableDef>): void => {
    const nextVariables = templateVariables.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));
    updateTemplateVariables(nextVariables, "update template variable");
  };

  const pushDashboardAssetHint = (message: string): void => {
    setDashboardAssetHint(message);
    window.setTimeout(() => setDashboardAssetHint(""), 1800);
  };

  const handleDashboardBackgroundPicked = async (file?: File): Promise<void> => {
    if (!file || doc.docType !== "dashboard") {
      return;
    }
    try {
      const uploaded = await assetRepoRef.current.uploadImage(file);
      store.executeCommand(
        {
          type: "Transaction",
          commands: [
            {
              type: "UpdateDoc",
              doc: {
                assets: upsertDocAsset(doc.assets, uploaded.asset)
              }
            },
            {
              type: "UpdateProps",
              nodeId: doc.root.id,
              props: {
                bgMode: "image",
                bgAssetId: uploaded.asset.assetId
              }
            }
          ]
        },
        { summary: `update dashboard background ${file.name}` }
      );
      pushDashboardAssetHint(`已更新背景图：${file.name}`);
    } catch (error) {
      pushDashboardAssetHint(error instanceof Error ? error.message : "背景图上传失败");
    }
  };

  return (
    <div className="col">
      {activeTab === "basic" ? (
        <>
          <div className="muted inspector-help-text">仅保留可编辑配置；文档识别信息在下方“技术信息”中查看。</div>
          <label className="col">
            <span>文档标题</span>
            <input className="input" value={String(doc.title ?? "")} onChange={(event) => updateDocumentTitle(event.target.value)} />
          </label>
          <label className="col">
            <span>语言区域</span>
            <input className="input" value={String(doc.locale ?? "")} onChange={(event) => updateDoc({ locale: event.target.value }, "update doc locale", 140)} placeholder="zh-CN" />
          </label>
          <label className="col">
            <span>文档主题</span>
            <select
              className="select"
              value={doc.themeId ?? themes[0]?.id ?? ""}
              onChange={(event) => store.executeCommand({ type: "ApplyTheme", scope: "doc", themeId: event.target.value }, { summary: `apply theme ${event.target.value}` })}
            >
              {themes.map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                </option>
              ))}
            </select>
          </label>
          {doc.docType === "dashboard" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>公共头脚（快捷）</strong>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle dashboard header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={Boolean(rootProps.footerShow)} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle dashboard footer")} />
                  <span>页脚</span>
                </label>
              </div>
              <label className="col">
                <span>页眉文案</span>
                <input className="input" value={String(rootProps.headerText ?? rootProps.dashTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ headerText: event.target.value }, "update dashboard header text", 140)} />
              </label>
              <label className="col">
                <span>页脚文案</span>
                <input className="input" value={String(rootProps.footerText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ footerText: event.target.value }, "update dashboard footer text", 140)} />
              </label>
            </div>
          ) : null}
          {doc.docType === "report" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>公共头脚（快捷）</strong>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.footerShow !== false} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle footer")} />
                  <span>页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.showPageNumber !== false} onChange={(event) => updateRootProps({ showPageNumber: event.target.checked }, "toggle page number")} />
                  <span>页码</span>
                </label>
              </div>
              <label className="col">
                <span>页眉文案</span>
                <input className="input" value={String(rootProps.headerText ?? rootProps.reportTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ headerText: event.target.value }, "update report header text", 140)} />
              </label>
              <label className="col">
                <span>页脚文案</span>
                <input className="input" value={String(rootProps.footerText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ footerText: event.target.value }, "update report footer text", 140)} />
              </label>
            </div>
          ) : null}
          {doc.docType === "ppt" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>公共头脚（快捷）</strong>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowHeader !== false} onChange={(event) => updateRootProps({ masterShowHeader: event.target.checked }, "toggle ppt master header")} />
                  <span>母版页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowFooter !== false} onChange={(event) => updateRootProps({ masterShowFooter: event.target.checked }, "toggle ppt master footer")} />
                  <span>母版页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowSlideNumber !== false} onChange={(event) => updateRootProps({ masterShowSlideNumber: event.target.checked }, "toggle ppt slide number")} />
                  <span>页码</span>
                </label>
              </div>
              <label className="col">
                <span>母版页眉文案</span>
                <input className="input" value={String(rootProps.masterHeaderText ?? doc.title ?? "")} onChange={(event) => updateRootProps({ masterHeaderText: event.target.value }, "update ppt master header text", 140)} />
              </label>
              <label className="col">
                <span>母版页脚文案</span>
                <input className="input" value={String(rootProps.masterFooterText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ masterFooterText: event.target.value }, "update ppt master footer text", 140)} />
              </label>
            </div>
          ) : null}
        </>
      ) : null}
      {activeTab === "style" ? (
        <>
          {doc.docType === "dashboard" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>Dashboard 全局属性</strong>
              <label className="col">
                <span>标题</span>
                <input className="input" value={String(rootProps.dashTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ dashTitle: event.target.value }, "update dashboard title", 140)} />
              </label>
              <label className="col">
                <span>展示模式</span>
                <select className="select" value={String(rootProps.displayMode ?? "fit_screen")} onChange={(event) => updateRootProps({ displayMode: event.target.value }, "update dashboard display mode")}>
                  <option value="fit_screen">全屏适配</option>
                  <option value="scroll_page">页面滚动</option>
                </select>
              </label>
              <div className="row">
                <NumberInput label="网格列数" value={Number(rootProps.gridCols ?? 12)} onChange={(value) => updateRootProps({ gridCols: Math.max(1, value) }, "update dashboard grid cols")} />
                <NumberInput label="卡片行高" value={Number(rootProps.rowH ?? 56)} onChange={(value) => updateRootProps({ rowH: Math.max(1, value) }, "update dashboard row height")} />
                <NumberInput label="卡片间距" value={Number(rootProps.gap ?? 16)} onChange={(value) => updateRootProps({ gap: Math.max(0, value) }, "update dashboard gap")} />
              </div>
              <div className="row">
                <NumberInput label="设计宽度" value={Number(rootProps.designWidthPx ?? 1920)} onChange={(value) => updateRootProps({ designWidthPx: Math.max(320, value) }, "update dashboard design width")} />
                <NumberInput label="设计高度" value={Number(rootProps.designHeightPx ?? 1080)} onChange={(value) => updateRootProps({ designHeightPx: Math.max(240, value) }, "update dashboard design height")} />
                <NumberInput label="页面宽度" value={Number(rootProps.pageWidthPx ?? 1280)} onChange={(value) => updateRootProps({ pageWidthPx: Math.max(320, value) }, "update dashboard page width")} />
                <NumberInput label="页面边距" value={Number(rootProps.pageMarginPx ?? 24)} onChange={(value) => updateRootProps({ pageMarginPx: Math.max(0, value) }, "update dashboard page margin")} />
              </div>
              <label className="row">
                <input type="checkbox" checked={rootProps.showFilterBar !== false} onChange={(event) => updateRootProps({ showFilterBar: event.target.checked }, "toggle dashboard filter bar")} />
                <span>显示筛选栏</span>
              </label>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle dashboard header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={Boolean(rootProps.footerShow)} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle dashboard footer")} />
                  <span>页脚</span>
                </label>
              </div>
              <label className="col">
                <span>页眉文案</span>
                <input className="input" value={String(rootProps.headerText ?? rootProps.dashTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ headerText: event.target.value }, "update dashboard header text", 140)} />
              </label>
              <label className="col">
                <span>页脚文案</span>
                <input className="input" value={String(rootProps.footerText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ footerText: event.target.value }, "update dashboard footer text", 140)} />
              </label>
              <TextStyleEditor title="标题标签样式" value={rootProps.titleStyle as VStyle | undefined} onChange={(style) => updateRootProps({ titleStyle: style }, "update dashboard title style")} />
              <TextStyleEditor title="页眉样式" value={rootProps.headerStyle as VStyle | undefined} onChange={(style) => updateRootProps({ headerStyle: style }, "update dashboard header style")} />
              <TextStyleEditor title="页脚样式" value={rootProps.footerStyle as VStyle | undefined} onChange={(style) => updateRootProps({ footerStyle: style }, "update dashboard footer style")} />
              <input
                ref={dashboardBgInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                style={{ display: "none" }}
                onChange={(event) => {
                  void handleDashboardBackgroundPicked(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <strong>背景</strong>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <label className="row">
                    <input
                      type="radio"
                      name="dashboard-style-bg-mode"
                      checked={rootProps.bgMode !== "image"}
                      onChange={() => updateRootProps({ bgMode: "solid", bgAssetId: undefined }, "clear dashboard background image")}
                    />
                    <span>纯色背景</span>
                  </label>
                  <label className="row">
                    <input
                      type="radio"
                      name="dashboard-style-bg-mode"
                      checked={rootProps.bgMode === "image" && Boolean(rootProps.bgAssetId)}
                      onChange={() => dashboardBgInputRef.current?.click()}
                    />
                    <span>背景图</span>
                  </label>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button className="btn" onClick={() => dashboardBgInputRef.current?.click()}>
                    {dashboardBackgroundAsset ? "更换背景图" : "上传背景图"}
                  </button>
                  {dashboardBackgroundAsset ? (
                    <button className="btn mini-btn" onClick={() => updateRootProps({ bgMode: "solid", bgAssetId: undefined }, "remove dashboard background image")}>
                      清除背景图
                    </button>
                  ) : null}
                </div>
                {dashboardBackgroundAsset ? <div className="muted">{`当前背景：${dashboardBackgroundAsset.name ?? dashboardBackgroundAsset.assetId}`}</div> : null}
                {dashboardAssetHint ? <div className="chip">{dashboardAssetHint}</div> : null}
              </div>
            </div>
          ) : null}

          {doc.docType === "report" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>Report 全局属性</strong>
              <label className="col">
                <span>报告标题</span>
                <input className="input" value={String(rootProps.reportTitle ?? doc.title ?? "")} onChange={(event) => updateRootProps({ reportTitle: event.target.value }, "update report title", 140)} />
              </label>
              <label className="col">
                <span>纸张</span>
                <select className="select" value={pageSize} onChange={(event) => updateRootProps({ pageSize: event.target.value }, "update report page size")}>
                  <option value="A4">A4</option>
                  <option value="Letter">Letter</option>
                </select>
              </label>
              <label className="col">
                <span>分页策略</span>
                <select className="select" value={paginationStrategy} onChange={(event) => updateRootProps({ paginationStrategy: event.target.value }, "update report pagination strategy")}>
                  <option value="section">section</option>
                  <option value="continuous">continuous</option>
                </select>
              </label>
              <label className="col">
                <span>页边距预设</span>
                <select className="select" value={marginPreset} onChange={(event) => applyReportMarginPreset(event.target.value as "narrow" | "normal" | "wide" | "custom")}>
                  <option value="narrow">narrow</option>
                  <option value="normal">normal</option>
                  <option value="wide">wide</option>
                  <option value="custom">custom</option>
                </select>
              </label>
              {marginPreset === "custom" ? (
                <div className="row">
                  <NumberInput label="top(mm)" value={Number(rootProps.marginTopMm ?? 14)} onChange={(value) => updateRootProps({ marginTopMm: Math.max(6, value) }, "update report margin top")} />
                  <NumberInput label="right(mm)" value={Number(rootProps.marginRightMm ?? 14)} onChange={(value) => updateRootProps({ marginRightMm: Math.max(6, value) }, "update report margin right")} />
                  <NumberInput label="bottom(mm)" value={Number(rootProps.marginBottomMm ?? 14)} onChange={(value) => updateRootProps({ marginBottomMm: Math.max(6, value) }, "update report margin bottom")} />
                  <NumberInput label="left(mm)" value={Number(rootProps.marginLeftMm ?? 14)} onChange={(value) => updateRootProps({ marginLeftMm: Math.max(6, value) }, "update report margin left")} />
                </div>
              ) : null}
              <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <strong>布局参数</strong>
                <div className="row">
                  <NumberInput label="bodyPadding(px)" value={Number(rootProps.bodyPaddingPx ?? 12)} onChange={(value) => updateRootProps({ bodyPaddingPx: Math.max(0, value) }, "update report body padding")} />
                  <NumberInput label="sectionGap(px)" value={Number(rootProps.sectionGapPx ?? 12)} onChange={(value) => updateRootProps({ sectionGapPx: Math.max(0, value) }, "update report section gap")} />
                  <NumberInput label="blockGap(px)" value={Number(rootProps.blockGapPx ?? 8)} onChange={(value) => updateRootProps({ blockGapPx: Math.max(0, value) }, "update report block gap")} />
                </div>
              </div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.tocShow !== false} onChange={(event) => updateRootProps({ tocShow: event.target.checked }, "toggle toc")} />
                  <span>目录页</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.coverEnabled !== false} onChange={(event) => updateRootProps({ coverEnabled: event.target.checked }, "toggle cover")} />
                  <span>封面</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.summaryEnabled !== false} onChange={(event) => updateRootProps({ summaryEnabled: event.target.checked }, "toggle summary")} />
                  <span>总结页</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.headerShow !== false} onChange={(event) => updateRootProps({ headerShow: event.target.checked }, "toggle header")} />
                  <span>页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.footerShow !== false} onChange={(event) => updateRootProps({ footerShow: event.target.checked }, "toggle footer")} />
                  <span>页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.showPageNumber !== false} onChange={(event) => updateRootProps({ showPageNumber: event.target.checked }, "toggle page number")} />
                  <span>页码</span>
                </label>
              </div>
              <TextStyleEditor title="封面标题样式" value={rootProps.coverTitleStyle as VStyle | undefined} onChange={(style) => updateRootProps({ coverTitleStyle: style }, "update report cover title style")} />
              <TextStyleEditor title="章节标题样式" value={rootProps.sectionTitleStyle as VStyle | undefined} onChange={(style) => updateRootProps({ sectionTitleStyle: style }, "update report section title style")} />
              <TextStyleEditor title="摘要标题样式" value={rootProps.summaryTitleStyle as VStyle | undefined} onChange={(style) => updateRootProps({ summaryTitleStyle: style }, "update report summary title style")} />
              <TextStyleEditor title="页眉样式" value={rootProps.headerStyle as VStyle | undefined} onChange={(style) => updateRootProps({ headerStyle: style }, "update report header style")} />
              <TextStyleEditor title="页脚样式" value={rootProps.footerStyle as VStyle | undefined} onChange={(style) => updateRootProps({ footerStyle: style }, "update report footer style")} />
            </div>
          ) : null}

          {doc.docType === "ppt" ? (
            <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
              <strong>PPT 全局属性</strong>
              <label className="col">
                <span>页面尺寸</span>
                <select className="select" value={pptSize} onChange={(event) => updateRootProps({ size: event.target.value }, "update ppt size")}>
                  <option value="16:9">16:9</option>
                  <option value="4:3">4:3</option>
                </select>
              </label>
              <ColorField label="默认背景色" value={String(rootProps.defaultBg ?? "#ffffff")} onChange={(value) => updateRootProps({ defaultBg: value ?? "#ffffff" }, "update ppt default bg", 140)} allowClear={false} />
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowHeader !== false} onChange={(event) => updateRootProps({ masterShowHeader: event.target.checked }, "toggle ppt master header")} />
                  <span>母版页眉</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowFooter !== false} onChange={(event) => updateRootProps({ masterShowFooter: event.target.checked }, "toggle ppt master footer")} />
                  <span>母版页脚</span>
                </label>
                <label className="row">
                  <input type="checkbox" checked={rootProps.masterShowSlideNumber !== false} onChange={(event) => updateRootProps({ masterShowSlideNumber: event.target.checked }, "toggle ppt slide number")} />
                  <span>页码</span>
                </label>
              </div>
              <label className="col">
                <span>母版页眉文案</span>
                <input className="input" value={String(rootProps.masterHeaderText ?? doc.title ?? "")} onChange={(event) => updateRootProps({ masterHeaderText: event.target.value }, "update ppt master header text", 140)} />
              </label>
              <label className="col">
                <span>母版页脚文案</span>
                <input className="input" value={String(rootProps.masterFooterText ?? "Visual Document OS")} onChange={(event) => updateRootProps({ masterFooterText: event.target.value }, "update ppt master footer text", 140)} />
              </label>
              <ColorField label="母版强调色" value={String(rootProps.masterAccentColor ?? "#1d4ed8")} onChange={(value) => updateRootProps({ masterAccentColor: value ?? "#1d4ed8" }, "update ppt master accent color", 140)} allowClear={false} />
              <TextStyleEditor title="母版页眉样式" value={rootProps.headerStyle as VStyle | undefined} onChange={(style) => updateRootProps({ headerStyle: style }, "update ppt header style")} />
              <TextStyleEditor title="母版页脚样式" value={rootProps.footerStyle as VStyle | undefined} onChange={(style) => updateRootProps({ footerStyle: style }, "update ppt footer style")} />
              <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
                <strong>布局参数</strong>
                <div className="row">
                  <NumberInput label="padX(px)" value={Number(rootProps.masterPaddingXPx ?? 24)} onChange={(value) => updateRootProps({ masterPaddingXPx: Math.max(0, value) }, "update ppt master padX")} />
                  <NumberInput label="headerTop(px)" value={Number(rootProps.masterHeaderTopPx ?? 12)} onChange={(value) => updateRootProps({ masterHeaderTopPx: Math.max(0, value) }, "update ppt header top")} />
                  <NumberInput label="headerH(px)" value={Number(rootProps.masterHeaderHeightPx ?? 26)} onChange={(value) => updateRootProps({ masterHeaderHeightPx: Math.max(12, value) }, "update ppt header height")} />
                </div>
                <div className="row">
                  <NumberInput label="footerBottom(px)" value={Number(rootProps.masterFooterBottomPx ?? 10)} onChange={(value) => updateRootProps({ masterFooterBottomPx: Math.max(0, value) }, "update ppt footer bottom")} />
                  <NumberInput label="footerH(px)" value={Number(rootProps.masterFooterHeightPx ?? 22)} onChange={(value) => updateRootProps({ masterFooterHeightPx: Math.max(12, value) }, "update ppt footer height")} />
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      {activeTab === "advanced" ? (
        <>
          <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>模板变量</strong>
              <button
                className="btn mini-btn"
                onClick={() =>
                  updateTemplateVariables(
                    [
                      ...templateVariables,
                      {
                        key: `var_${templateVariables.length + 1}`,
                        label: `变量 ${templateVariables.length + 1}`,
                        type: "string",
                        required: false,
                        defaultValue: "",
                        description: ""
                      }
                    ],
                    "add template variable"
                  )
                }
              >
                新增变量
              </button>
            </div>
            <div className="muted inspector-help-text">定义动态预览、导出与定时任务共用的模板变量。</div>
            {templateVariables.length === 0 ? <div className="muted">当前还没有模板变量。</div> : null}
            {templateVariables.map((item, index) => (
              <div key={`${item.key}_${index}`} className="col" style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, gap: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{item.label ?? item.key}</strong>
                  <button
                    className="btn mini-btn"
                    onClick={() => updateTemplateVariables(templateVariables.filter((_, itemIndex) => itemIndex !== index), "remove template variable")}
                  >
                    删除
                  </button>
                </div>
                <div className="row">
                  <label className="col">
                    <span>变量 Key</span>
                    <input className="input" value={item.key} onChange={(event) => patchTemplateVariable(index, { key: event.target.value })} />
                  </label>
                  <label className="col">
                    <span>显示名称</span>
                    <input className="input" value={item.label ?? ""} onChange={(event) => patchTemplateVariable(index, { label: event.target.value })} />
                  </label>
                  <label className="col">
                    <span>类型</span>
                    <select className="select" value={item.type} onChange={(event) => patchTemplateVariable(index, { type: event.target.value as TemplateVariableDef["type"] })}>
                      <option value="string">string</option>
                      <option value="number">number</option>
                      <option value="boolean">boolean</option>
                      <option value="date">date</option>
                      <option value="datetime">datetime</option>
                    </select>
                  </label>
                </div>
                <div className="row">
                  <label className="col">
                    <span>默认值</span>
                    <input className="input" value={item.defaultValue === undefined ? "" : String(item.defaultValue)} onChange={(event) => patchTemplateVariable(index, { defaultValue: event.target.value })} />
                  </label>
                  <label className="col">
                    <span>说明</span>
                    <input className="input" value={item.description ?? ""} onChange={(event) => patchTemplateVariable(index, { description: event.target.value })} />
                  </label>
                  <label className="row" style={{ alignSelf: "flex-end" }}>
                    <input type="checkbox" checked={Boolean(item.required)} onChange={(event) => patchTemplateVariable(index, { required: event.target.checked })} />
                    <span>必填</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
          <LayoutEditor node={doc.root} />
        </>
      ) : null}
    </div>
  );
}
