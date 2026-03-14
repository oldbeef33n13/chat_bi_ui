import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { VDoc } from "../../core/doc/types";
import type { TemplateMeta } from "../api/template-repository";
import { useMaybeEditorStore } from "../state/editor-context";
import { ChatBridgePanel } from "../components/ChatBridgePanel";
import { useCopilot } from "./copilot-context";
import { CopilotLibraryPanel } from "./CopilotLibraryPanel";
import { CopilotRuntimePanel } from "./CopilotRuntimePanel";

const WINDOW_PADDING = 12;

const sameRect = (
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
): boolean => left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;

const toSceneLabel = (sceneKind: string): string => {
  switch (sceneKind) {
    case "dashboard_edit":
      return "Dashboard 编辑";
    case "report_edit":
      return "Report 编辑";
    case "ppt_edit":
      return "PPT 编辑";
    case "dashboard_runtime":
      return "Dashboard 运行态";
    case "report_runtime":
      return "Report 运行态";
    case "ppt_runtime":
      return "PPT 运行态";
    default:
      return "文档中心";
  }
};

const buildPrimaryContext = (scene: ReturnType<typeof useCopilot>["scene"]): string => {
  if (scene.objectLabel) {
    return scene.objectLabel;
  }
  if (scene.sectionLabel) {
    return scene.sectionLabel;
  }
  if (scene.slideLabel) {
    return scene.slideLabel;
  }
  if (scene.docTitle) {
    return scene.docTitle;
  }
  return toSceneLabel(scene.sceneKind);
};

const buildSecondaryContext = (
  scene: ReturnType<typeof useCopilot>["scene"],
  followSelection: boolean
): string | null => {
  const pieces: string[] = [];
  if (scene.variableSummary.length > 0) {
    pieces.push(scene.variableSummary[0] ?? "");
  }
  if (scene.routeMode !== "library") {
    pieces.push(followSelection ? "跟随当前" : "已锁定");
  }
  return pieces.length > 0 ? pieces.join(" · ") : null;
};

function CopilotPlaceholderPanel({
  title,
  message,
  capabilities
}: {
  title: string;
  message: string;
  capabilities: string[];
}): JSX.Element {
  return (
    <div className="copilot-placeholder">
      <div className="copilot-placeholder-card">
        <strong>{title}</strong>
        <span className="muted">{message}</span>
      </div>
      <div className="copilot-placeholder-card">
        <strong>当前能力范围</strong>
        <ul className="diff-list">
          {capabilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CopilotShell({ doc, templates = [] }: { doc?: VDoc | null; templates?: TemplateMeta[] } = {}): JSX.Element {
  const {
    isOpen,
    isMinimized,
    followSelection,
    rect,
    scene,
    open,
    close,
    minimize,
    restore,
    setRect,
    setFollowSelection
  } = useCopilot();
  const store = useMaybeEditorStore();
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [frameRect, setFrameRect] = useState(rect);
  const dragRef = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startWidth: number; startHeight: number } | null>(null);
  const rectRef = useRef(rect);
  const frameRectRef = useRef(rect);
  const pendingRectRef = useRef<typeof rect | null>(null);
  const rectFrameRef = useRef<number | null>(null);

  useEffect(() => {
    rectRef.current = rect;
    if (!dragging && !resizing) {
      frameRectRef.current = rect;
      setFrameRect(rect);
    }
  }, [dragging, rect, resizing]);

  useEffect(() => {
    frameRectRef.current = frameRect;
  }, [frameRect]);

  useEffect(() => {
    if (!dragging && !resizing) {
      pendingRectRef.current = null;
    }
  }, [dragging, resizing]);

  useEffect(
    () => () => {
      if (rectFrameRef.current !== null) {
        window.cancelAnimationFrame(rectFrameRef.current);
      }
    },
    []
  );

  const flushRect = (): void => {
    rectFrameRef.current = null;
    const pending = pendingRectRef.current;
    pendingRectRef.current = null;
    if (!pending || sameRect(pending, frameRectRef.current)) {
      return;
    }
    frameRectRef.current = pending;
    setFrameRect(pending);
  };

  const scheduleRect = (next: typeof rect): void => {
    if (sameRect(next, pendingRectRef.current ?? frameRectRef.current)) {
      return;
    }
    pendingRectRef.current = next;
    if (rectFrameRef.current !== null) {
      return;
    }
    rectFrameRef.current = window.requestAnimationFrame(flushRect);
  };

  useEffect(() => {
    if (!dragging && !resizing) {
      return;
    }
    const onMouseMove = (event: MouseEvent): void => {
      if (dragging && dragRef.current) {
        const nextX = dragRef.current.startLeft + (event.clientX - dragRef.current.startX);
        const nextY = dragRef.current.startTop + (event.clientY - dragRef.current.startY);
        scheduleRect({ ...frameRectRef.current, x: nextX, y: nextY });
      }
      if (resizing && resizeRef.current) {
        const nextWidth = resizeRef.current.startWidth + (event.clientX - resizeRef.current.startX);
        const nextHeight = resizeRef.current.startHeight + (event.clientY - resizeRef.current.startY);
        scheduleRect({ ...frameRectRef.current, width: nextWidth, height: nextHeight });
      }
    };
    const onMouseUp = (): void => {
      flushRect();
      if (!sameRect(frameRectRef.current, rectRef.current)) {
        rectRef.current = frameRectRef.current;
        setRect(frameRectRef.current);
      }
      dragRef.current = null;
      resizeRef.current = null;
      setDragging(false);
      setResizing(false);
    };
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, resizing, setRect]);

  const primaryContext = useMemo(() => buildPrimaryContext(scene), [scene]);
  const secondaryContext = useMemo(() => buildSecondaryContext(scene, followSelection), [followSelection, scene]);
  const launcherLabel = isMinimized ? "恢复 Copilot" : "打开 Copilot";

  const beginDrag = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button")) {
      return;
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: frameRectRef.current.x,
      startTop: frameRectRef.current.y
    };
    setDragging(true);
  };

  const beginResize = (event: ReactMouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: frameRectRef.current.width,
      startHeight: frameRectRef.current.height
    };
    setResizing(true);
  };

  const renderBody = (): JSX.Element => {
    if (scene.routeMode === "edit" && store) {
      return <ChatBridgePanel persona="ai" />;
    }
    if (scene.routeMode === "library") {
      return <CopilotLibraryPanel templates={templates} />;
    }
    if (doc) {
      return <CopilotRuntimePanel doc={doc} />;
    }
    return (
      <CopilotPlaceholderPanel
        title="运行态 Copilot"
        message="当前阶段先固定全局 Shell、场景感知和上下文展示。运行态分析、下钻和结果回写会在下一阶段补齐。"
        capabilities={scene.capabilities}
      />
    );
  };

  return (
    <>
      {!isOpen ? (
        <button
          className={`copilot-launcher ${isMinimized ? "active" : ""}`}
          title={launcherLabel}
          aria-label={launcherLabel}
          onClick={isMinimized ? restore : open}
          style={{ right: WINDOW_PADDING, bottom: WINDOW_PADDING }}
        >
          <span className="copilot-launcher-mark">AI</span>
          <span className="copilot-launcher-text">Copilot</span>
        </button>
      ) : null}

      {isOpen ? (
        <section
          className={`copilot-shell ${dragging ? "dragging" : ""} ${resizing ? "resizing" : ""}`}
          style={{
            left: frameRect.x,
            top: frameRect.y,
            width: frameRect.width,
            height: frameRect.height
          }}
        >
          <div className="copilot-shell-header" onMouseDown={beginDrag}>
            <div className="copilot-shell-title">
              <div className="copilot-shell-title-row">
                <strong>Copilot</strong>
                <span className="chip">{toSceneLabel(scene.sceneKind)}</span>
              </div>
              <span className="muted copilot-shell-title-copy">{primaryContext}</span>
            </div>
            <div className="row">
              <button className={`btn mini-btn ${followSelection ? "primary" : ""}`} onClick={() => setFollowSelection(!followSelection)}>
                {followSelection ? "锁定当前" : "恢复跟随"}
              </button>
              <button className="btn mini-btn" onClick={minimize}>
                最小化
              </button>
              <button className="btn mini-btn" onClick={close}>
                关闭
              </button>
            </div>
          </div>

          {secondaryContext ? (
            <div className="copilot-context-summary">
              <span>{secondaryContext}</span>
            </div>
          ) : null}

          <div className="copilot-shell-body">
            <div className="copilot-shell-main">{renderBody()}</div>
          </div>

          <div className="copilot-shell-resizer" onMouseDown={beginResize} />
        </section>
      ) : null}
    </>
  );
}
