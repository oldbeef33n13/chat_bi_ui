import type { VStyle } from "../../core/doc/types";
import { findTheme } from "../../runtime/theme/themes";

export interface StyleTraceEntry {
  key: keyof VStyle;
  value: unknown;
  source: "doc-theme" | "node-token" | "node-override";
}

const mapThemeToStyle = (themeId?: string): Partial<VStyle> => {
  const theme = findTheme(themeId);
  return {
    bg: String(theme.tokens.panel ?? theme.tokens.bg ?? ""),
    fg: String(theme.tokens.text ?? ""),
    borderC: String(theme.tokens.line ?? ""),
    borderW: 1
  };
};

export const resolveStyleTrace = (
  docThemeId: string | undefined,
  style: VStyle | undefined
): {
  effective: Partial<VStyle>;
  entries: StyleTraceEntry[];
  overrideCount: number;
  tokenThemeId: string;
} => {
  const docBase = mapThemeToStyle(docThemeId);
  const tokenThemeId = style?.tokenId || docThemeId || findTheme(undefined).id;
  const tokenBase = mapThemeToStyle(tokenThemeId);
  const override = style ?? {};

  const effective: Partial<VStyle> = {
    ...docBase,
    ...tokenBase,
    ...override
  };

  const keys = [...new Set([...Object.keys(docBase), ...Object.keys(tokenBase), ...Object.keys(override)])] as Array<keyof VStyle>;
  const entries: StyleTraceEntry[] = keys.map((key) => {
    if (key in override && override[key] !== undefined) {
      return { key, value: override[key], source: "node-override" };
    }
    if (key in tokenBase && tokenBase[key] !== undefined) {
      return { key, value: tokenBase[key], source: "node-token" };
    }
    return { key, value: docBase[key], source: "doc-theme" };
  });

  const overrideCount = Object.keys(override).filter((key) => key !== "tokenId").length;
  return {
    effective,
    entries,
    overrideCount,
    tokenThemeId
  };
};
