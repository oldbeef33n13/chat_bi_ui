import { describe, expect, it, vi } from "vitest";
import {
  PRESENTATION_SETTINGS_STORAGE_KEY,
  defaultPresentationRuntimeSettings,
  loadPresentationRuntimeSettings,
  normalizePresentationRuntimeSettings,
  savePresentationRuntimeSettings
} from "./presentation-settings";

describe("presentation settings", () => {
  it("normalizes invalid settings to stable defaults", () => {
    expect(normalizePresentationRuntimeSettings({ fitMode: "contain", paddingMode: "comfortable" })).toEqual({
      fitMode: "contain",
      paddingMode: "comfortable"
    });
    expect(normalizePresentationRuntimeSettings({ fitMode: "unknown" as never, paddingMode: "other" as never })).toEqual(defaultPresentationRuntimeSettings);
  });

  it("loads and saves runtime settings from localStorage", () => {
    const getItem = vi.spyOn(window.localStorage.__proto__, "getItem");
    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

    savePresentationRuntimeSettings({
      fitMode: "contain",
      paddingMode: "comfortable"
    });

    expect(setItem).toHaveBeenCalledWith(
      PRESENTATION_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        fitMode: "contain",
        paddingMode: "comfortable"
      })
    );

    getItem.mockReturnValueOnce(JSON.stringify({ fitMode: "contain", paddingMode: "comfortable" }));
    expect(loadPresentationRuntimeSettings()).toEqual({
      fitMode: "contain",
      paddingMode: "comfortable"
    });
  });
});
