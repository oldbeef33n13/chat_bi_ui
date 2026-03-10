import type { VNode } from "../../../core/doc/types";
import { useEditorStore } from "../../state/editor-context";

export function LayoutEditor({ node }: { node: VNode }): JSX.Element {
  const store = useEditorStore();
  const layout = (node.layout ?? {}) as Record<string, unknown>;
  const mode = (layout.mode as string | undefined) ?? "flow";
  const isGrid = mode === "grid";
  const isAbsolute = mode === "absolute";

  const update = (key: string, value: number | string): void => {
    store.executeCommand(
      {
        type: "UpdateLayout",
        nodeId: node.id,
        layout: { [key]: value }
      },
      { summary: `layout ${key}`, mergeWindowMs: 140 }
    );
  };

  return (
    <div className="col" style={{ borderTop: "1px dashed var(--line)", paddingTop: 8 }}>
      <strong>Layout</strong>
      <label className="col">
        <span>Mode</span>
        <select className="select" value={mode} onChange={(event) => update("mode", event.target.value)}>
          {["flow", "grid", "absolute"].map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      {isGrid ? (
        <div className="row">
          <NumberInput label="gx" value={Number(layout["gx"] ?? 0)} onChange={(value) => update("gx", value)} />
          <NumberInput label="gy" value={Number(layout["gy"] ?? 0)} onChange={(value) => update("gy", value)} />
          <NumberInput label="gw" value={Number(layout["gw"] ?? 4)} onChange={(value) => update("gw", value)} />
          <NumberInput label="gh" value={Number(layout["gh"] ?? 4)} onChange={(value) => update("gh", value)} />
        </div>
      ) : null}

      {isAbsolute ? (
        <div className="row">
          <NumberInput label="x" value={Number(layout["x"] ?? 0)} onChange={(value) => update("x", value)} />
          <NumberInput label="y" value={Number(layout["y"] ?? 0)} onChange={(value) => update("y", value)} />
          <NumberInput label="w" value={Number(layout["w"] ?? 200)} onChange={(value) => update("w", value)} />
          <NumberInput label="h" value={Number(layout["h"] ?? 120)} onChange={(value) => update("h", value)} />
        </div>
      ) : null}
    </div>
  );
}

export function NumberInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="col" style={{ minWidth: 60 }}>
      <span>{label}</span>
      <input className="input" type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
