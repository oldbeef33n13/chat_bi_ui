export const resolveContainerWidth = (value: unknown, fallback = 1200, min = 640): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.max(min, Math.round(numeric));
};

