import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

export interface FloatingLayerArgs {
  anchorRect: DOMRect;
  layerRect: DOMRect;
  viewportWidth: number;
  viewportHeight: number;
}

interface FloatingLayerProps {
  anchorRef: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
  resolveStyle: (args: FloatingLayerArgs) => CSSProperties;
  layerRef?: MutableRefObject<HTMLDivElement | null>;
}

export function FloatingLayer({ anchorRef, className, children, resolveStyle, layerRef }: FloatingLayerProps): JSX.Element | null {
  const internalLayerRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const layer = internalLayerRef.current;
    if (!anchor || !layer || typeof window === "undefined") {
      return;
    }
    const nextStyle = resolveStyle({
      anchorRect: anchor.getBoundingClientRect(),
      layerRect: layer.getBoundingClientRect(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    });
    setStyle({
      ...nextStyle,
      visibility: "visible"
    });
  }, [anchorRef, resolveStyle, children]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    let rafId = 0;
    const scheduleUpdate = (): void => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      rafId = window.requestAnimationFrame(() => {
        const anchor = anchorRef.current;
        const layer = internalLayerRef.current;
        if (!anchor || !layer) {
          return;
        }
        const nextStyle = resolveStyle({
          anchorRect: anchor.getBoundingClientRect(),
          layerRect: layer.getBoundingClientRect(),
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight
        });
        setStyle({
          ...nextStyle,
          visibility: "visible"
        });
      });
    };
    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [anchorRef, resolveStyle, children]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      ref={(node) => {
        internalLayerRef.current = node;
        if (layerRef) {
          layerRef.current = node;
        }
      }}
      className={`floating-layer-root ${className ?? ""}`.trim()}
      style={style}
    >
      {children}
    </div>,
    document.body
  );
}
