import { describe, expect, it } from "vitest";
import { commandPlanSchema, vDocSchema } from "./schema";
import { validateCommandPlan, validateDoc } from "./validator";

const docTypes = (vDocSchema.properties.docType as { enum: readonly string[] }).enum;
const chartTypes = (vDocSchema.$defs.ChartSpec.properties.chartType as { enum: readonly string[] }).enum;
const commandTypes = (commandPlanSchema.$defs.Command.properties.type as { enum: readonly string[] }).enum;

describe("validator schema linkage", () => {
  it("accepts all docType enums declared by vDoc schema", () => {
    for (const docType of docTypes) {
      const result = validateDoc({
        docId: "doc_schema_link",
        docType: docType as any,
        schemaVersion: "1.0.0",
        root: { id: "root", kind: "container", children: [] }
      } as any);
      expect(result.ok, `docType=${docType}`).toBe(true);
    }
  });

  it("accepts all chartType enums declared by vDoc schema", () => {
    for (const chartType of chartTypes) {
      const result = validateDoc({
        docId: `doc_chart_${chartType}`,
        docType: "dashboard",
        schemaVersion: "1.0.0",
        root: {
          id: "root",
          kind: "container",
          children: [
            {
              id: "chart_1",
              kind: "chart",
              data: { sourceId: "ds_1" },
              props: {
                chartType,
                bindings: [
                  { role: "x", field: "day" },
                  { role: "y", field: "value", agg: "sum" }
                ]
              }
            }
          ]
        }
      } as any);
      expect(result.ok, `chartType=${chartType}`).toBe(true);
    }
  });

  it("accepts all command enums declared by command plan schema", () => {
    for (const commandType of commandTypes) {
      const result = validateCommandPlan({
        intent: "update",
        commands: [{ type: commandType }]
      } as any);
      expect(result.ok, `commandType=${commandType}`).toBe(true);
    }
  });
});

