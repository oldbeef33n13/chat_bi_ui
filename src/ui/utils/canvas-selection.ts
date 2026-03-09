export interface CanvasSelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasSelectionTarget {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export const buildCanvasSelectionRect = (startX: number, startY: number, currentX: number, currentY: number): CanvasSelectionRect => ({
  left: Math.min(startX, currentX),
  top: Math.min(startY, currentY),
  width: Math.abs(currentX - startX),
  height: Math.abs(currentY - startY)
});

export const isCanvasSelectionGesture = (rect: CanvasSelectionRect, threshold = 6): boolean => rect.width >= threshold || rect.height >= threshold;

export const intersectsCanvasSelectionRect = (rect: CanvasSelectionRect, target: CanvasSelectionTarget): boolean =>
  rect.left < target.left + target.width &&
  rect.left + rect.width > target.left &&
  rect.top < target.top + target.height &&
  rect.top + rect.height > target.top;

export const resolveCanvasSelectionIds = (targets: CanvasSelectionTarget[], rect: CanvasSelectionRect): string[] =>
  targets.filter((target) => intersectsCanvasSelectionRect(rect, target)).map((target) => target.id);
