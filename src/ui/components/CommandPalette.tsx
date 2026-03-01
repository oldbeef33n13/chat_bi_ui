import { Fragment, useEffect, useMemo, useState } from "react";
import type { Persona } from "../types/persona";

export interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  keywords?: string[];
  group?: string;
  personas?: Persona[];
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  persona: Persona;
  commands: PaletteCommand[];
}

export function CommandPalette({ open, onClose, persona, commands }: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveIndex(0);
  }, [open]);

  const filtered = useMemo(() => {
    const byPersona = commands.filter((command) => !command.personas || command.personas.includes(persona));
    const key = query.trim().toLowerCase();
    const scoped = !key
      ? byPersona
      : byPersona.filter((command) => {
          const text = `${command.label} ${command.shortcut ?? ""} ${(command.keywords ?? []).join(" ")} ${command.group ?? ""}`.toLowerCase();
          return text.includes(key);
        });
    return [...scoped].sort((a, b) => {
      const ga = a.group ?? "General";
      const gb = b.group ?? "General";
      if (ga !== gb) {
        return ga.localeCompare(gb);
      }
      return a.label.localeCompare(b.label);
    });
  }, [commands, persona, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((idx) => (filtered.length === 0 ? 0 : (idx + 1) % filtered.length));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((idx) => (filtered.length === 0 ? 0 : (idx - 1 + filtered.length) % filtered.length));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const target = filtered[activeIndex];
        if (!target) {
          return;
        }
        target.run();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filtered, onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-box" onClick={(event) => event.stopPropagation()}>
        <input
          autoFocus
          className="cmd-input"
          placeholder="输入命令，例如：批量、主题、回退、分组"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="cmd-list">
          {filtered.length === 0 ? <div className="cmd-empty">无匹配命令</div> : null}
          {filtered.map((command, idx) => {
            const prev = filtered[idx - 1];
            const showGroup = idx === 0 || (prev?.group ?? "General") !== (command.group ?? "General");
            return (
              <Fragment key={command.id}>
                {showGroup ? <div className="cmd-group">{command.group ?? "General"}</div> : null}
                <button
                  className={`cmd-item ${idx === activeIndex ? "active" : ""}`}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    command.run();
                    onClose();
                  }}
                >
                  <span>{command.label}</span>
                  <span className="cmd-shortcut">{command.shortcut ?? ""}</span>
                </button>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
