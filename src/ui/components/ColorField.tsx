import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COLOR_SWATCH_PRESETS, normalizeColorValue, normalizeHexColor } from "../utils/node-style";

interface ColorFieldProps {
  label: string;
  value?: string;
  opacity?: number;
  onChange: (value?: string) => void;
  onOpacityChange?: (value: number) => void;
  placeholder?: string;
  allowClear?: boolean;
}

export function ColorField({
  label,
  value,
  opacity,
  onChange,
  onOpacityChange,
  placeholder = "#2563eb",
  allowClear = true
}: ColorFieldProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });
  const normalizedValue = normalizeColorValue(value);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const updatePosition = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const width = 320;
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
      const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
      setPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const commit = (nextValue: string | undefined): void => {
    setDraft(nextValue ?? "");
    onChange(normalizeColorValue(nextValue));
  };

  return (
    <div className="color-field">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span>{label}</span>
        <button
          ref={anchorRef}
          type="button"
          className={`color-field-trigger ${open ? "active" : ""}`}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="color-field-swatch" style={{ backgroundColor: normalizedValue ?? "transparent" }} />
          <span className="color-field-value">{normalizedValue ?? "未设置"}</span>
        </button>
      </div>
      {open
        ? createPortal(
            <div
              ref={panelRef}
              className="color-popover"
              role="dialog"
              aria-modal="false"
              aria-label={`${label}颜色选择`}
              style={{ top: position.top, left: position.left, width: position.width }}
            >
              <div className="color-popover-title">{label}</div>
              <div className="color-swatch-grid">
                {COLOR_SWATCH_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={`color-swatch-btn ${preset === normalizedValue ? "active" : ""}`}
                    style={{ backgroundColor: preset }}
                    title={preset}
                    onClick={() => commit(preset)}
                  />
                ))}
              </div>
              <div className="color-popover-row">
                <input
                  type="color"
                  className="color-native-input"
                  value={normalizeHexColor(normalizedValue)}
                  onChange={(event) => commit(event.target.value)}
                />
                <input
                  className="input"
                  value={draft}
                  placeholder={placeholder}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={() => commit(draft)}
                />
              </div>
              {onOpacityChange ? (
                <label className="col color-popover-opacity">
                  <span>{`透明度 ${Math.round((opacity ?? 1) * 100)}%`}</span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={opacity ?? 1}
                    onChange={(event) => onOpacityChange(Number(event.target.value))}
                  />
                </label>
              ) : null}
              <div className="row color-popover-actions">
                {allowClear ? (
                  <button type="button" className="btn mini-btn" onClick={() => commit(undefined)}>
                    清空
                  </button>
                ) : null}
                <button type="button" className="btn mini-btn" onClick={() => setOpen(false)}>
                  关闭
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
