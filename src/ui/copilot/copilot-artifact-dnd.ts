import type { VNode } from "../../core/doc/types";
import { recommendDashboardCardLayoutAtPoint } from "../utils/dashboard-arrange";
import { cloneNodeWithNewIds } from "../utils/node-tree";
import {
  resolveDashboardNodeRect,
  resolveGridRectFromCanvasRect,
  type DashboardRect,
  type DashboardSurfaceMetrics
} from "../utils/dashboard-surface";
import type { CopilotArtifactResultItem } from "./copilot-results";

export const COPILOT_ARTIFACT_MIME = "application/x-chatbi-copilot-artifact";

interface CopilotArtifactDragPayload {
  resultId: string;
  docId?: string;
  docType?: CopilotArtifactResultItem["docType"];
  artifactId: string;
  artifactKind: CopilotArtifactResultItem["artifactKind"];
  title: string;
  node: VNode;
}

let activeArtifactPayload: CopilotArtifactDragPayload | null = null;

const toPayload = (artifact: CopilotArtifactResultItem): CopilotArtifactDragPayload => ({
  resultId: artifact.resultId,
  docId: artifact.docId,
  docType: artifact.docType,
  artifactId: artifact.artifactId,
  artifactKind: artifact.artifactKind,
  title: artifact.title,
  node: structuredClone(artifact.node)
});

const parsePayload = (raw: string): CopilotArtifactDragPayload | null => {
  if (!raw.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<CopilotArtifactDragPayload>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.resultId !== "string" || !parsed.node || typeof parsed.node !== "object") {
      return null;
    }
    return {
      resultId: parsed.resultId,
      docId: typeof parsed.docId === "string" ? parsed.docId : undefined,
      docType: parsed.docType === "dashboard" || parsed.docType === "report" || parsed.docType === "ppt" ? parsed.docType : undefined,
      artifactId: typeof parsed.artifactId === "string" ? parsed.artifactId : parsed.resultId,
      artifactKind: typeof parsed.artifactKind === "string" ? (parsed.artifactKind as CopilotArtifactResultItem["artifactKind"]) : "block_region",
      title: typeof parsed.title === "string" ? parsed.title : "AI 草稿",
      node: structuredClone(parsed.node as VNode)
    };
  } catch {
    return null;
  }
};

export const encodeCopilotArtifact = (dataTransfer: DataTransfer, artifact: CopilotArtifactResultItem): void => {
  const payload = toPayload(artifact);
  activeArtifactPayload = payload;
  dataTransfer.setData(COPILOT_ARTIFACT_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", artifact.title);
  dataTransfer.effectAllowed = "copy";
};

export const clearCopilotArtifactDrag = (): void => {
  activeArtifactPayload = null;
};

export const decodeCopilotArtifact = (dataTransfer: DataTransfer | null | undefined): CopilotArtifactDragPayload | undefined => {
  if (!dataTransfer) {
    return activeArtifactPayload ? structuredClone(activeArtifactPayload) : undefined;
  }
  const raw = dataTransfer.getData(COPILOT_ARTIFACT_MIME);
  const parsed = parsePayload(raw);
  if (parsed) {
    activeArtifactPayload = parsed;
    return structuredClone(parsed);
  }
  return activeArtifactPayload ? structuredClone(activeArtifactPayload) : undefined;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const isDashboardCompatibleNode = (node: VNode): boolean =>
  node.kind !== "slide" && node.kind !== "section" && node.kind !== "report" && node.kind !== "deck";

export const supportsDashboardArtifactDrop = (artifact: CopilotArtifactResultItem | CopilotArtifactDragPayload): boolean =>
  artifact.docType === "dashboard" && isDashboardCompatibleNode(artifact.node);

export const supportsPptArtifactDrop = (artifact: CopilotArtifactResultItem | CopilotArtifactDragPayload): boolean =>
  artifact.docType === "ppt" && artifact.node.kind === "slide";

export const supportsReportArtifactDrop = (artifact: CopilotArtifactResultItem | CopilotArtifactDragPayload): boolean =>
  artifact.docType === "report" && artifact.node.kind === "section";

const resolveDashboardGridSize = (
  node: VNode,
  metrics: DashboardSurfaceMetrics,
  point: { x: number; y: number }
): { gw: number; gh: number } => {
  if (node.layout?.mode === "grid") {
    return {
      gw: Math.max(2, Number(node.layout.gw ?? 4)),
      gh: Math.max(2, Number(node.layout.gh ?? 4))
    };
  }
  const baseRect = resolveDashboardNodeRect(node, metrics);
  const guessed = resolveGridRectFromCanvasRect(
    {
      left: point.x - baseRect.width / 2,
      top: point.y - baseRect.height / 2,
      width: baseRect.width,
      height: baseRect.height
    },
    metrics
  );
  return {
    gw: Math.max(2, guessed.gw),
    gh: Math.max(2, guessed.gh)
  };
};

export const resolveDashboardArtifactDropPreview = ({
  root,
  artifact,
  metrics,
  point
}: {
  root: VNode;
  artifact: CopilotArtifactResultItem | CopilotArtifactDragPayload;
  metrics: DashboardSurfaceMetrics;
  point: { x: number; y: number };
}): { layoutMode: "grid" | "absolute"; rect: DashboardRect } => {
  const node = structuredClone(artifact.node);
  if (node.layout?.mode === "absolute") {
    const baseRect = resolveDashboardNodeRect(node, metrics);
    const maxLeft = Math.max(metrics.pageMarginPx, metrics.canvasWidth - metrics.pageMarginPx - baseRect.width);
    const maxTop = Math.max(metrics.pageMarginPx, metrics.canvasHeight - metrics.pageMarginPx - baseRect.height);
    const left = clamp(Math.round(point.x - baseRect.width / 2), metrics.pageMarginPx, maxLeft);
    const top = clamp(Math.round(point.y - baseRect.height / 2), metrics.pageMarginPx, maxTop);
    return {
      layoutMode: "absolute",
      rect: {
        left,
        top,
        width: baseRect.width,
        height: baseRect.height
      }
    };
  }
  const nextLayout = recommendDashboardCardLayoutAtPoint(root, metrics, point, resolveDashboardGridSize(node, metrics, point));
  return {
    layoutMode: "grid",
    rect: resolveDashboardNodeRect({ ...node, layout: nextLayout }, metrics)
  };
};

export const buildDashboardArtifactDropNode = ({
  root,
  artifact,
  metrics,
  point
}: {
  root: VNode;
  artifact: CopilotArtifactResultItem | CopilotArtifactDragPayload;
  metrics: DashboardSurfaceMetrics;
  point: { x: number; y: number };
}): VNode => {
  const node = cloneNodeWithNewIds(artifact.node);
  if (node.layout?.mode === "absolute") {
    const preview = resolveDashboardArtifactDropPreview({ root, artifact: { ...artifact, node }, metrics, point });
    node.layout = {
      ...(node.layout ?? { mode: "absolute" }),
      mode: "absolute",
      x: preview.rect.left,
      y: preview.rect.top,
      w: preview.rect.width,
      h: preview.rect.height
    };
    return node;
  }
  node.layout = recommendDashboardCardLayoutAtPoint(root, metrics, point, resolveDashboardGridSize(node, metrics, point));
  return node;
};

export const buildPptArtifactDropNode = (
  artifact: CopilotArtifactResultItem | CopilotArtifactDragPayload
): VNode => cloneNodeWithNewIds(artifact.node);
