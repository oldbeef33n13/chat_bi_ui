import type { FilterDef, VNode } from "../../core/doc/types";
import { prefixedId } from "../../core/utils/id";
import { useEditorStore } from "../state/editor-context";
import { useSignalValue } from "../state/use-signal-value";
import { extractSourceFields } from "../utils/chart-recommend";
import type { AdvancedFilterGroup, AdvancedFilterRule, FilterOperator } from "../../runtime/data/transforms";

const ops: FilterOperator[] = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "in"];

const isAdvancedGroup = (value: unknown): value is AdvancedFilterGroup =>
  !!value &&
  typeof value === "object" &&
  "logic" in (value as Record<string, unknown>) &&
  "rules" in (value as Record<string, unknown>) &&
  Array.isArray((value as Record<string, unknown>).rules);

export function AdvancedFilterPanel(): JSX.Element {
  const store = useEditorStore();
  const doc = useSignalValue(store.doc);
  const selection = useSignalValue(store.selection);

  if (!doc) {
    return <div className="muted">No document</div>;
  }

  const sourceFields = (doc.dataSources ?? []).flatMap((source) => extractSourceFields(source));
  const fieldNames = [...new Set(sourceFields.map((field) => field.name))];
  const firstField = fieldNames[0] ?? "field";
  const filters = doc.filters ?? [];
  const selectedNode = selection.primaryId ? findNode(doc.root, selection.primaryId) : undefined;

  const commitFilters = (nextFilters: FilterDef[], summary: string): void => {
    store.executeCommand(
      {
        type: "UpdateDoc",
        doc: { filters: nextFilters }
      },
      { summary }
    );
  };

  const addFilter = (): void => {
    const rule: AdvancedFilterRule = {
      id: prefixedId("rule"),
      field: firstField,
      op: "eq",
      value: ""
    };
    const newFilter: FilterDef = {
      filterId: prefixedId("f"),
      type: "select",
      title: "新高级过滤",
      bindField: firstField,
      scope: "global",
      defaultValue: {
        logic: "AND",
        rules: [rule]
      } as AdvancedFilterGroup
    };
    commitFilters([...filters, newFilter], "add advanced filter");
  };

  const removeFilter = (filterId: string): void => {
    commitFilters(
      filters.filter((item) => item.filterId !== filterId),
      "remove filter"
    );
  };

  const updateFilter = (filterId: string, updater: (filter: FilterDef) => FilterDef, summary: string): void => {
    const next = filters.map((filter) => (filter.filterId === filterId ? updater(filter) : filter));
    commitFilters(next, summary);
  };

  const updateRule = (filterId: string, ruleId: string, patch: Partial<AdvancedFilterRule>): void => {
    updateFilter(
      filterId,
      (filter) => {
        const group = ensureGroup(filter, firstField);
        const rules = group.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule));
        return { ...filter, defaultValue: { ...group, rules } };
      },
      "update filter rule"
    );
  };

  const addRule = (filterId: string): void => {
    updateFilter(
      filterId,
      (filter) => {
        const group = ensureGroup(filter, firstField);
        const nextRule: AdvancedFilterRule = {
          id: prefixedId("rule"),
          field: firstField,
          op: "eq",
          value: ""
        };
        return {
          ...filter,
          defaultValue: {
            ...group,
            rules: [...group.rules, nextRule]
          }
        };
      },
      "add filter rule"
    );
  };

  const removeRule = (filterId: string, ruleId: string): void => {
    updateFilter(
      filterId,
      (filter) => {
        const group = ensureGroup(filter, firstField);
        const rules = group.rules.filter((rule) => rule.id !== ruleId);
        return { ...filter, defaultValue: { ...group, rules } };
      },
      "remove filter rule"
    );
  };

  const applyToSelectedChart = (filterId: string): void => {
    if (!selectedNode || selectedNode.kind !== "chart") {
      return;
    }
    const refs = new Set(selectedNode.data?.filterRefs ?? []);
    refs.add(filterId);
    store.executeCommand(
      {
        type: "UpdateData",
        nodeId: selectedNode.id,
        data: { filterRefs: [...refs] }
      },
      { summary: "bind filter to chart" }
    );
  };

  return (
    <div className="col" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>高级过滤</strong>
        <button className="btn" onClick={addFilter}>
          +过滤器
        </button>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        规则支持 AND/OR；变更可撤销。当前选中图表可一键绑定过滤器。
      </div>
      {filters.length === 0 ? <div className="muted">暂无过滤器</div> : null}
      {filters.map((filter) => {
        const group = ensureGroup(filter, firstField);
        return (
          <div key={filter.filterId} className="block" style={{ margin: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <input
                className="input"
                value={filter.title ?? filter.filterId}
                onChange={(event) =>
                  updateFilter(
                    filter.filterId,
                    (item) => ({ ...item, title: event.target.value }),
                    "update filter title"
                  )
                }
              />
              <button className="btn danger" onClick={() => removeFilter(filter.filterId)}>
                删除
              </button>
            </div>
            <div className="row">
              <label className="col">
                <span>逻辑</span>
                <select
                  className="select"
                  value={group.logic}
                  onChange={(event) =>
                    updateFilter(
                      filter.filterId,
                      (item) => ({ ...item, defaultValue: { ...group, logic: event.target.value as "AND" | "OR" } }),
                      "update filter logic"
                    )
                  }
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </label>
              <label className="col">
                <span>Scope</span>
                <select
                  className="select"
                  value={filter.scope === "global" || !filter.scope ? "global" : "node"}
                  onChange={(event) =>
                    updateFilter(
                      filter.filterId,
                      (item) =>
                        event.target.value === "global"
                          ? { ...item, scope: "global" }
                          : { ...item, scope: selectedNode ? { nodeId: selectedNode.id } : "global" },
                      "update filter scope"
                    )
                  }
                >
                  <option value="global">global</option>
                  <option value="node">selected-node</option>
                </select>
              </label>
            </div>
            <div className="col">
              {group.rules.map((rule) => (
                <div key={rule.id} className="row">
                  <select className="select" value={rule.field} onChange={(event) => updateRule(filter.filterId, rule.id, { field: event.target.value })}>
                    {fieldNames.length > 0 ? (
                      fieldNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))
                    ) : (
                      <option value={rule.field}>{rule.field}</option>
                    )}
                  </select>
                  <select className="select" value={rule.op} onChange={(event) => updateRule(filter.filterId, rule.id, { op: event.target.value as FilterOperator })}>
                    {ops.map((op) => (
                      <option key={op} value={op}>
                        {op}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    value={Array.isArray(rule.value) ? rule.value.join(",") : String(rule.value ?? "")}
                    onChange={(event) =>
                      updateRule(
                        filter.filterId,
                        rule.id,
                        {
                          value: rule.op === "in" ? event.target.value.split(",").map((item) => item.trim()) : event.target.value
                        }
                      )
                    }
                  />
                  <button className="btn danger" onClick={() => removeRule(filter.filterId, rule.id)}>
                    删规则
                  </button>
                </div>
              ))}
            </div>
            <div className="row">
              <button className="btn" onClick={() => addRule(filter.filterId)}>
                +规则
              </button>
              <button className="btn" onClick={() => applyToSelectedChart(filter.filterId)} disabled={!selectedNode || selectedNode.kind !== "chart"}>
                绑定到当前图表
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const ensureGroup = (filter: FilterDef, fallbackField: string): AdvancedFilterGroup => {
  if (isAdvancedGroup(filter.defaultValue)) {
    return filter.defaultValue;
  }
  return {
    logic: "AND",
    rules: [
      {
        id: prefixedId("rule"),
        field: filter.bindField ?? fallbackField,
        op: "eq",
        value: normalizeRuleValue(filter.defaultValue)
      }
    ]
  };
};

const normalizeRuleValue = (value: unknown): string | number | boolean | string[] => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return "";
};

const findNode = (root: VNode, nodeId: string): VNode | undefined => {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return undefined;
};
