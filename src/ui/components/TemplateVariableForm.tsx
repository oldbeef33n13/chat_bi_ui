import type { TemplateVariableDef } from "../../core/doc/types";
import { coerceTemplateVariableValue, stringifyTemplateVariableValue } from "../utils/template-variables";

interface TemplateVariableFormProps {
  variables: TemplateVariableDef[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  compact?: boolean;
  showHint?: boolean;
}

export function TemplateVariableForm({ variables, values, onChange, compact = false, showHint = true }: TemplateVariableFormProps): JSX.Element | null {
  if (variables.length === 0) {
    return null;
  }

  return (
    <div className={`template-variable-form ${compact ? "compact" : ""}`}>
      {showHint ? (
        <div className="muted" style={{ fontSize: 12 }}>
          设计器测试先使用模板默认值；运行预览、导出和定时任务会在执行时传入变量覆盖这些默认值。
        </div>
      ) : null}
      {variables.map((variable) => {
        const value = values[variable.key];
        const inputId = `template_var_${variable.key}`;
        if (variable.type === "boolean") {
          return (
            <label key={variable.key} className="row template-variable-toggle" htmlFor={inputId}>
              <input
                id={inputId}
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) => onChange(variable.key, coerceTemplateVariableValue(variable, event.target.checked))}
              />
              <span>{variable.label ?? variable.key}</span>
            </label>
          );
        }
        return (
          <label key={variable.key} className="col template-variable-item" htmlFor={inputId}>
            <span>
              {variable.label ?? variable.key}
              {variable.required ? " *" : ""}
            </span>
            <input
              id={inputId}
              className="input"
              type={variable.type === "number" ? "number" : variable.type === "date" ? "date" : "text"}
              value={stringifyTemplateVariableValue(value)}
              onChange={(event) => onChange(variable.key, coerceTemplateVariableValue(variable, event.target.value))}
              placeholder={variable.description ?? variable.key}
            />
            {variable.description ? <span className="muted">{variable.description}</span> : null}
          </label>
        );
      })}
    </div>
  );
}
