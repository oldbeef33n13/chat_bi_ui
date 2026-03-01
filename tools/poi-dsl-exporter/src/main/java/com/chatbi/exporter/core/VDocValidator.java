package com.chatbi.exporter.core;

import com.chatbi.exporter.chart.ChartTypeCatalog;
import com.chatbi.exporter.model.VDoc;
import com.chatbi.exporter.model.VNode;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class VDocValidator {
    public List<String> validate(VDoc doc) {
        List<String> issues = new ArrayList<>();
        if (doc == null) {
            issues.add("Document is null.");
            return issues;
        }
        if (blank(doc.docType)) {
            issues.add("docType is required.");
        }
        if (doc.root == null) {
            issues.add("root node is required.");
        }
        issues.addAll(validateChartTypes(doc.root));
        if (!blank(doc.schemaVersion)) {
            Integer major = parseMajor(doc.schemaVersion);
            if (major == null) {
                issues.add("schemaVersion is invalid: " + doc.schemaVersion);
            } else if (major > 1) {
                issues.add("schemaVersion major is newer than exporter support: " + doc.schemaVersion);
            }
        }
        return issues;
    }

    public void ensureValid(VDoc doc, boolean strict) {
        List<String> issues = validate(doc);
        if (issues.isEmpty()) {
            return;
        }
        if (strict) {
            throw new IllegalArgumentException("DSL validation failed: " + String.join("; ", issues));
        }
        System.err.println("[warn] DSL validation issues: " + String.join("; ", issues));
    }

    private Integer parseMajor(String schemaVersion) {
        String[] pieces = schemaVersion.split("\\.");
        if (pieces.length == 0) {
            return null;
        }
        try {
            return Integer.parseInt(pieces[0].trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private List<String> validateChartTypes(VNode root) {
        List<String> issues = new ArrayList<>();
        if (root == null) {
            return issues;
        }
        visit(root, issues);
        return issues;
    }

    private void visit(VNode node, List<String> issues) {
        if (node == null) {
            return;
        }
        if ("chart".equalsIgnoreCase(node.kind)) {
            String chartType = extractChartType(node.propsOrEmpty());
            if (!chartType.isBlank() && !ChartTypeCatalog.isWebChartType(chartType)) {
                issues.add("Unsupported chartType '" + chartType + "' at node " + VNode.asString(node.id, "-"));
            }
        }
        for (VNode child : node.childrenOrEmpty()) {
            visit(child, issues);
        }
    }

    private String extractChartType(Map<String, Object> props) {
        Object value = props.get("chartType");
        return value == null ? "" : String.valueOf(value);
    }
}
