import type { ChartSpec, FilterDef, VNode } from "../../core/doc/types";

export type FilterOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";

export interface AdvancedFilterRule {
  id: string;
  field: string;
  op: FilterOperator;
  value: string | number | boolean | string[];
}

export interface AdvancedFilterGroup {
  logic: "AND" | "OR";
  rules: AdvancedFilterRule[];
}

const asNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return value;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const evaluateRule = (row: Record<string, unknown>, rule: AdvancedFilterRule): boolean => {
  const left = row[rule.field];
  const right = rule.value;
  switch (rule.op) {
    case "eq":
      return left === right;
    case "neq":
      return left !== right;
    case "gt":
      return asNumber(left) > asNumber(right);
    case "gte":
      return asNumber(left) >= asNumber(right);
    case "lt":
      return asNumber(left) < asNumber(right);
    case "lte":
      return asNumber(left) <= asNumber(right);
    case "contains":
      return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase());
    case "in":
      return Array.isArray(right) ? right.map((item) => String(item)).includes(String(left)) : false;
    default:
      return true;
  }
};

const isAdvancedGroup = (value: unknown): value is AdvancedFilterGroup =>
  !!value &&
  typeof value === "object" &&
  "logic" in (value as Record<string, unknown>) &&
  "rules" in (value as Record<string, unknown>) &&
  Array.isArray((value as Record<string, unknown>).rules);

const applySingleFilter = (rows: Array<Record<string, unknown>>, filter: FilterDef): Array<Record<string, unknown>> => {
  if (!filter.bindField) {
    return rows;
  }
  const value = filter.defaultValue;
  if (value === undefined || value === null || value === "") {
    return rows;
  }
  if (Array.isArray(value)) {
    const allowed = value.map((item) => String(item));
    return rows.filter((row) => allowed.includes(String(row[filter.bindField!])));
  }
  return rows.filter((row) => String(row[filter.bindField!]) === String(value));
};

const applyAdvancedFilter = (rows: Array<Record<string, unknown>>, group: AdvancedFilterGroup): Array<Record<string, unknown>> => {
  if (group.rules.length === 0) {
    return rows;
  }
  return rows.filter((row) => {
    if (group.logic === "AND") {
      return group.rules.every((rule) => evaluateRule(row, rule));
    }
    return group.rules.some((rule) => evaluateRule(row, rule));
  });
};

const normalizeExpression = (expression: string, sampleRow: Record<string, unknown>): string => {
  const tokens = expression.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const known = new Set(Object.keys(sampleRow));
  const uniqueTokens = [...new Set(tokens)].filter((token) => known.has(token));
  let normalized = expression;
  for (const token of uniqueTokens) {
    normalized = normalized.replace(new RegExp(`\\b${token}\\b`, "g"), `Number(row["${token}"] ?? 0)`);
  }
  return normalized;
};

export const applyComputedFields = (
  rows: Array<Record<string, unknown>>,
  spec: ChartSpec
): Array<Record<string, unknown>> => {
  const computed = spec.computedFields ?? [];
  if (computed.length === 0 || rows.length === 0) {
    return rows;
  }
  return rows.map((row) => {
    const next = { ...row };
    for (const field of computed) {
      try {
        const js = normalizeExpression(field.expression, next);
        const value = new Function("row", `return (${js});`)(next);
        next[field.name] = value;
      } catch {
        next[field.name] = null;
      }
    }
    return next;
  });
};

const filterAppliesToNode = (filter: FilterDef, node: VNode): boolean => {
  if (!filter.scope || filter.scope === "global") {
    return true;
  }
  return filter.scope.nodeId === node.id;
};

export const applyFilters = (
  rows: Array<Record<string, unknown>>,
  filters: FilterDef[] = [],
  node: VNode
): Array<Record<string, unknown>> => {
  if (filters.length === 0) {
    return rows;
  }
  const refSet = new Set(node.data?.filterRefs ?? []);
  const active = filters.filter((filter) => filterAppliesToNode(filter, node) || refSet.has(filter.filterId));
  return active.reduce((acc, filter) => {
    if (isAdvancedGroup(filter.defaultValue)) {
      return applyAdvancedFilter(acc, filter.defaultValue);
    }
    return applySingleFilter(acc, filter);
  }, rows);
};
