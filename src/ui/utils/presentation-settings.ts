export type PresentationFitMode = "contain" | "fill";
export type PresentationPaddingMode = "comfortable" | "edge";

export interface PresentationRuntimeSettings {
  fitMode: PresentationFitMode;
  paddingMode: PresentationPaddingMode;
}

export const PRESENTATION_SETTINGS_STORAGE_KEY = "chatbi:presentation-settings";

export const defaultPresentationRuntimeSettings: PresentationRuntimeSettings = {
  fitMode: "fill",
  paddingMode: "edge"
};

export const normalizePresentationRuntimeSettings = (
  value: Partial<PresentationRuntimeSettings> | null | undefined
): PresentationRuntimeSettings => ({
  fitMode: value?.fitMode === "contain" ? "contain" : "fill",
  paddingMode: value?.paddingMode === "comfortable" ? "comfortable" : "edge"
});

export const loadPresentationRuntimeSettings = (): PresentationRuntimeSettings => {
  if (typeof window === "undefined") {
    return defaultPresentationRuntimeSettings;
  }
  try {
    const raw = window.localStorage.getItem(PRESENTATION_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultPresentationRuntimeSettings;
    }
    return normalizePresentationRuntimeSettings(JSON.parse(raw) as Partial<PresentationRuntimeSettings>);
  } catch {
    return defaultPresentationRuntimeSettings;
  }
};

export const savePresentationRuntimeSettings = (settings: PresentationRuntimeSettings): void => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(PRESENTATION_SETTINGS_STORAGE_KEY, JSON.stringify(normalizePresentationRuntimeSettings(settings)));
  } catch {
    // 忽略存储失败，保持沉浸态可用。
  }
};
