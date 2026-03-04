import type { CSSProperties } from "react";
import type { TableSpec } from "../../core/doc/types";
import { buildTableRenderModel } from "./table-adapter";

interface TableViewProps {
  spec?: TableSpec | Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  height?: string | number;
}

/** 表格渲染组件：消费 TableRenderModel，负责 DOM 表格输出。 */
export function TableView({ spec, rows, height = "100%" }: TableViewProps): JSX.Element {
  const model = buildTableRenderModel(spec, rows);
  const wrapperStyle: CSSProperties = {
    width: "100%",
    height,
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 6
  };

  return (
    <div className="bi-table-wrap" style={wrapperStyle}>
      {model.titleText ? <div className="bi-table-title">{model.titleText}</div> : null}
      <table className="bi-table">
        <colgroup>
          {model.columns.map((column) => (
            <col key={column.key} style={{ width: `${Math.max(48, Math.round(column.width))}px` }} />
          ))}
        </colgroup>
        <thead>
          {model.headerRows.map((row, rowIndex) => (
            <tr key={`h_${rowIndex}`}>
              {row.map((cell, cellIndex) =>
                cell.hidden ? null : (
                  <th
                    key={`h_${rowIndex}_${cellIndex}`}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    style={{ textAlign: cell.align }}
                  >
                    {cell.text}
                  </th>
                )
              )}
            </tr>
          ))}
        </thead>
        <tbody>
          {model.bodyRows.length === 0 ? (
            <tr>
              <td colSpan={Math.max(1, model.columns.length)} className="bi-table-empty">
                暂无数据
              </td>
            </tr>
          ) : (
            model.bodyRows.map((row, rowIndex) => (
              <tr key={`b_${rowIndex}`} className={model.zebra && rowIndex % 2 === 1 ? "zebra" : ""}>
                {row.map((cell, cellIndex) =>
                  cell.hidden ? null : (
                    <td
                      key={`b_${rowIndex}_${cellIndex}`}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      style={{ textAlign: cell.align }}
                    >
                      {cell.text}
                    </td>
                  )
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
