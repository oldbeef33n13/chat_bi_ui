export interface ThemeTokens {
  id: string;
  name: string;
  tokens: Record<string, string | number>;
  chartThemeRef: string;
  paletteRef: string;
}

export const themes: ThemeTokens[] = [
  {
    id: "theme.tech.light",
    name: "科技浅色",
    chartThemeRef: "light",
    paletteRef: "palette.tech",
    tokens: {
      bg: "#f4f6fb",
      panel: "#ffffff",
      line: "#dbeafe",
      text: "#1f2937",
      primary: "#1d4ed8"
    }
  },
  {
    id: "theme.tech.dark",
    name: "科技暗色",
    chartThemeRef: "dark",
    paletteRef: "palette.tech.dark",
    tokens: {
      bg: "#0b1220",
      panel: "#111827",
      line: "#1f2937",
      text: "#e5e7eb",
      primary: "#60a5fa"
    }
  },
  {
    id: "theme.business.light",
    name: "商务浅色",
    chartThemeRef: "light",
    paletteRef: "palette.business",
    tokens: {
      bg: "#fdfcf8",
      panel: "#ffffff",
      line: "#efe7d3",
      text: "#312e25",
      primary: "#a16207"
    }
  }
];

const fallbackTheme: ThemeTokens = themes[0]!;

export const findTheme = (themeId?: string): ThemeTokens => themes.find((t) => t.id === themeId) ?? fallbackTheme;
