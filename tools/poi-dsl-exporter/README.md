# POI DSL Exporter

基于 Apache POI 的 Java 导出器，用于把前端 DSL 文档导出为本地 Office 文件：

- `report` DSL -> `.docx`
- `ppt` DSL -> `.pptx`

## 商用化重构重点

- 导出内核分层：`DocumentExporter + ExporterOrchestrator + VDocValidator`
- 渲染扩展机制：`NodeRenderer + RendererRegistry`（按 `kind` 注册）
- 主题系统：`ThemeTokens + StyleResolver`（内置主题 + DSL 覆盖）
- 图表规范层：`ChartSpec + ChartSpecParser`（多指标、二轴、聚合、过滤、计算字段）
- 图表 flavor 策略：`trend/comparison/composition/relation/matrix/time/custom/table/fallback`
- DOCX/PPTX 原生图表：`PoiChartRenderer`（全图表类型覆盖 + 自动降级）

## 目录结构

- `src/main/java/com/chatbi/exporter/core`: 导出编排、校验、请求模型
- `src/main/java/com/chatbi/exporter/render`: 节点渲染注册扩展点
- `src/main/java/com/chatbi/exporter/style`: 主题令牌与解析器
- `src/main/java/com/chatbi/exporter/chart`: 图表 DSL 解析标准化
- `src/main/java/com/chatbi/exporter/docx`: Report 导出与渲染策略
- `src/main/java/com/chatbi/exporter/pptx`: PPT 导出与渲染策略

## 构建

```bash
mvn -f tools/poi-dsl-exporter/pom.xml clean package
```

产物：

`tools/poi-dsl-exporter/target/poi-dsl-exporter-0.1.0.jar`

## 使用

```bash
java -jar tools/poi-dsl-exporter/target/poi-dsl-exporter-0.1.0.jar \
  --input /path/to/vdoc.json \
  --output /path/to/out.docx \
  --target auto \
  --theme enterprise-light \
  --strict
```

可选参数：

- `--target docx|pptx|auto`
- `--theme <themeId>`（如 `enterprise-light`, `enterprise-dark`, `ocean-contrast`）
- `--strict`（严格校验 DSL，发现问题即失败）

### 原生图表开关（Report/PPT DSL）

在 `report.root.props` 或 `ppt.root.props` 增加：

- `nativeChartEnabled: true|false`（默认 `true`）
- `nativeChartWidthEmu: number`（默认 `6000000`）
- `nativeChartHeightEmu: number`（默认 `3200000`）

当 `chart` 数据可解析时，会输出 Apache POI XDDF 真实图表；否则自动降级为图卡+样本预览。
当前导出数据来源优先级：

1. `chart.props.sampleRows`
2. `node.data.queryId` 对应的 `doc.queries[*].rows/result/data`
3. `node.data.sourceId` 对应的 `doc.dataSources[*].staticData`
4. 第一个可用静态数据源

PPT 原生图表会按节点 `layout(x,y,w,h)` 进行锚点定位（兼容不同 POI 版本 API）。

### 图表类型覆盖（与前端 DSL 对齐）

- `line`: 原生线图
- `bar`: 原生柱图
- `pie`: 原生饼图
- `scatter`: 原生能力降级为线图策略
- `radar`: 原生能力降级为线图策略
- `heatmap`: 原生能力降级为柱图策略
- `kline`: 原生能力降级为线图策略
- `boxplot`: 原生能力降级为柱图策略
- `sankey`: 原生能力降级为柱图策略 + relation flavor
- `graph`: 原生能力降级为散点/线图策略 + relation flavor
- `treemap`: 原生能力降级为饼图策略 + matrix flavor
- `sunburst`: 原生能力降级为饼图策略 + matrix flavor
- `parallel`: 原生能力降级为线图策略
- `funnel`: 原生能力降级为柱图策略 + matrix flavor
- `gauge`: 原生能力降级为仪表语义饼图策略
- `calendar`: 原生能力降级为热力柱图策略 + time flavor
- `custom`: 原生能力降级为线图策略 + custom flavor
- `combo`（兼容类型）: 原生柱线组合图

## 扩展示例

1. 新增图表类型：

- 实现 `ReportDocxExporter.DocxChartFlavorRenderer` 或 `DeckPptxExporter.PptxChartFlavorRenderer`
- 通过 `registerChartFlavorRenderer(...)` 注册（会自动插入到默认 fallback 之前）
- 如果 DSL 字段变化，先扩展 `ChartSpecParser`，避免在渲染层散落解析逻辑

```java
ReportDocxExporter exporter = new ReportDocxExporter()
        .registerChartFlavorRenderer(new ReportDocxExporter.DocxChartFlavorRenderer() {
            @Override
            public boolean supports(String chartType) {
                return "sankey".equalsIgnoreCase(chartType);
            }

            @Override
            public void render(ReportDocxExporter.DocxChartFlavorContext context, ChartSpec spec) {
                context.appendInfoRow("Sankey 策略: 适合流向分析，建议显示 TopN 路径。");
            }
        });
```

2. 新增主题：

- 在 `DefaultStyleResolver` 中新增主题 `ThemeTokens`
- 或在 DSL `root.props.theme` 注入覆盖项（如 `primary`, `fontPrimary`, `palette`）

3. 新增块类型（如 `table`, `kpi`, `image`）：

- 新建 `NodeRenderer` 实现并注册到 `RendererRegistry`
- 不需要修改导出主流程

## 本地样例与 Showcase

已内置样例（来自 web 项目 DSL）：

- `examples/report-weekly-ops.json`
- `examples/report-rca.json`
- `examples/report-exec.json`
- `examples/report-monthly-ops-enterprise.json`
- `examples/report-quarterly-transformation-showcase.json`
- `examples/report-chart-types-showcase.json`
- `examples/ppt-ops-review.json`
- `examples/ppt-incident.json`
- `examples/ppt-business.json`
- `examples/ppt-cover-layouts.json`
- `examples/ppt-quarterly-board-review.json`
- `examples/ppt-quarterly-transformation-showcase.json`
- `examples/ppt-chart-types-showcase.json`

一键导出脚本：

```powershell
powershell -ExecutionPolicy Bypass -File tools/poi-dsl-exporter/scripts/export-examples.ps1
```

输出目录默认：

`tools/poi-dsl-exporter/showcase-out`
