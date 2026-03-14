import { useEffect, useState } from "react";
import type { VDoc, VNode } from "../../core/doc/types";
import { findNodeById, nodeTitle } from "../../core/doc/tree";
import type { PresentationRuntimeSettings } from "../utils/presentation-settings";
import { useMaybeCopilot } from "../copilot/copilot-context";
import { flattenReportSections, getTopReportSections } from "../utils/report-sections";
import { DashboardRuntimeView } from "./runtime/DashboardRuntimeView";
import { ReportRuntimeView } from "./runtime/ReportRuntimeView";
import { PptRuntimeView } from "./runtime/PptRuntimeView";
import type { RuntimeSelectionTarget } from "./runtime/runtime-selection";

const resolveSlideLabel = (slide: VNode, index: number): string => `第 ${index + 1} 页 · ${String((slide.props as Record<string, unknown> | undefined)?.title ?? slide.id)}`;

const sameRuntimeSelectionTarget = (left: RuntimeSelectionTarget | null, right: RuntimeSelectionTarget | null): boolean =>
  left?.nodeId === right?.nodeId &&
  left?.objectKind === right?.objectKind &&
  left?.objectLabel === right?.objectLabel &&
  left?.sectionLabel === right?.sectionLabel &&
  left?.slideLabel === right?.slideLabel;

const resolveInitialRuntimeSelection = (doc: VDoc): RuntimeSelectionTarget | null => {
  const docType = doc.docType === "chart" ? "dashboard" : doc.docType;
  if (docType === "dashboard") {
    const node = doc.root.children?.[0];
    return node
      ? {
          nodeId: node.id,
          objectKind: node.kind,
          objectLabel: nodeTitle(node)
        }
      : null;
  }
  if (docType === "report") {
    const section = flattenReportSections(getTopReportSections(doc.root))[0];
    const node = section?.blocks[0];
    return section && node
      ? {
          nodeId: node.id,
          objectKind: node.kind,
          objectLabel: nodeTitle(node),
          sectionLabel: `${section.orderLabel}. ${section.title}`
        }
      : null;
  }
  const slideIndex = (doc.root.children ?? []).findIndex((node) => node.kind === "slide");
  const slide = slideIndex >= 0 ? doc.root.children?.[slideIndex] : undefined;
  const node = slide?.children?.[0];
  return slide && node
    ? {
        nodeId: node.id,
        objectKind: node.kind,
        objectLabel: nodeTitle(node),
        slideLabel: resolveSlideLabel(slide, slideIndex)
      }
    : null;
};

export function DocRuntimeView({
  doc,
  immersive = false,
  presentationSettings
}: {
  doc: VDoc;
  immersive?: boolean;
  presentationSettings?: PresentationRuntimeSettings;
}): JSX.Element {
  const docType = doc.docType === "chart" ? "dashboard" : doc.docType;
  const copilot = useMaybeCopilot();
  const updateLiveScene = copilot?.updateLiveScene;
  const [selectedTarget, setSelectedTarget] = useState<RuntimeSelectionTarget | null>(() => resolveInitialRuntimeSelection(doc));

  const updateSelectedTarget = (next: RuntimeSelectionTarget | null): void => {
    setSelectedTarget((current) => (sameRuntimeSelectionTarget(current, next) ? current : next));
  };

  useEffect(() => {
    setSelectedTarget((current) => {
      const next = current && findNodeById(doc.root, current.nodeId) ? current : resolveInitialRuntimeSelection(doc);
      return sameRuntimeSelectionTarget(current, next) ? current : next;
    });
  }, [doc]);

  useEffect(() => {
    if (!updateLiveScene) {
      return;
    }
    updateLiveScene(
      selectedTarget
        ? {
            objectId: selectedTarget.nodeId,
            objectKind: selectedTarget.objectKind,
            objectLabel: selectedTarget.objectLabel,
            sectionLabel: selectedTarget.sectionLabel,
            slideLabel: selectedTarget.slideLabel,
            selectionCount: 1
          }
        : null
    );
  }, [selectedTarget, updateLiveScene]);

  useEffect(() => () => updateLiveScene?.(null), [updateLiveScene]);

  if (docType === "dashboard") {
    return (
      <DashboardRuntimeView
        doc={doc}
        immersive={immersive}
        presentationSettings={presentationSettings}
        selectedNodeId={selectedTarget?.nodeId}
        onSelectTarget={updateSelectedTarget}
      />
    );
  }
  if (docType === "report") {
    return (
      <ReportRuntimeView
        doc={doc}
        immersive={immersive}
        presentationSettings={presentationSettings}
        selectedNodeId={selectedTarget?.nodeId}
        onSelectTarget={updateSelectedTarget}
      />
    );
  }
  if (docType === "ppt") {
    return (
      <PptRuntimeView
        doc={doc}
        immersive={immersive}
        presentationSettings={presentationSettings}
        selectedNodeId={selectedTarget?.nodeId}
        onSelectTarget={updateSelectedTarget}
      />
    );
  }
  return <div className="muted">暂不支持该文档类型</div>;
}
