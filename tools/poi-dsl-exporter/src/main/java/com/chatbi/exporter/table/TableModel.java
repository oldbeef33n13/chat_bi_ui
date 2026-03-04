package com.chatbi.exporter.table;

import java.util.Collections;
import java.util.List;

public record TableModel(
        String title,
        List<TableColumn> columns,
        List<List<TableCell>> headerRows,
        List<List<TableCell>> bodyRows,
        boolean repeatHeader,
        boolean zebra
) {
    public TableModel {
        columns = columns == null ? Collections.emptyList() : List.copyOf(columns);
        headerRows = headerRows == null ? Collections.emptyList() : copyGrid(headerRows);
        bodyRows = bodyRows == null ? Collections.emptyList() : copyGrid(bodyRows);
    }

    public int columnCount() {
        return columns.size();
    }

    public int headerRowCount() {
        return headerRows.size();
    }

    public int bodyRowCount() {
        return bodyRows.size();
    }

    public int totalRowCount() {
        return headerRowCount() + bodyRowCount();
    }

    private static List<List<TableCell>> copyGrid(List<List<TableCell>> rows) {
        return rows.stream().map(row -> row == null ? Collections.<TableCell>emptyList() : List.copyOf(row)).toList();
    }
}

