import type { CommandPlan, VDoc } from "./types";
import { commandPlanSchema, vDocSchema } from "./schema";

export interface ValidationError {
  instancePath: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[] | null;
}

const enumSet = (values: readonly string[] | undefined, fallback: readonly string[]): Set<string> =>
  new Set((values ?? fallback).map((item) => String(item)));

const DOC_TYPES = enumSet(
  (vDocSchema.properties.docType as { enum?: readonly string[] }).enum,
  ["chart", "dashboard", "report", "ppt"]
);
const LAYOUT_MODES = enumSet(
  (vDocSchema.$defs.VLayout.properties.mode as { enum?: readonly string[] }).enum,
  ["flow", "grid", "absolute"]
);
const INTENTS = enumSet(
  (commandPlanSchema.properties.intent as { enum?: readonly string[] }).enum,
  ["create", "update", "structure", "bulk", "query", "explain"]
);
const COMMAND_TYPES = enumSet(
  (commandPlanSchema.$defs.Command.properties.type as { enum?: readonly string[] }).enum,
  [
    "InsertNode",
    "RemoveNode",
    "MoveNode",
    "UpdateDoc",
    "UpdateProps",
    "UpdateData",
    "UpdateLayout",
    "UpdateStyle",
    "ResetStyle",
    "Batch",
    "Transaction",
    "Group",
    "Ungroup",
    "ApplyTheme",
    "ApplyTemplate"
  ]
);
const CHART_TYPES = enumSet(
  (vDocSchema.$defs.ChartSpec.properties.chartType as { enum?: readonly string[] }).enum,
  [
    "auto",
    "line",
    "bar",
    "pie",
    "combo",
    "scatter",
    "radar",
    "heatmap",
    "kline",
    "boxplot",
    "sankey",
    "graph",
    "treemap",
    "sunburst",
    "parallel",
    "funnel",
    "gauge",
    "calendar",
    "custom"
  ]
);
const BINDING_ROLES = enumSet(
  (vDocSchema.$defs.FieldBinding.properties.role as { enum?: readonly string[] }).enum,
  [
    "x",
    "y",
    "y1",
    "y2",
    "secondary",
    "ysecondary",
    "series",
    "color",
    "size",
    "label",
    "category",
    "value",
    "node",
    "linkSource",
    "linkTarget",
    "linkValue",
    "geo",
    "lat",
    "lng",
    "tooltip",
    "facet"
  ]
);
const TX_MODES = enumSet(
  (commandPlanSchema.$defs.Command.properties.txMode as { enum?: readonly string[] }).enum,
  ["begin", "commit", "rollback"]
);
const TEMPLATE_TARGETS = enumSet(
  (commandPlanSchema.$defs.Command.properties.templateTarget as { enum?: readonly string[] }).enum,
  ["dashboard", "report", "ppt", "slide", "section"]
);
const SCOPE_VALUES = enumSet(["doc", "selection"], ["doc", "selection"]);
const RISK_VALUES = enumSet(
  (
    ((commandPlanSchema.properties.preview as { properties?: Record<string, unknown> }).properties?.risk as {
      enum?: readonly string[];
    })?.enum
  ),
  ["low", "medium", "high"]
);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;

const pushError = (errors: ValidationError[], instancePath: string, message: string): void => {
  errors.push({ instancePath, message });
};

const validateVNode = (value: unknown, path: string, errors: ValidationError[]): void => {
  if (!isObject(value)) {
    pushError(errors, path, "should be object");
    return;
  }

  if (!isNonEmptyString(value.id)) {
    pushError(errors, `${path}/id`, "should be a non-empty string");
  }
  if (!isNonEmptyString(value.kind)) {
    pushError(errors, `${path}/kind`, "should be a non-empty string");
  }

  if (value.layout !== undefined) {
    if (!isObject(value.layout)) {
      pushError(errors, `${path}/layout`, "should be object");
    } else if (value.layout.mode !== undefined && !LAYOUT_MODES.has(String(value.layout.mode))) {
      pushError(errors, `${path}/layout/mode`, "should be one of flow|grid|absolute");
    }
  }

  if (value.data !== undefined) {
    if (!isObject(value.data)) {
      pushError(errors, `${path}/data`, "should be object");
    } else if (!isNonEmptyString(value.data.sourceId)) {
      pushError(errors, `${path}/data/sourceId`, "should be a non-empty string");
    }
  }

  if (value.children !== undefined) {
    if (!Array.isArray(value.children)) {
      pushError(errors, `${path}/children`, "should be array");
    } else {
      value.children.forEach((child, index) => {
        validateVNode(child, `${path}/children/${index}`, errors);
      });
    }
  }

  if (value.kind === "chart") {
    const propsPath = `${path}/props`;
    if (value.props === undefined) {
      pushError(errors, propsPath, "is required for chart node");
      return;
    }
    if (!isObject(value.props)) {
      pushError(errors, propsPath, "should be object");
      return;
    }
    if (!CHART_TYPES.has(String(value.props.chartType))) {
      pushError(errors, `${propsPath}/chartType`, "should be a valid chartType");
    }
    if (!Array.isArray(value.props.bindings) || value.props.bindings.length === 0) {
      pushError(errors, `${propsPath}/bindings`, "should be a non-empty array");
      return;
    }
    value.props.bindings.forEach((binding, index) => {
      const bindingPath = `${propsPath}/bindings/${index}`;
      if (!isObject(binding)) {
        pushError(errors, bindingPath, "should be object");
        return;
      }
      if (!BINDING_ROLES.has(String(binding.role))) {
        pushError(errors, `${bindingPath}/role`, "should be a valid binding role");
      }
      if (!isNonEmptyString(binding.field)) {
        pushError(errors, `${bindingPath}/field`, "should be a non-empty string");
      }
      if (
        binding.axis !== undefined &&
        binding.axis !== "primary" &&
        binding.axis !== "secondary" &&
        !isNonNegativeInteger(binding.axis)
      ) {
        pushError(errors, `${bindingPath}/axis`, "should be primary|secondary or integer >= 0");
      }
    });
  }

  if (value.kind === "table") {
    const propsPath = `${path}/props`;
    if (value.props === undefined) {
      pushError(errors, propsPath, "is required for table node");
      return;
    }
    if (!isObject(value.props)) {
      pushError(errors, propsPath, "should be object");
      return;
    }

    const columns = value.props.columns;
    if (columns !== undefined) {
      if (!Array.isArray(columns)) {
        pushError(errors, `${propsPath}/columns`, "should be array");
      } else {
        columns.forEach((column, index) => {
          const columnPath = `${propsPath}/columns/${index}`;
          if (!isObject(column)) {
            pushError(errors, columnPath, "should be object");
            return;
          }
          if (!isNonEmptyString(column.key)) {
            pushError(errors, `${columnPath}/key`, "should be a non-empty string");
          }
          if (column.width !== undefined && (!(typeof column.width === "number") || Number(column.width) <= 0)) {
            pushError(errors, `${columnPath}/width`, "should be a number > 0");
          }
        });
      }
    }

    const headerRows = value.props.headerRows;
    if (headerRows !== undefined) {
      if (!Array.isArray(headerRows)) {
        pushError(errors, `${propsPath}/headerRows`, "should be array");
      } else {
        headerRows.forEach((row, rowIndex) => {
          const rowPath = `${propsPath}/headerRows/${rowIndex}`;
          if (!Array.isArray(row)) {
            pushError(errors, rowPath, "should be array");
            return;
          }
          row.forEach((cell, cellIndex) => {
            const cellPath = `${rowPath}/${cellIndex}`;
            if (!isObject(cell)) {
              pushError(errors, cellPath, "should be object");
              return;
            }
            if (cell.rowSpan !== undefined && (!Number.isInteger(cell.rowSpan) || Number(cell.rowSpan) < 1)) {
              pushError(errors, `${cellPath}/rowSpan`, "should be integer >= 1");
            }
            if (cell.colSpan !== undefined && (!Number.isInteger(cell.colSpan) || Number(cell.colSpan) < 1)) {
              pushError(errors, `${cellPath}/colSpan`, "should be integer >= 1");
            }
          });
        });
      }
    }

    const mergeCells = value.props.mergeCells;
    if (mergeCells !== undefined) {
      if (!Array.isArray(mergeCells)) {
        pushError(errors, `${propsPath}/mergeCells`, "should be array");
      } else {
        mergeCells.forEach((merge, index) => {
          const mergePath = `${propsPath}/mergeCells/${index}`;
          if (!isObject(merge)) {
            pushError(errors, mergePath, "should be object");
            return;
          }
          if (!isNonNegativeInteger(merge.row)) {
            pushError(errors, `${mergePath}/row`, "should be integer >= 0");
          }
          if (!isNonNegativeInteger(merge.col)) {
            pushError(errors, `${mergePath}/col`, "should be integer >= 0");
          }
          if (merge.rowSpan !== undefined && (!Number.isInteger(merge.rowSpan) || Number(merge.rowSpan) < 1)) {
            pushError(errors, `${mergePath}/rowSpan`, "should be integer >= 1");
          }
          if (merge.colSpan !== undefined && (!Number.isInteger(merge.colSpan) || Number(merge.colSpan) < 1)) {
            pushError(errors, `${mergePath}/colSpan`, "should be integer >= 1");
          }
        });
      }
    }

    if (value.props.rows !== undefined && !Array.isArray(value.props.rows)) {
      pushError(errors, `${propsPath}/rows`, "should be array");
    }
  }
};

const validateCommand = (value: unknown, path: string, errors: ValidationError[]): void => {
  if (!isObject(value)) {
    pushError(errors, path, "should be object");
    return;
  }

  if (!COMMAND_TYPES.has(String(value.type))) {
    pushError(errors, `${path}/type`, "should be a valid command type");
  }

  if (value.index !== undefined && (!Number.isInteger(value.index) || Number(value.index) < 0)) {
    pushError(errors, `${path}/index`, "should be an integer >= 0");
  }
  if (value.newIndex !== undefined && (!Number.isInteger(value.newIndex) || Number(value.newIndex) < 0)) {
    pushError(errors, `${path}/newIndex`, "should be an integer >= 0");
  }
  if (value.txMode !== undefined && !TX_MODES.has(String(value.txMode))) {
    pushError(errors, `${path}/txMode`, "should be one of begin|commit|rollback");
  }
  if (value.templateTarget !== undefined && !TEMPLATE_TARGETS.has(String(value.templateTarget))) {
    pushError(errors, `${path}/templateTarget`, "should be a valid template target");
  }

  if (value.nodeIds !== undefined) {
    if (!Array.isArray(value.nodeIds)) {
      pushError(errors, `${path}/nodeIds`, "should be array");
    } else {
      value.nodeIds.forEach((id, index) => {
        if (!isNonEmptyString(id)) {
          pushError(errors, `${path}/nodeIds/${index}`, "should be a non-empty string");
        }
      });
    }
  }

  if (value.scope !== undefined) {
    if (typeof value.scope === "string") {
      if (!SCOPE_VALUES.has(value.scope)) {
        pushError(errors, `${path}/scope`, "should be doc|selection or { nodeId }");
      }
    } else if (isObject(value.scope)) {
      if (!isNonEmptyString(value.scope.nodeId)) {
        pushError(errors, `${path}/scope/nodeId`, "should be a non-empty string");
      }
    } else {
      pushError(errors, `${path}/scope`, "should be doc|selection or { nodeId }");
    }
  }

  if (value.commands !== undefined) {
    if (!Array.isArray(value.commands)) {
      pushError(errors, `${path}/commands`, "should be array");
    } else {
      value.commands.forEach((item, index) => validateCommand(item, `${path}/commands/${index}`, errors));
    }
  }
};

export const validateDoc = (doc: VDoc): ValidationResult => {
  const errors: ValidationError[] = [];
  const rootPath = "";

  if (!isObject(doc)) {
    pushError(errors, rootPath, "should be object");
    return { ok: false, errors };
  }

  if (!isNonEmptyString(doc.docId)) {
    pushError(errors, "/docId", "should be a non-empty string");
  }
  if (!DOC_TYPES.has(String(doc.docType))) {
    pushError(errors, "/docType", "should be one of chart|dashboard|report|ppt");
  }
  if (!isNonEmptyString(doc.schemaVersion)) {
    pushError(errors, "/schemaVersion", "should be a non-empty string");
  }

  if (doc.dataSources !== undefined && !Array.isArray(doc.dataSources)) {
    pushError(errors, "/dataSources", "should be array");
  }
  if (doc.queries !== undefined && !Array.isArray(doc.queries)) {
    pushError(errors, "/queries", "should be array");
  }
  if (doc.filters !== undefined && !Array.isArray(doc.filters)) {
    pushError(errors, "/filters", "should be array");
  }

  if (doc.root === undefined) {
    pushError(errors, "/root", "is required");
  } else {
    validateVNode(doc.root, "/root", errors);
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
};

export const validateCommandPlan = (plan: CommandPlan): ValidationResult => {
  const errors: ValidationError[] = [];
  const rootPath = "";

  if (!isObject(plan)) {
    pushError(errors, rootPath, "should be object");
    return { ok: false, errors };
  }

  if (!INTENTS.has(String(plan.intent))) {
    pushError(errors, "/intent", "should be one of create|update|structure|bulk|query|explain");
  }

  if (!Array.isArray(plan.commands) || plan.commands.length === 0) {
    pushError(errors, "/commands", "should be a non-empty array");
  } else {
    plan.commands.forEach((command, index) => validateCommand(command, `/commands/${index}`, errors));
  }

  if (plan.targets !== undefined) {
    if (!Array.isArray(plan.targets)) {
      pushError(errors, "/targets", "should be array");
    } else {
      plan.targets.forEach((target, index) => {
        if (!isNonEmptyString(target)) {
          pushError(errors, `/targets/${index}`, "should be a non-empty string");
        }
      });
    }
  }

  if (plan.explain !== undefined && typeof plan.explain !== "string") {
    pushError(errors, "/explain", "should be string");
  }

  if (plan.preview !== undefined) {
    if (!isObject(plan.preview)) {
      pushError(errors, "/preview", "should be object");
    } else {
      if (plan.preview.summary !== undefined && typeof plan.preview.summary !== "string") {
        pushError(errors, "/preview/summary", "should be string");
      }
      if (plan.preview.expectedChangedNodeIds !== undefined) {
        if (!Array.isArray(plan.preview.expectedChangedNodeIds)) {
          pushError(errors, "/preview/expectedChangedNodeIds", "should be array");
        } else {
          plan.preview.expectedChangedNodeIds.forEach((id, index) => {
            if (!isNonEmptyString(id)) {
              pushError(errors, `/preview/expectedChangedNodeIds/${index}`, "should be a non-empty string");
            }
          });
        }
      }
      if (plan.preview.risk !== undefined && !RISK_VALUES.has(String(plan.preview.risk))) {
        pushError(errors, "/preview/risk", "should be one of low|medium|high");
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.length > 0 ? errors : null
  };
};
