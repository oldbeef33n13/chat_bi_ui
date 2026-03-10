export const vDocSchema = {
  $id: "vdoc.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["docId", "docType", "schemaVersion", "root"],
  properties: {
    docId: { type: "string", minLength: 1 },
    docType: { type: "string", enum: ["chart", "dashboard", "report", "ppt"] },
    schemaVersion: { type: "string", minLength: 1 },
    title: { type: "string" },
    locale: { type: "string" },
    themeId: { type: "string" },
    templateVariables: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "type"],
        properties: {
          key: { type: "string", minLength: 1 },
          label: { type: "string" },
          type: { type: "string", enum: ["string", "number", "boolean", "date", "datetime"] },
          required: { type: "boolean" },
          defaultValue: {},
          description: { type: "string" }
        }
      }
    },
    assets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["assetId", "type"],
        properties: {
          assetId: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["image", "icon", "font", "palette", "theme", "file"] },
          name: { type: "string" },
          uri: { type: "string" },
          meta: { type: "object", additionalProperties: true }
        }
      }
    },
    dataSources: { type: "array", items: { type: "object" } },
    queries: { type: "array", items: { type: "object" } },
    filters: { type: "array", items: { type: "object" } },
    root: { $ref: "#/$defs/VNode" }
  },
  $defs: {
    VLayout: {
      type: "object",
      additionalProperties: false,
      required: ["mode"],
      properties: {
        mode: { type: "string", enum: ["flow", "grid", "absolute"] },
        gx: { type: "number" },
        gy: { type: "number" },
        gw: { type: "number" },
        gh: { type: "number" },
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number" },
        h: { type: "number" },
        r: { type: "number" },
        z: { type: "number" },
        lock: { type: "boolean" },
        group: { type: "string" },
        groupConstraint: { type: "string", enum: ["free", "x", "y"] }
      }
    },
    VStyle: {
      type: "object",
      additionalProperties: false,
      properties: {
        tokenId: { type: "string" },
        bg: { type: "string" },
        bgOpacity: { type: "number", minimum: 0, maximum: 1 },
        fg: { type: "string" },
        opacity: { type: "number", minimum: 0, maximum: 1 },
        borderW: { type: "number" },
        borderC: { type: "string" },
        radius: { type: "number" },
        shadow: { type: "string" },
        pad: {
          oneOf: [
            { type: "number" },
            {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "number" }
            }
          ]
        },
        mar: {
          oneOf: [
            { type: "number" },
            {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "number" }
            }
          ]
        },
        font: { type: "string" },
        fontSize: { type: "number" },
        bold: { type: "boolean" },
        italic: { type: "boolean" },
        underline: { type: "boolean" },
        align: { type: "string", enum: ["left", "center", "right"] },
        valign: { type: "string", enum: ["top", "middle", "bottom"] },
        writingMode: { type: "string", enum: ["horizontal-tb", "vertical-rl"] },
        lineHeight: { type: "number", minimum: 0.8, maximum: 3 },
        letterSpacing: { type: "number", minimum: -4, maximum: 20 }
      }
    },
    VDataBinding: {
      type: "object",
      additionalProperties: false,
      properties: {
        sourceId: { type: "string", minLength: 1 },
        endpointId: { type: "string", minLength: 1 },
        queryId: { type: "string" },
        params: { type: "object", additionalProperties: true },
        paramBindings: {
          type: "object",
          additionalProperties: {
            type: "object",
            additionalProperties: false,
            required: ["from"],
            properties: {
              from: { type: "string", enum: ["const", "templateVar", "systemVar", "filter"] },
              value: {},
              key: { type: "string" }
            }
          }
        },
        filterRefs: { type: "array", items: { type: "string" } }
      },
      anyOf: [{ required: ["sourceId"] }, { required: ["endpointId"] }]
    },
    FieldBinding: {
      type: "object",
      additionalProperties: false,
      required: ["role", "field"],
      properties: {
        role: {
          type: "string",
          enum: [
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
        },
        field: { type: "string", minLength: 1 },
        agg: { type: "string" },
        axis: {
          oneOf: [
            { type: "string", enum: ["primary", "secondary"] },
            { type: "integer", minimum: 0 }
          ]
        },
        xAxis: { type: "integer", minimum: 0 },
        as: { type: "string" },
        sort: { type: "string", enum: ["asc", "desc"] },
        topK: { type: "integer", minimum: 1 },
        format: { type: "string" },
        timeGrain: { type: "string", enum: ["minute", "hour", "day", "week", "month"] },
        bin: { type: "number", exclusiveMinimum: 0 },
        unit: { type: "string", enum: ["bytes", "bps", "ms", "pct", "count"] }
      }
    },
    ChartSpec: {
      type: "object",
      additionalProperties: false,
      required: ["chartType", "bindings"],
      properties: {
        chartType: {
          type: "string",
          enum: [
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
        },
        titleText: { type: "string" },
        subtitleText: { type: "string" },
        titleStyle: { $ref: "#/$defs/VStyle" },
        subtitleStyle: { $ref: "#/$defs/VStyle" },
        bindings: { type: "array", minItems: 1, items: { $ref: "#/$defs/FieldBinding" } },
        computedFields: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "expression"],
            properties: {
              name: { type: "string", minLength: 1 },
              expression: { type: "string", minLength: 1 }
            }
          }
        },
        legendShow: { type: "boolean" },
        legendPos: { type: "string", enum: ["top", "right", "bottom", "left"] },
        tooltipShow: { type: "boolean" },
        gridShow: { type: "boolean" },
        xAxisShow: { type: "boolean" },
        xAxisTitle: { type: "string" },
        xAxisType: { type: "string", enum: ["category", "value", "time", "log"] },
        yAxisShow: { type: "boolean" },
        yAxisTitle: { type: "string" },
        yAxisType: { type: "string", enum: ["value", "log"] },
        themeRef: { type: "string" },
        paletteRef: { type: "string" },
        smooth: { type: "boolean" },
        stack: { type: "boolean" },
        area: { type: "boolean" },
        labelShow: { type: "boolean" },
        valueFormat: { type: "string" },
        timeFormat: { type: "string" },
        runtimeAskEnabled: { type: "boolean" },
        actions: { type: "array", items: { type: "object" } },
        optionPatch: { type: "object", additionalProperties: true }
      }
    },
    TableSpec: {
      type: "object",
      additionalProperties: false,
      properties: {
        titleText: { type: "string" },
        titleStyle: { $ref: "#/$defs/VStyle" },
        columns: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key"],
            properties: {
              key: { type: "string", minLength: 1 },
              title: { type: "string" },
              width: { type: "number", exclusiveMinimum: 0 },
              align: { type: "string", enum: ["left", "center", "right"] },
              format: { type: "string" }
            }
          }
        },
        headerRows: {
          type: "array",
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                text: { type: "string" },
                title: { type: "string" },
                colSpan: { type: "integer", minimum: 1 },
                rowSpan: { type: "integer", minimum: 1 },
                align: { type: "string", enum: ["left", "center", "right"] }
              }
            }
          }
        },
        mergeCells: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["row", "col"],
            properties: {
              row: { type: "integer", minimum: 0 },
              col: { type: "integer", minimum: 0 },
              rowSpan: { type: "integer", minimum: 1 },
              colSpan: { type: "integer", minimum: 1 },
              scope: { type: "string", enum: ["header", "body"] }
            }
          }
        },
        rows: {
          type: "array",
          items: {
            oneOf: [
              { type: "object", additionalProperties: true },
              { type: "array", items: {} }
            ]
          }
        },
        repeatHeader: { type: "boolean" },
        zebra: { type: "boolean" },
        maxRows: { type: "integer", minimum: 1 },
        pivot: {
          type: "object",
          additionalProperties: false,
          required: ["rowFields", "columnField", "valueField"],
          properties: {
            enabled: { type: "boolean" },
            rowFields: { type: "array", items: { type: "string", minLength: 1 } },
            columnField: { type: "string", minLength: 1 },
            valueField: { type: "string", minLength: 1 },
            agg: { type: "string", enum: ["sum", "avg", "min", "max", "count"] },
            fill: { type: "number" },
            valueTitle: { type: "string" }
          }
        }
      }
    },
    ImageProps: {
      type: "object",
      additionalProperties: false,
      required: ["assetId"],
      properties: {
        assetId: { type: "string", minLength: 1 },
        title: { type: "string" },
        alt: { type: "string" },
        fit: { type: "string", enum: ["contain", "cover", "stretch"] },
        opacity: { type: "number", minimum: 0, maximum: 1 }
      }
    },
    VNode: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind"],
      properties: {
        id: { type: "string", minLength: 1 },
        kind: { type: "string", minLength: 1 },
        name: { type: "string" },
        layout: { $ref: "#/$defs/VLayout" },
        style: { $ref: "#/$defs/VStyle" },
        data: { $ref: "#/$defs/VDataBinding" },
        props: { type: "object", additionalProperties: true },
        children: { type: "array", items: { $ref: "#/$defs/VNode" } }
      },
      allOf: [
        {
          if: { properties: { kind: { const: "chart" } } },
          then: { properties: { props: { $ref: "#/$defs/ChartSpec" } } }
        },
        {
          if: { properties: { kind: { const: "table" } } },
          then: { properties: { props: { $ref: "#/$defs/TableSpec" } } }
        },
        {
          if: { properties: { kind: { const: "image" } } },
          then: { properties: { props: { $ref: "#/$defs/ImageProps" } } }
        }
      ]
    }
  }
} as const;

export const commandPlanSchema = {
  $id: "command-plan.schema.json",
  type: "object",
  additionalProperties: false,
  required: ["intent", "commands"],
  properties: {
    intent: {
      type: "string",
      enum: ["create", "update", "structure", "bulk", "query", "explain"]
    },
    targets: { type: "array", items: { type: "string" } },
    explain: { type: "string" },
    preview: {
      type: "object",
      additionalProperties: false,
      properties: {
        summary: { type: "string" },
        expectedChangedNodeIds: { type: "array", items: { type: "string" } },
        risk: { type: "string", enum: ["low", "medium", "high"] }
      }
    },
    commands: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/Command" }
    }
  },
  $defs: {
    Command: {
      type: "object",
      additionalProperties: false,
      required: ["type"],
      properties: {
        type: {
          type: "string",
          enum: [
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
        },
        doc: { type: "object", additionalProperties: true },
        nodeId: { type: "string" },
        parentId: { type: "string" },
        index: { type: "integer", minimum: 0 },
        node: { type: "object" },
        newParentId: { type: "string" },
        newIndex: { type: "integer", minimum: 0 },
        props: { type: "object", additionalProperties: true },
        data: { type: "object", additionalProperties: true },
        layout: { type: "object", additionalProperties: true },
        style: { type: "object", additionalProperties: true },
        commands: { type: "array", items: { $ref: "#/$defs/Command" } },
        txId: { type: "string" },
        txMode: { type: "string", enum: ["begin", "commit", "rollback"] },
        nodeIds: { type: "array", items: { type: "string" } },
        groupId: { type: "string" },
        themeId: { type: "string" },
        scope: {
          oneOf: [
            { type: "string", enum: ["doc", "selection"] },
            {
              type: "object",
              additionalProperties: false,
              required: ["nodeId"],
              properties: { nodeId: { type: "string" } }
            }
          ]
        },
        templateId: { type: "string" },
        templateTarget: { type: "string", enum: ["dashboard", "report", "ppt", "slide", "section"] }
      }
    }
  }
} as const;
