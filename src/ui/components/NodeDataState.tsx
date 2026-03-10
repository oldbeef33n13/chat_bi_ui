export function NodeDataState({
  loading,
  error,
  remote
}: {
  loading?: boolean;
  error?: string;
  remote?: boolean;
}): JSX.Element | null {
  if (loading) {
    return (
      <div className="node-data-state is-loading" role="status" aria-live="polite">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <strong>{remote ? "远程数据加载中" : "数据加载中"}</strong>
          {remote ? <span className="chip">远程接口</span> : null}
        </div>
        <div className="node-data-skeleton">
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="node-data-state is-error" role="alert">
        <strong>数据加载失败</strong>
        <div className="muted">{error}</div>
      </div>
    );
  }
  return null;
}
