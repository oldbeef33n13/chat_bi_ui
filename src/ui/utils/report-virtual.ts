/** 支持虚拟化条目最小协议：仅需 height。 */
export interface VirtualizableItem {
  height: number;
}

/** 单个可见条目与其绝对 top 偏移。 */
export interface VirtualRow<TItem> {
  item: TItem;
  top: number;
}

/** 虚拟窗口结果：总高 + 可见条目。 */
export interface VirtualWindow<TItem> {
  totalHeight: number;
  visible: Array<VirtualRow<TItem>>;
}

/**
 * 线性窗口虚拟化：按滚动范围筛出可见项并返回其绝对 top。
 * 说明：当前实现为 O(n)，对于 200~1000 blocks 的前端渲染已足够稳定。
 */
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
