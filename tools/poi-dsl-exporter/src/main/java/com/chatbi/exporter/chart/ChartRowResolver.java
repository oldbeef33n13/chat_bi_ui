package com.chatbi.exporter.chart;

import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

public final class ChartRowResolver {
    public List<Map<String, Object>> resolve(VDoc doc, VNode chartNode, ChartSpec spec) {
        if (spec != null && !spec.sampleRows().isEmpty()) {
            return spec.sampleRows();
        }

        String sourceId = sourceId(chartNode);
        String queryId = queryId(chartNode);

        List<Map<String, Object>> rows = fromQueryResult(doc, queryId);
        if (!rows.isEmpty()) {
            return rows;
        }

        rows = fromSource(doc, sourceId);
        if (!rows.isEmpty()) {
            return rows;
        }

        rows = fromQueryBySource(doc, sourceId);
        if (!rows.isEmpty()) {
            return rows;
        }

        rows = fromFirstSource(doc);
        if (!rows.isEmpty()) {
            return rows;
        }

        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private String sourceId(VNode chartNode) {
        if (chartNode == null || chartNode.data == null) {
            return "";
        }
        Object value = chartNode.data.get("sourceId");
        return value == null ? "" : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private String queryId(VNode chartNode) {
        if (chartNode == null || chartNode.data == null) {
            return "";
        }
        Object value = chartNode.data.get("queryId");
        return value == null ? "" : String.valueOf(value);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fromSource(VDoc doc, String sourceId) {
        if (doc == null || doc.dataSources == null || doc.dataSources.isEmpty()) {
            return Collections.emptyList();
        }
        for (Map<String, Object> source : doc.dataSources) {
            if (!sourceId.isBlank() && !sourceId.equals(String.valueOf(source.get("id")))) {
                continue;
            }
            List<Map<String, Object>> rows = decodeRows(source.get("staticData"));
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fromFirstSource(VDoc doc) {
        if (doc == null || doc.dataSources == null || doc.dataSources.isEmpty()) {
            return Collections.emptyList();
        }
        for (Map<String, Object> source : doc.dataSources) {
            List<Map<String, Object>> rows = decodeRows(source.get("staticData"));
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fromQueryResult(VDoc doc, String queryId) {
        if (queryId.isBlank() || doc == null || doc.queries == null) {
            return Collections.emptyList();
        }
        for (Map<String, Object> query : doc.queries) {
            if (!queryId.equals(String.valueOf(query.get("queryId")))) {
                continue;
            }
            List<Map<String, Object>> rows = decodeRows(query.get("rows"));
            if (!rows.isEmpty()) {
                return rows;
            }
            rows = decodeRows(query.get("result"));
            if (!rows.isEmpty()) {
                return rows;
            }
            rows = decodeRows(query.get("data"));
            if (!rows.isEmpty()) {
                return rows;
            }
            rows = decodeRows(query.get("sampleRows"));
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> fromQueryBySource(VDoc doc, String sourceId) {
        if (sourceId.isBlank() || doc == null || doc.queries == null) {
            return Collections.emptyList();
        }
        for (Map<String, Object> query : doc.queries) {
            if (!sourceId.equals(String.valueOf(query.get("sourceId")))) {
                continue;
            }
            List<Map<String, Object>> rows = decodeRows(query.get("rows"));
            if (!rows.isEmpty()) {
                return rows;
            }
            rows = decodeRows(query.get("result"));
            if (!rows.isEmpty()) {
                return rows;
            }
            rows = decodeRows(query.get("data"));
            if (!rows.isEmpty()) {
                return rows;
            }
            rows = decodeRows(query.get("sampleRows"));
            if (!rows.isEmpty()) {
                return rows;
            }
        }
        return Collections.emptyList();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> decodeRows(Object raw) {
        if (raw == null) {
            return Collections.emptyList();
        }
        if (raw instanceof List<?> list) {
            List<Map<String, Object>> rows = new ArrayList<>();
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    rows.add((Map<String, Object>) map);
                }
            }
            return rows;
        }
        if (raw instanceof Map<?, ?> map) {
            Map<String, Object> obj = (Map<String, Object>) map;
            Object rows = obj.get("rows");
            if (rows instanceof List<?>) {
                return decodeRows(rows);
            }
            Object data = obj.get("data");
            if (data instanceof List<?>) {
                return decodeRows(data);
            }
            if (data instanceof Map<?, ?> dataMap) {
                return decodeRows(dataMap);
            }
        }
        return Collections.emptyList();
    }
}
