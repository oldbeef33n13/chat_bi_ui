import type { TemplateVariableDef } from "../../core/doc/types";

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

export const resolveTemplateVariableDefaultValue = (variable: TemplateVariableDef): unknown => {
  if (variable.defaultValue !== undefined) {
    return variable.defaultValue;
  }
  const now = new Date();
  if (variable.type === "date") {
    return toIsoDate(now);
  }
  if (variable.type === "datetime") {
    return now.toISOString();
  }
  if (variable.type === "boolean") {
    return false;
  }
  if (variable.type === "number") {
    return 0;
  }
  return "";
};

export const buildTemplateVariableDefaults = (variables?: TemplateVariableDef[]): Record<string, unknown> =>
  (variables ?? []).reduce<Record<string, unknown>>((result, item) => {
    if (item.key) {
      result[item.key] = resolveTemplateVariableDefaultValue(item);
    }
    return result;
  }, {});

export const coerceTemplateVariableValue = (variable: TemplateVariableDef, raw: unknown): unknown => {
  if (variable.type === "boolean") {
    return Boolean(raw);
  }
  if (variable.type === "number") {
    if (raw === "" || raw === null || raw === undefined) {
      return variable.required ? 0 : "";
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return raw ?? "";
};

export const stringifyTemplateVariableValue = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);
