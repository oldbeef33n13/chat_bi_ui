export interface VirtualizableItem {
  height: number;
}

export interface VirtualRow<TItem> {
  item: TItem;
  top: number;
}

export interface VirtualWindow<TItem> {
  totalHeight: number;
  visible: Array<VirtualRow<TItem>>;
}

export const computeVirtualWindow = <TItem extends VirtualizableItem>(
  items: TItem[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 420
): VirtualWindow<TItem> => {
  const topBound = Math.max(0, scrollTop - overscan);
  const bottomBound = scrollTop + viewportHeight + overscan;
  const visible: Array<VirtualRow<TItem>> = [];
  let runningTop = 0;

  items.forEach((item) => {
    const top = runningTop;
    const bottom = top + item.height;
    if (bottom >= topBound && top <= bottomBound) {
      visible.push({ item, top });
    }
    runningTop += item.height;
  });

  return {
    totalHeight: runningTop,
    visible
  };
};
