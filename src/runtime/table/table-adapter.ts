import type { TableColumnSpec, TableHeaderCellSpec, TableMergeSpec, TablePivotSpec, TableSpec, VStyle } from "../../core/doc/types";

export interface TableRenderColumn {
  key: string;
  title: string;
  width: number;
  align: "left" | "center" | "right";
  format?: string;
}

export interface TableRenderCell {
  text: string;
  rowSpan: number;
  colSpan: number;
  align: "left" | "center" | "right";
  hidden: boolean;
}

export interface TableRenderModel {
  titleText: string;
  titleStyle?: VStyle;
  columns: TableRenderColumn[];
  headerRows: TableRenderCell[][];
  bodyRows: TableRenderCell[][];
  repeatHeader: boolean;
  zebra: boolean;
}

interface PivotAggregate {
  sum: number;
  count: number;
  min: number;
  max: number;
}

interface PivotBucket {
  dims: Record<string, unknown>;
  values: Map<string, PivotAggregate>;
}

interface PivotResult {
  columns: TableRenderColumn[];
  rows: Array<Record<string, unknown>>;
  headerRows: TableHeaderCellSpec[][];
}

type Align = "left" | "center" | "right";

/**
 * TableSpec -> TableRenderModel 适配层。
 * 支持：静态列、推断列、多级表头、merge、pivot 动态列、格式化。
 */
export const buildTableRenderModel = (
  rawSpec: TableSpec | Record<string, unknown> | undefined,
  sourceRows: Array<Record<string, unknown>>
): TableRenderModel => {
  const spec = normalizeSpec(rawSpec);
  const repeatHeader = spec.repeatHeader ?? true;
  const zebra = spec.zebra ?? true;
  const titleText = typeof spec.titleText === "string" ? spec.titleText : "";
  const maxRows = Math.max(1, Math.floor(spec.maxRows ?? 200));
  const rowsInput = resolveRowsInput(spec, sourceRows);
  const titleMap = new Map<string, string>((spec.columns ?? []).map((col) => [col.key, col.title ?? col.key]));
  const pivot = buildPivot(rowsInput, spec.pivot, titleMap);
  const rows = (pivot?.rows ?? rowsInput).slice(0, maxRows);

  let columns = pivot?.columns ?? normalizeColumns(spec.columns);
  if (columns.length === 0) {
    columns = inferColumns(rows);
  }
  if (columns.length === 0) {
    columns = [{ key: "value", title: "value", width: 120, align: "left" }];
  }

  const headerRows = spec.headerRows && spec.headerRows.length > 0
    ? buildHeaderGrid(spec.headerRows, columns)
    : pivot && pivot.headerRows.length > 0
      ? buildHeaderGrid(pivot.headerRows, columns)
      : [columns.map((col) => anchorCell(col.title, "center"))];

  const bodyRows = buildBodyGrid(rows, columns);
  // merge 在 header/body 两个作用域独立应用。
  applyMergeSpecs(headerRows, spec.mergeCells, "header");
  applyMergeSpecs(bodyRows, spec.mergeCells, "body");

  return {
    titleText,
    titleStyle: spec.titleStyle,
    columns,
    headerRows,
    bodyRows,
    repeatHeader,
    zebra
  };
};

const normalizeSpec = (rawSpec: TableSpec | Record<string, unknown> | undefined): TableSpec => {
  if (!rawSpec || typeof rawSpec !== "object") {
    return {};
  }
  return rawSpec as TableSpec;
};

/** rows 既支持对象数组，也支持二维数组。 */
const resolveRowsInput = (spec: TableSpec, sourceRows: Array<Record<string, unknown>>): Array<Record<string, unknown>> => {
  const inline = spec.rows;
  if (!Array.isArray(inline) || inline.length === 0) {
    return sourceRows;
  }
  const columns = normalizeColumns(spec.columns);
  return inline
    .map((row) => {
      if (Array.isArray(row)) {
        return rowArrayToObject(row, columns);
      }
      if (row && typeof row === "object") {
        return row as Record<string, unknown>;
      }
      return undefined;
    })
    .filter((row): row is Record<string, unknown> => !!row);
};

/** 将二维数组行映射为对象行（按列 key 对齐）。 */
const rowArrayToObject = (values: unknown[], columns: TableRenderColumn[]): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  values.forEach((value, index) => {
    const key = columns[index]?.key ?? `c${index + 1}`;
    row[key] = value;
  });
  return row;
};

/** 规范化列定义并补齐默认值。 */
const normalizeColumns = (rawColumns: TableColumnSpec[] | undefined): TableRenderColumn[] => {
  if (!Array.isArray(rawColumns)) {
    return [];
  }
  const columns: TableRenderColumn[] = [];
  rawColumns.forEach((column) => {
    if (!column || typeof column.key !== "string" || column.key.trim() === "") {
      return;
    }
    const key = column.key.trim();
    columns.push({
      key,
      title: typeof column.title === "string" && column.title.trim() !== "" ? column.title : key,
      width: Number.isFinite(column.width) && (column.width ?? 0) > 0 ? Number(column.width) : 120,
      align: normalizeAlign(column.align),
      format: typeof column.format === "string" ? column.format : undefined
    });
  });
  return columns;
};

/** 当列定义缺失时，根据数据 key 自动推断列。 */
const inferColumns = (rows: Array<Record<string, unknown>>): TableRenderColumn[] => {
  if (rows.length === 0) {
    return [];
  }
  const keys: string[] = [];
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    });
  });
  return keys.map((key) => ({ key, title: key, width: 120, align: "left" }));
};

/** Pivot 动态列构建：rowFields + columnField + valueField + agg。 */
const buildPivot = (
  rows: Array<Record<string, unknown>>,
  pivot: TablePivotSpec | undefined,
  titleMap: Map<string, string>
): PivotResult | null => {
  // pivot 关闭或关键字段缺失时不生效，直接走普通表格流程。
  if (!pivot) {
    return null;
  }
  const enabled = pivot.enabled ?? true;
  if (!enabled) {
    return null;
  }
  const columnField = typeof pivot.columnField === "string" ? pivot.columnField.trim() : "";
  const valueField = typeof pivot.valueField === "string" ? pivot.valueField.trim() : "";
  const rowFields = Array.isArray(pivot.rowFields) ? pivot.rowFields.filter((item) => typeof item === "string" && item.trim() !== "") : [];
  if (columnField === "" || valueField === "") {
    return null;
  }

  const agg = normalizePivotAgg(pivot.agg);
  const fill = typeof pivot.fill === "number" && Number.isFinite(pivot.fill) ? pivot.fill : 0;
  const valueTitle = typeof pivot.valueTitle === "string" && pivot.valueTitle.trim() !== "" ? pivot.valueTitle.trim() : valueField;
  const colKeys: string[] = [];
  const buckets = new Map<string, PivotBucket>();

  rows.forEach((row) => {
    const colKey = stringifyValue(row[columnField], "");
    if (colKey === "") {
      return;
    }
    if (!colKeys.includes(colKey)) {
      colKeys.push(colKey);
    }
    const rowKey = rowFields.length === 0 ? "__all__" : rowFields.map((field) => stringifyValue(row[field], "")).join("\u0001");
    let bucket = buckets.get(rowKey);
    if (!bucket) {
      const dims: Record<string, unknown> = {};
      rowFields.forEach((field) => {
        dims[field] = row[field];
      });
      bucket = { dims, values: new Map<string, PivotAggregate>() };
      buckets.set(rowKey, bucket);
    }
    const aggregate = bucket.values.get(colKey) ?? {
      sum: 0,
      count: 0,
      min: Number.POSITIVE_INFINITY,
      max: Number.NEGATIVE_INFINITY
    };
    const numeric = toNumber(row[valueField]);
    if (agg === "count") {
      aggregate.count += 1;
    } else if (numeric !== null) {
      aggregate.sum += numeric;
      aggregate.count += 1;
      aggregate.min = Math.min(aggregate.min, numeric);
      aggregate.max = Math.max(aggregate.max, numeric);
    }
    bucket.values.set(colKey, aggregate);
  });

  if (colKeys.length === 0) {
    return null;
  }

  const columns: TableRenderColumn[] = [
    ...rowFields.map((field) => ({
      key: field,
      title: titleMap.get(field) ?? field,
      width: 130,
      align: "left" as const
    })),
    ...colKeys.map((col) => ({
      key: col,
      title: col,
      width: 120,
      align: "right" as const
    }))
  ];

  const outputRows = [...buckets.values()].map((bucket) => {
    const row: Record<string, unknown> = { ...bucket.dims };
    colKeys.forEach((col) => {
      const aggregate = bucket.values.get(col);
      row[col] = aggregate ? aggregateValue(aggregate, agg) : fill;
    });
    return row;
  });

  const headerRows: TableHeaderCellSpec[][] =
    rowFields.length > 0
      ? [
          [
            ...rowFields.map((field) => ({
              text: titleMap.get(field) ?? field,
              rowSpan: 2,
              colSpan: 1,
              align: "center" as const
            })),
            {
              text: valueTitle,
              rowSpan: 1,
              colSpan: Math.max(1, colKeys.length),
              align: "center" as const
            }
          ],
          colKeys.map((col) => ({ text: col, rowSpan: 1, colSpan: 1, align: "center" as const }))
        ]
      : [colKeys.map((col) => ({ text: col, rowSpan: 1, colSpan: 1, align: "center" as const }))];

  return { columns, rows: outputRows, headerRows };
};

/** 聚合函数兜底与规范化。 */
const normalizePivotAgg = (agg: TablePivotSpec["agg"]): NonNullable<TablePivotSpec["agg"]> => {
  switch (agg) {
    case "avg":
    case "min":
    case "max":
    case "count":
    case "sum":
      return agg;
    default:
      return "sum";
  }
};

/** 根据聚合策略计算单元值。 */
const aggregateValue = (aggregate: PivotAggregate, agg: NonNullable<TablePivotSpec["agg"]>): number => {
  switch (agg) {
    case "avg":
      return aggregate.count > 0 ? aggregate.sum / aggregate.count : 0;
    case "min":
      return Number.isFinite(aggregate.min) ? aggregate.min : 0;
    case "max":
      return Number.isFinite(aggregate.max) ? aggregate.max : 0;
    case "count":
      return aggregate.count;
    case "sum":
    default:
      return aggregate.sum;
  }
};

/** 构建完整表头网格，并处理 rowSpan/colSpan。 */
const buildHeaderGrid = (defs: TableHeaderCellSpec[][], columns: TableRenderColumn[]): TableRenderCell[][] => {
  const rowCount = defs.length;
  const colCount = columns.length;
  if (rowCount === 0 || colCount === 0) {
    return [];
  }
  const matrix: Array<Array<TableRenderCell | null>> = Array.from({ length: rowCount }, () => Array.from({ length: colCount }, () => null));

  // 先按定义填锚点，再补 hidden 占位，最后兜底空单元格。
  defs.forEach((cells, rowIndex) => {
    let cursor = 0;
    cells.forEach((cell) => {
      while (cursor < colCount && matrix[rowIndex]?.[cursor] !== null) {
        cursor += 1;
      }
      if (cursor >= colCount) {
        return;
      }
      const colSpan = clampInt(cell.colSpan ?? 1, 1, colCount - cursor);
      const rowSpan = clampInt(cell.rowSpan ?? 1, 1, rowCount - rowIndex);
      const align = normalizeAlign(cell.align ?? "center");
      const text = stringifyValue(cell.text ?? cell.title, "");
      matrix[rowIndex]![cursor] = anchorCell(text, align, rowSpan, colSpan);
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        for (let c = cursor; c < cursor + colSpan; c += 1) {
          if (r === rowIndex && c === cursor) {
            continue;
          }
          matrix[r]![c] = hiddenCell(align);
        }
      }
      cursor += colSpan;
    });
  });

  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      if (!matrix[row]?.[col]) {
        const fallback = row === rowCount - 1 ? columns[col]?.title ?? "" : "";
        matrix[row]![col] = anchorCell(fallback, "center");
      }
    }
  }
  return matrix.map((row) => row.map((cell) => cell ?? anchorCell("", "center")));
};

/** 构建数据区网格。 */
const buildBodyGrid = (rows: Array<Record<string, unknown>>, columns: TableRenderColumn[]): TableRenderCell[][] =>
  rows.map((row) =>
    columns.map((column) => {
      const value = row[column.key];
      const text = formatValue(value, column.format);
      return anchorCell(text, resolveBodyAlign(column.align, value));
    })
  );

/** 在指定作用域应用 mergeCells 配置（header/body）。 */
const applyMergeSpecs = (
  grid: TableRenderCell[][],
  mergeSpecs: TableMergeSpec[] | undefined,
  scope: "header" | "body"
): void => {
  if (!Array.isArray(mergeSpecs) || mergeSpecs.length === 0 || grid.length === 0) {
    return;
  }
  mergeSpecs.forEach((merge) => {
    if (!merge || typeof merge !== "object") {
      return;
    }
    const mergeScope = merge.scope ?? "body";
    if (mergeScope !== scope) {
      return;
    }
    applyMerge(grid, merge.row, merge.col, merge.rowSpan ?? 1, merge.colSpan ?? 1);
  });
};

/** 在二维网格执行一次合并，锚点保留，覆盖区改为 hidden。 */
const applyMerge = (grid: TableRenderCell[][], row: number, col: number, rowSpan: number, colSpan: number): void => {
  const rowCount = grid.length;
  const colCount = grid[0]?.length ?? 0;
  if (rowCount === 0 || colCount === 0) {
    return;
  }
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= rowCount || col >= colCount) {
    return;
  }
  const anchor = grid[row]?.[col];
  if (!anchor || anchor.hidden) {
    return;
  }
  const rs = clampInt(rowSpan, 1, rowCount - row);
  const cs = clampInt(colSpan, 1, colCount - col);
  grid[row]![col] = { ...anchor, rowSpan: rs, colSpan: cs, hidden: false };
  for (let r = row; r < row + rs; r += 1) {
    for (let c = col; c < col + cs; c += 1) {
      if (r === row && c === col) {
        continue;
      }
      const cell = grid[r]?.[c] ?? hiddenCell(anchor.align);
      grid[r]![c] = { ...cell, hidden: true, rowSpan: 1, colSpan: 1 };
    }
  }
};

/** 数据区对齐规则：显式对齐优先，否则数值右对齐。 */
const resolveBodyAlign = (align: Align, value: unknown): Align => {
  if (align !== "left") {
    return align;
  }
  if (typeof value === "number") {
    return "right";
  }
  return "left";
};

/** 单元格值格式化（百分比/整数/小数）。 */
const formatValue = (value: unknown, format: string | undefined): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number") {
    if (format === "pct") {
      return `${(value * 100).toFixed(2)}%`;
    }
    if (format === "int") {
      return `${Math.round(value)}`;
    }
    return Number.isInteger(value) ? `${value}` : value.toFixed(2);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

/** 构造可见锚点单元格。 */
const anchorCell = (text: string, align: Align, rowSpan = 1, colSpan = 1): TableRenderCell => ({
  text,
  rowSpan: Math.max(1, rowSpan),
  colSpan: Math.max(1, colSpan),
  align,
  hidden: false
});

/** 构造隐藏占位单元格（用于合并覆盖区）。 */
const hiddenCell = (align: Align): TableRenderCell => ({
  text: "",
  rowSpan: 1,
  colSpan: 1,
  align,
  hidden: true
});

/** 整数裁剪。 */
const clampInt = (value: number, min: number, max: number): number => {
  const integer = Math.floor(Number.isFinite(value) ? value : min);
  return Math.max(min, Math.min(max, integer));
};

/** 对齐值标准化。 */
const normalizeAlign = (align: unknown): Align => {
  if (align === "center" || align === "right" || align === "left") {
    return align;
  }
  return "left";
};

/** 容错数值转换。 */
const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

/** 统一字符串化，空值回退 fallback。 */
const stringifyValue = (value: unknown, fallback: string): string => {
  if (value === null || value === undefined) {
    return fallback;
  }
  const text = String(value).trim();
  return text === "" ? fallback : text;
};
