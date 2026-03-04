/** 容器宽度归一化：非法值回退 fallback，且保证不小于 min。 */
export const resolveContainerWidth = (value: unknown, fallback = 1200, min = 640): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(min, Math.round(numeric));
};
