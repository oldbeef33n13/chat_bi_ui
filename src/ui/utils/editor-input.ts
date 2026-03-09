export const isAdditiveSelectionModifier = (event: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): boolean => Boolean(event.ctrlKey || event.metaKey || event.shiftKey);

export const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select" || target.isContentEditable;
};
