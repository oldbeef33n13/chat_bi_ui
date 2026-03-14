import type { VDoc, VNode } from "../../core/doc/types";
import type { DataEndpointMeta } from "../api/data-endpoint-repository";
import type { SourceField } from "./chart-recommend";
import { buildTemplateVariableDefaults } from "./template-variables";

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

const resolveSystemVar = (key?: string): unknown => {
  const now = new Date();
  switch (key) {
    case "today":
    case "currentDate":
    case "bizDate":
      return toIsoDate(now);
    case "now":
    case "currentDateTime":
      return now.toISOString();
    case "currentYear":
      return now.getFullYear();
    case "currentMonth":
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    default:
      return undefined;
  }
};

const resolveFilterValue = (doc: Pick<VDoc, "filters">, key?: string): unknown => {
  if (!key) {
    return undefined;
  }
  const filter = (doc.filters ?? []).find((item) => item.filterId === key || item.bindParam === key);
  return filter?.defaultValue;
};

export const resolveDataEndpointParams = (doc: Pick<VDoc, "filters" | "templateVariables">, node: VNode): Record<string, unknown> => {
  const baseParams = { ...(node.data?.params ?? {}) };
  const templateVars = buildTemplateVariableDefaults(doc.templateVariables);
  for (const [paramName, binding] of Object.entries(node.data?.paramBindings ?? {})) {
    if (!binding || typeof binding !== "object") {
      continue;
    }
    const bindingKey = binding.key ?? paramName;
    let resolved: unknown;
    switch (binding.from) {
      case "const":
        resolved = binding.value;
        break;
      case "templateVar":
        resolved = templateVars[bindingKey];
        break;
      case "systemVar":
        resolved = resolveSystemVar(bindingKey);
        break;
      case "filter":
        resolved = resolveFilterValue(doc, bindingKey);
        break;
      default:
        resolved = undefined;
        break;
    }
    if (resolved !== undefined) {
      baseParams[paramName] = resolved;
    }
  }
  return baseParams;
};

const coerceFieldType = (value: string | undefined): SourceField["type"] => {
  switch (value) {
    case "number":
    case "boolean":
    case "json":
      return value;
    case "date":
    case "datetime":
    case "time":
      return "time";
    default:
      return "string";
  }
};

export const extractEndpointFields = (endpoint?: Pick<DataEndpointMeta, "resultSchema">): SourceField[] =>
  (endpoint?.resultSchema ?? [])
    .filter((field) => field.name)
    .map((field) => ({
      name: field.name,
      label: field.label,
      type: coerceFieldType(field.type),
      unit: field.unit ?? null
    }));
