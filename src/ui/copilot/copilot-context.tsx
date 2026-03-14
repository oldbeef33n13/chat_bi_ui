import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CopilotResultItem } from "./copilot-results";
import { getAiThreadId } from "../utils/ai-edit-orchestration";

export type CopilotSceneKind =
  | "library"
  | "dashboard_edit"
  | "report_edit"
  | "ppt_edit"
  | "dashboard_runtime"
  | "report_runtime"
  | "ppt_runtime";

export interface CopilotRouteScene {
  sceneId: string;
  sceneKind: CopilotSceneKind;
  title: string;
  routeMode: "library" | "edit" | "view" | "present";
  docId?: string;
  docType?: "dashboard" | "report" | "ppt";
  docTitle?: string;
  variableSummary: string[];
  capabilities: string[];
  supportsChat: boolean;
  supportsDropArtifacts: boolean;
}

export interface CopilotLiveScene {
  objectId?: string;
  objectKind?: string;
  objectLabel?: string;
  sectionLabel?: string;
  slideLabel?: string;
  selectionCount?: number;
}

export interface CopilotShellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CopilotSpotlightTarget {
  docId?: string;
  nodeId: string;
  pulseKey: number;
}

interface CopilotContextValue {
  isOpen: boolean;
  isMinimized: boolean;
  followSelection: boolean;
  rect: CopilotShellRect;
  scene: CopilotRouteScene & CopilotLiveScene;
  currentThreadId?: string;
  spotlight: CopilotSpotlightTarget | null;
  focusedResultId: string | null;
  results: CopilotResultItem[];
  open: () => void;
  close: () => void;
  minimize: () => void;
  restore: () => void;
  setRect: (next: CopilotShellRect) => void;
  setFollowSelection: (next: boolean) => void;
  updateRouteScene: (scene: CopilotRouteScene) => void;
  updateLiveScene: (scene: CopilotLiveScene | null) => void;
  upsertResult: (result: CopilotResultItem) => void;
  focusResult: (resultId: string | null) => void;
  removeResult: (resultId: string) => void;
  clearSceneResults: (sceneId: string) => void;
  spotlightNode: (docId: string | undefined, nodeId: string) => void;
}

const DEFAULT_ROUTE_SCENE: CopilotRouteScene = {
  sceneId: "library",
  sceneKind: "library",
  title: "文档中心",
  routeMode: "library",
  variableSummary: [],
  capabilities: ["打开文档", "查看 AI 能力规划"],
  supportsChat: false,
  supportsDropArtifacts: false
};

const DEFAULT_RECT: CopilotShellRect = {
  x: 0,
  y: 96,
  width: 420,
  height: 720
};

const RECT_STORAGE_KEY = "chatbi.copilot.rect";
const OPEN_STORAGE_KEY = "chatbi.copilot.open";
const MINIMIZED_STORAGE_KEY = "chatbi.copilot.minimized";
const RECT_PERSIST_DEBOUNCE_MS = 160;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const getViewportWidth = (): number => (typeof window === "undefined" ? 1440 : Math.max(window.innerWidth, 960));
const getViewportHeight = (): number => (typeof window === "undefined" ? 900 : Math.max(window.innerHeight, 720));

const loadRect = (): CopilotShellRect => {
  if (typeof window === "undefined") {
    return DEFAULT_RECT;
  }
  const fallback: CopilotShellRect = {
    x: Math.max(24, getViewportWidth() - DEFAULT_RECT.width - 32),
    y: DEFAULT_RECT.y,
    width: DEFAULT_RECT.width,
    height: Math.min(DEFAULT_RECT.height, getViewportHeight() - 120)
  };
  const raw = window.localStorage.getItem(RECT_STORAGE_KEY);
  if (!raw) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CopilotShellRect>;
    return {
      x: clamp(Number(parsed.x ?? fallback.x), 12, getViewportWidth() - 280),
      y: clamp(Number(parsed.y ?? fallback.y), 12, getViewportHeight() - 220),
      width: clamp(Number(parsed.width ?? fallback.width), 360, getViewportWidth() - 24),
      height: clamp(Number(parsed.height ?? fallback.height), 440, getViewportHeight() - 24)
    };
  } catch {
    return fallback;
  }
};

const loadBoolean = (key: string, fallback: boolean): boolean => {
  if (typeof window === "undefined") {
    return fallback;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  return fallback;
};

const sameStringArray = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const sameRouteScene = (left: CopilotRouteScene, right: CopilotRouteScene): boolean =>
  left.sceneId === right.sceneId &&
  left.sceneKind === right.sceneKind &&
  left.title === right.title &&
  left.routeMode === right.routeMode &&
  left.docId === right.docId &&
  left.docType === right.docType &&
  left.docTitle === right.docTitle &&
  left.supportsChat === right.supportsChat &&
  left.supportsDropArtifacts === right.supportsDropArtifacts &&
  sameStringArray(left.variableSummary, right.variableSummary) &&
  sameStringArray(left.capabilities, right.capabilities);

const sameLiveScene = (left: CopilotLiveScene | null, right: CopilotLiveScene | null): boolean =>
  left?.objectId === right?.objectId &&
  left?.objectKind === right?.objectKind &&
  left?.objectLabel === right?.objectLabel &&
  left?.sectionLabel === right?.sectionLabel &&
  left?.slideLabel === right?.slideLabel &&
  left?.selectionCount === right?.selectionCount;

const mergeScene = (routeScene: CopilotRouteScene, liveScene: CopilotLiveScene | null): CopilotRouteScene & CopilotLiveScene => ({
  ...routeScene,
  ...(liveScene ?? {})
});

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [isOpen, setIsOpen] = useState(() => loadBoolean(OPEN_STORAGE_KEY, false));
  const [isMinimized, setIsMinimized] = useState(() => loadBoolean(MINIMIZED_STORAGE_KEY, false));
  const [rect, setRectState] = useState<CopilotShellRect>(() => loadRect());
  const [followSelection, setFollowSelectionState] = useState(true);
  const [routeScene, setRouteScene] = useState<CopilotRouteScene>(DEFAULT_ROUTE_SCENE);
  const [liveScene, setLiveScene] = useState<CopilotLiveScene | null>(null);
  const [lockedScene, setLockedScene] = useState<(CopilotRouteScene & CopilotLiveScene) | null>(null);
  const [results, setResults] = useState<CopilotResultItem[]>([]);
  const [spotlight, setSpotlight] = useState<CopilotSpotlightTarget | null>(null);
  const [focusedResultId, setFocusedResultId] = useState<string | null>(null);
  const rectPersistTimerRef = useRef<number | null>(null);

  const mergedScene = useMemo(() => mergeScene(routeScene, liveScene), [liveScene, routeScene]);
  const scene = followSelection ? mergedScene : lockedScene ?? mergedScene;
  const currentThreadId = useMemo(() => (scene.docId ? getAiThreadId(scene.docId) : undefined), [scene.docId]);

  const open = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  const minimize = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(true);
  }, []);

  const restore = useCallback(() => {
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const setRect = useCallback((next: CopilotShellRect) => {
    setRectState({
      x: clamp(next.x, 12, getViewportWidth() - 280),
      y: clamp(next.y, 12, getViewportHeight() - 220),
      width: clamp(next.width, 360, getViewportWidth() - 24),
      height: clamp(next.height, 440, getViewportHeight() - 24)
    });
  }, []);

  const setFollowSelection = useCallback((next: boolean) => {
    setFollowSelectionState(next);
    if (next) {
      setLockedScene(null);
      return;
    }
    setLockedScene(mergeScene(routeScene, liveScene));
  }, [liveScene, routeScene]);

  const updateRouteScene = useCallback((next: CopilotRouteScene) => {
    setRouteScene((current) => (sameRouteScene(current, next) ? current : next));
    setLockedScene((prev) => (prev && prev.sceneId !== next.sceneId ? null : prev));
    setLiveScene((current) => (current && current !== null && routeScene.sceneId !== next.sceneId ? null : current));
  }, [routeScene.sceneId]);

  const updateLiveScene = useCallback((next: CopilotLiveScene | null) => {
    setLiveScene((current) => (sameLiveScene(current, next) ? current : next));
  }, []);

  const upsertResult = useCallback((result: CopilotResultItem) => {
    setResults((current) => {
      const next = current.filter((item) => item.resultId !== result.resultId);
      next.unshift(result);
      return next.slice(0, 24);
    });
  }, []);

  const focusResult = useCallback((resultId: string | null) => {
    setFocusedResultId(resultId);
  }, []);

  const removeResult = useCallback((resultId: string) => {
    setResults((current) => current.filter((item) => item.resultId !== resultId));
  }, []);

  const clearSceneResults = useCallback((sceneId: string) => {
    setResults((current) => current.filter((item) => item.sceneId !== sceneId));
  }, []);

  const spotlightNode = useCallback((docId: string | undefined, nodeId: string) => {
    setSpotlight((current) => ({
      docId,
      nodeId,
      pulseKey: (current?.pulseKey ?? 0) + 1
    }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (rectPersistTimerRef.current !== null) {
      window.clearTimeout(rectPersistTimerRef.current);
    }
    rectPersistTimerRef.current = window.setTimeout(() => {
      rectPersistTimerRef.current = null;
      window.localStorage.setItem(RECT_STORAGE_KEY, JSON.stringify(rect));
    }, RECT_PERSIST_DEBOUNCE_MS);
    return () => {
      if (rectPersistTimerRef.current !== null) {
        window.clearTimeout(rectPersistTimerRef.current);
        rectPersistTimerRef.current = null;
      }
    };
  }, [rect]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(OPEN_STORAGE_KEY, String(isOpen));
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(MINIMIZED_STORAGE_KEY, String(isMinimized));
  }, [isMinimized]);

  useEffect(() => {
    if (!spotlight) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSpotlight((current) => (current?.pulseKey === spotlight.pulseKey ? null : current));
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [spotlight]);

  useEffect(() => {
    if (!focusedResultId) {
      return;
    }
    if (results.some((item) => item.resultId === focusedResultId)) {
      return;
    }
    setFocusedResultId(null);
  }, [focusedResultId, results]);

  const value = useMemo<CopilotContextValue>(
    () => ({
      isOpen,
      isMinimized,
      followSelection,
      rect,
      scene,
      currentThreadId,
      spotlight,
      focusedResultId,
      results,
      open,
      close,
      minimize,
      restore,
      setRect,
      setFollowSelection,
      updateRouteScene,
      updateLiveScene,
      upsertResult,
      focusResult,
      removeResult,
      clearSceneResults,
      spotlightNode
    }),
    [
      clearSceneResults,
      close,
      currentThreadId,
      followSelection,
      focusResult,
      focusedResultId,
      isMinimized,
      isOpen,
      minimize,
      open,
      rect,
      removeResult,
      restore,
      results,
      scene,
      setFollowSelection,
      setRect,
      spotlight,
      spotlightNode,
      updateLiveScene,
      updateRouteScene,
      upsertResult
    ]
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export const useCopilot = (): CopilotContextValue => {
  const value = useContext(CopilotContext);
  if (!value) {
    throw new Error("CopilotProvider missing");
  }
  return value;
};

export const useMaybeCopilot = (): CopilotContextValue | null => useContext(CopilotContext);
