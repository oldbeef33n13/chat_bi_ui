import { describe, expect, it } from "vitest";
import type { FilterDef, VNode } from "../../core/doc/types";
import { applyFilters } from "./transforms";

const node: VNode = {
  id: "n1",
  kind: "chart",
  data: { sourceId: "ds_1" },
  props: {}
};

describe("applyFilters", () => {
  it("skips filter when bindField is absent in dataset", () => {
    const rows = [
      { day: "Mon", alarm_count: 10 },
      { day: "Tue", alarm_count: 12 }
    ];
    const filters: FilterDef[] = [
      {
        filterId: "f_region",
        type: "select",
        bindField: "region",
        scope: "global",
        defaultValue: "East"
      }
    ];
    const output = applyFilters(rows, filters, node);
    expect(output).toEqual(rows);
  });

  it("applies filter when bindField exists", () => {
    const rows = [
      { day: "Mon", region: "East", alarm_count: 10 },
      { day: "Tue", region: "West", alarm_count: 12 }
    ];
    const filters: FilterDef[] = [
      {
        filterId: "f_region",
        type: "select",
        bindField: "region",
        scope: "global",
        defaultValue: "East"
      }
    ];
    const output = applyFilters(rows, filters, node);
    expect(output).toEqual([{ day: "Mon", region: "East", alarm_count: 10 }]);
  });
});

