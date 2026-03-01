package com.chatbi.exporter.chart;

import org.apache.poi.xddf.usermodel.chart.AxisPosition;
import org.apache.poi.xddf.usermodel.chart.ChartTypes;
import org.apache.poi.xddf.usermodel.chart.LegendPosition;
import org.apache.poi.xddf.usermodel.chart.XDDFCategoryAxis;
import org.apache.poi.xddf.usermodel.chart.XDDFCategoryDataSource;
import org.apache.poi.xddf.usermodel.chart.XDDFChart;
import org.apache.poi.xddf.usermodel.chart.XDDFChartData;
import org.apache.poi.xddf.usermodel.chart.XDDFChartLegend;
import org.apache.poi.xddf.usermodel.chart.XDDFDataSourcesFactory;
import org.apache.poi.xddf.usermodel.chart.XDDFNumericalDataSource;
import org.apache.poi.xddf.usermodel.chart.XDDFValueAxis;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class PoiChartRenderer {
    private static final int MAX_CATEGORIES = 80;
    private static final int MAX_SERIES = 12;

    private final ChartDatasetBuilder datasetBuilder;
    private final ChartOptionPatchAdapter optionPatchAdapter;

    public PoiChartRenderer() {
        this(new ChartDatasetBuilder(), new ChartOptionPatchAdapter());
    }

    public PoiChartRenderer(ChartDatasetBuilder datasetBuilder) {
        this(datasetBuilder, new ChartOptionPatchAdapter());
    }

    public PoiChartRenderer(ChartDatasetBuilder datasetBuilder, ChartOptionPatchAdapter optionPatchAdapter) {
        this.datasetBuilder = datasetBuilder;
        this.optionPatchAdapter = optionPatchAdapter;
    }

    public boolean render(XDDFChart chart, ChartSpec spec) {
        return render(chart, spec, spec == null ? List.of() : spec.sampleRows());
    }

    public boolean render(XDDFChart chart, ChartSpec spec, List<Map<String, Object>> rows) {
        ChartDataset dataset = normalizeDataset(datasetBuilder.build(spec, rows));
        if (!dataset.isRenderable()) {
            return false;
        }

        setupHeader(chart, spec);
        String type = resolveType(spec);
        return switch (type) {
            case "line" -> renderLine(chart, spec, dataset);
            case "bar" -> renderBar(chart, spec, dataset);
            case "pie" -> renderPie(chart, spec, dataset);
            case "combo" -> renderCombo(chart, spec, dataset);
            case "scatter" -> renderScatter(chart, spec, dataset);
            case "radar" -> renderRadar(chart, spec, dataset);
            case "heatmap" -> renderHeatmap(chart, spec, dataset);
            case "kline" -> renderKline(chart, spec, dataset);
            case "boxplot" -> renderBoxplot(chart, spec, dataset);
            case "sankey" -> renderSankey(chart, spec, dataset);
            case "graph" -> renderGraph(chart, spec, dataset);
            case "treemap" -> renderTreemap(chart, spec, dataset);
            case "sunburst" -> renderSunburst(chart, spec, dataset);
            case "parallel" -> renderParallel(chart, spec, dataset);
            case "funnel" -> renderFunnel(chart, spec, dataset);
            case "gauge" -> renderGauge(chart, spec, dataset);
            case "calendar" -> renderCalendar(chart, spec, dataset);
            case "custom" -> renderCustom(chart, spec, dataset);
            default -> renderLine(chart, spec, dataset);
        };
    }

    private void setupHeader(XDDFChart chart, ChartSpec spec) {
        String title = spec == null ? "图表" : optionPatchAdapter.resolveTitle(spec);
        chart.setTitleText(title);
        chart.setTitleOverlay(false);
        if (spec == null || optionPatchAdapter.resolveLegendShow(spec)) {
            XDDFChartLegend legend = chart.getOrAddLegend();
            legend.setPosition(spec == null ? LegendPosition.RIGHT : optionPatchAdapter.resolveLegendPosition(spec));
        }
    }

    private ChartDataset normalizeDataset(ChartDataset dataset) {
        if (!dataset.isRenderable()) {
            return dataset;
        }
        List<String> categories = dataset.categories();
        List<Map.Entry<String, List<Double>>> seriesEntries = List.copyOf(dataset.series().entrySet());
        if (categories.size() <= MAX_CATEGORIES && seriesEntries.size() <= MAX_SERIES) {
            return dataset;
        }

        List<Integer> categoryIndexes = sampleIndexes(categories.size(), MAX_CATEGORIES);
        List<String> sampledCategories = new ArrayList<>(categoryIndexes.size());
        for (int index : categoryIndexes) {
            sampledCategories.add(categories.get(index));
        }

        LinkedHashMap<String, List<Double>> sampledSeries = new LinkedHashMap<>();
        int seriesCount = Math.min(MAX_SERIES, seriesEntries.size());
        for (int s = 0; s < seriesCount; s++) {
            Map.Entry<String, List<Double>> entry = seriesEntries.get(s);
            List<Double> values = entry.getValue();
            ArrayList<Double> sampledValues = new ArrayList<>(categoryIndexes.size());
            for (int index : categoryIndexes) {
                sampledValues.add(index < values.size() ? values.get(index) : 0.0);
            }
            sampledSeries.put(entry.getKey(), sampledValues);
        }
        return new ChartDataset(dataset.categoryLabel(), sampledCategories, sampledSeries);
    }

    private List<Integer> sampleIndexes(int total, int limit) {
        if (total <= limit) {
            List<Integer> all = new ArrayList<>(total);
            for (int i = 0; i < total; i++) {
                all.add(i);
            }
            return all;
        }
        List<Integer> indexes = new ArrayList<>(limit);
        double step = (double) (total - 1) / (double) (limit - 1);
        for (int i = 0; i < limit; i++) {
            int index = (int) Math.round(i * step);
            if (index >= total) {
                index = total - 1;
            }
            indexes.add(index);
        }
        return indexes;
    }

    private boolean renderLine(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        XDDFCategoryAxis xAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis yAxis = chart.createValueAxis(AxisPosition.LEFT);
        if (spec == null) {
            xAxis.setTitle(dataset.categoryLabel());
            yAxis.setTitle("Value");
        } else {
            xAxis.setTitle(optionPatchAdapter.resolveXAxisTitle(spec));
            yAxis.setTitle(optionPatchAdapter.resolveYAxisTitle(spec));
        }

        XDDFCategoryDataSource categories = XDDFDataSourcesFactory.fromArray(dataset.categoryArray());
        XDDFChartData data = chart.createData(ChartTypes.LINE, xAxis, yAxis);
        addSeries(data, categories, dataset.seriesArrays());
        chart.plot(data);
        return true;
    }

    private boolean renderBar(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        XDDFCategoryAxis xAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis yAxis = chart.createValueAxis(AxisPosition.LEFT);
        if (spec == null) {
            xAxis.setTitle(dataset.categoryLabel());
            yAxis.setTitle("Value");
        } else {
            xAxis.setTitle(optionPatchAdapter.resolveXAxisTitle(spec));
            yAxis.setTitle(optionPatchAdapter.resolveYAxisTitle(spec));
        }

        XDDFCategoryDataSource categories = XDDFDataSourcesFactory.fromArray(dataset.categoryArray());
        XDDFChartData data = chart.createData(ChartTypes.BAR, xAxis, yAxis);
        addSeries(data, categories, dataset.seriesArrays());
        chart.plot(data);
        return true;
    }

    private boolean renderPie(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        List<Map.Entry<String, Double[]>> series = dataset.seriesArrays();
        if (series.isEmpty()) {
            return false;
        }
        XDDFCategoryDataSource categories = XDDFDataSourcesFactory.fromArray(dataset.categoryArray());
        XDDFChartData data = chart.createData(ChartTypes.PIE, null, null);
        Map.Entry<String, Double[]> first = series.get(0);
        XDDFNumericalDataSource<Double> values = XDDFDataSourcesFactory.fromArray(first.getValue());
        XDDFChartData.Series chartSeries = data.addSeries(categories, values);
        chartSeries.setTitle(first.getKey(), null);
        chart.plot(data);
        return true;
    }

    private boolean renderCombo(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        List<Map.Entry<String, Double[]>> series = dataset.seriesArrays();
        if (series.isEmpty()) {
            return false;
        }
        if (series.size() == 1) {
            return renderLine(chart, spec, dataset);
        }

        XDDFCategoryAxis xAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis leftAxis = chart.createValueAxis(AxisPosition.LEFT);
        XDDFValueAxis rightAxis = chart.createValueAxis(AxisPosition.RIGHT);
        if (spec == null) {
            xAxis.setTitle(dataset.categoryLabel());
            leftAxis.setTitle("Primary");
            rightAxis.setTitle("Secondary");
        } else {
            xAxis.setTitle(optionPatchAdapter.resolveXAxisTitle(spec));
            leftAxis.setTitle(optionPatchAdapter.resolveYAxisTitle(spec));
            rightAxis.setTitle(spec.dualAxis() ? spec.secondAxisField() : "Secondary");
        }

        XDDFCategoryDataSource categories = XDDFDataSourcesFactory.fromArray(dataset.categoryArray());

        XDDFChartData barData = chart.createData(ChartTypes.BAR, xAxis, leftAxis);
        Map.Entry<String, Double[]> first = series.get(0);
        XDDFNumericalDataSource<Double> firstValues = XDDFDataSourcesFactory.fromArray(first.getValue());
        XDDFChartData.Series barSeries = barData.addSeries(categories, firstValues);
        barSeries.setTitle(first.getKey(), null);
        chart.plot(barData);

        XDDFChartData lineData = chart.createData(ChartTypes.LINE, xAxis, rightAxis);
        for (int i = 1; i < series.size(); i++) {
            Map.Entry<String, Double[]> entry = series.get(i);
            XDDFNumericalDataSource<Double> values = XDDFDataSourcesFactory.fromArray(entry.getValue());
            XDDFChartData.Series lineSeries = lineData.addSeries(categories, values);
            lineSeries.setTitle(entry.getKey(), null);
        }
        chart.plot(lineData);
        return true;
    }

    private boolean renderScatter(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        List<Map.Entry<String, Double[]>> series = dataset.seriesArrays();
        if (series.isEmpty()) {
            return false;
        }

        XDDFValueAxis xAxis = chart.createValueAxis(AxisPosition.BOTTOM);
        XDDFValueAxis yAxis = chart.createValueAxis(AxisPosition.LEFT);
        if (spec == null) {
            xAxis.setTitle(dataset.categoryLabel());
            yAxis.setTitle("Value");
        } else {
            xAxis.setTitle(optionPatchAdapter.resolveXAxisTitle(spec));
            yAxis.setTitle(optionPatchAdapter.resolveYAxisTitle(spec));
        }

        Double[] xValues = series.get(0).getValue();
        XDDFChartData data = chart.createData(ChartTypes.SCATTER, xAxis, yAxis);
        if (series.size() == 1) {
            Double[] indexValues = new Double[xValues.length];
            for (int i = 0; i < xValues.length; i++) {
                indexValues[i] = (double) (i + 1);
            }
            XDDFNumericalDataSource<Double> xData = XDDFDataSourcesFactory.fromArray(indexValues);
            XDDFNumericalDataSource<Double> yData = XDDFDataSourcesFactory.fromArray(xValues);
            XDDFChartData.Series singleSeries = data.addSeries(xData, yData);
            singleSeries.setTitle(series.get(0).getKey(), null);
            chart.plot(data);
            return true;
        }

        XDDFNumericalDataSource<Double> xData = XDDFDataSourcesFactory.fromArray(xValues);
        for (int i = 1; i < series.size(); i++) {
            Map.Entry<String, Double[]> entry = series.get(i);
            XDDFNumericalDataSource<Double> yData = XDDFDataSourcesFactory.fromArray(entry.getValue());
            XDDFChartData.Series scatterSeries = data.addSeries(xData, yData);
            scatterSeries.setTitle(entry.getKey(), null);
        }
        chart.plot(data);
        return true;
    }

    private boolean renderRadar(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        XDDFCategoryAxis xAxis = chart.createCategoryAxis(AxisPosition.BOTTOM);
        XDDFValueAxis yAxis = chart.createValueAxis(AxisPosition.LEFT);
        if (spec == null) {
            xAxis.setTitle(dataset.categoryLabel());
            yAxis.setTitle("Value");
        } else {
            xAxis.setTitle(optionPatchAdapter.resolveXAxisTitle(spec));
            yAxis.setTitle(optionPatchAdapter.resolveYAxisTitle(spec));
        }

        XDDFCategoryDataSource categories = XDDFDataSourcesFactory.fromArray(dataset.categoryArray());
        XDDFChartData data = chart.createData(ChartTypes.RADAR, xAxis, yAxis);
        addSeries(data, categories, dataset.seriesArrays());
        chart.plot(data);
        return true;
    }

    private boolean renderHeatmap(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderBar(chart, spec, dataset);
    }

    private boolean renderKline(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderLine(chart, spec, dataset);
    }

    private boolean renderBoxplot(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderBar(chart, spec, dataset);
    }

    private boolean renderSankey(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderBar(chart, spec, dataset);
    }

    private boolean renderGraph(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderScatter(chart, spec, dataset);
    }

    private boolean renderTreemap(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderPie(chart, spec, dataset);
    }

    private boolean renderSunburst(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderPie(chart, spec, dataset);
    }

    private boolean renderParallel(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderLine(chart, spec, dataset);
    }

    private boolean renderFunnel(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderBar(chart, spec, dataset);
    }

    private boolean renderGauge(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        ChartDataset gaugeDataset = toGaugeDataset(dataset);
        return renderPie(chart, spec, gaugeDataset);
    }

    private boolean renderCalendar(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderHeatmap(chart, spec, dataset);
    }

    private boolean renderCustom(XDDFChart chart, ChartSpec spec, ChartDataset dataset) {
        return renderLine(chart, spec, dataset);
    }

    private ChartDataset toGaugeDataset(ChartDataset dataset) {
        List<Map.Entry<String, Double[]>> series = dataset.seriesArrays();
        if (series.isEmpty()) {
            return dataset;
        }
        Double[] first = series.get(0).getValue();
        double sum = 0.0;
        for (Double item : first) {
            sum += item == null ? 0.0 : item;
        }
        double avg = first.length == 0 ? 0.0 : sum / first.length;
        if (avg <= 1.0) {
            avg *= 100.0;
        }
        avg = Math.max(0.0, Math.min(100.0, avg));

        LinkedHashMap<String, List<Double>> gauge = new LinkedHashMap<>();
        gauge.put("gauge", List.of(avg, Math.max(0.0, 100.0 - avg)));
        return new ChartDataset("gauge", List.of("value", "rest"), gauge);
    }

    private void addSeries(
            XDDFChartData data,
            XDDFCategoryDataSource categories,
            List<Map.Entry<String, Double[]>> series
    ) {
        for (Map.Entry<String, Double[]> entry : series) {
            XDDFNumericalDataSource<Double> values = XDDFDataSourcesFactory.fromArray(entry.getValue());
            XDDFChartData.Series chartSeries = data.addSeries(categories, values);
            chartSeries.setTitle(entry.getKey(), null);
        }
    }

    private String resolveType(ChartSpec spec) {
        if (spec == null) {
            return "line";
        }
        String chartType = ChartTypeCatalog.normalize(spec.chartType());
        if (ChartTypeCatalog.isWebChartType(chartType) && !"custom".equals(chartType)) {
            return chartType;
        }
        String rawHint = optionPatchAdapter.resolveSeriesTypeHint(spec);
        if (rawHint != null && !rawHint.isBlank()) {
            String hint = ChartTypeCatalog.normalize(rawHint);
            if (ChartTypeCatalog.isWebChartType(hint)) {
                return hint;
            }
        }
        return chartType;
    }
}
