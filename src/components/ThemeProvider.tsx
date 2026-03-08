"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { applyAccent } from "@/lib/accent-presets";

export type Theme =
  | "light" | "solarized-light" | "dracula-light" | "catppuccin-latte" | "blossom" | "lavender" | "paper" | "high-contrast"
  | "dark" | "dracula" | "nord" | "solarized-dark" | "github-dark" | "catppuccin" | "twilight" | "midnight-rose" | "high-contrast-dark";

/** Theme IDs that should use light-mode accent colour variants */
const LIGHT_THEME_NAMES = new Set<string>([
  "light", "solarized-light", "dracula-light", "catppuccin-latte", "blossom", "lavender", "paper", "high-contrast",
]);

/** Returns true for all light themes (use light accent variant) */
export const isLightTheme = (t: string): boolean => LIGHT_THEME_NAMES.has(t);

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  cycleTheme: () => void;
  accentColor: string;
  setAccentColor: (key: string) => void;
  fontSize: string;
  setFontSize: (key: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  cycleTheme: () => {},
  accentColor: "default",
  setAccentColor: () => {},
  fontSize: "base",
  setFontSize: () => {},
});

const STORAGE_KEY = "docit-theme";
const ACCENT_STORAGE_KEY = "docit-accent";
const FONT_SIZE_STORAGE_KEY = "docit-font-size";

const FONT_SIZES: Record<string, string> = { sm: "14px", lg: "18px", xl: "20px" };

function applyFontSize(key: string): void {
  const size = FONT_SIZES[key];
  if (size) {
    document.documentElement.style.fontSize = size;
  } else {
    document.documentElement.style.removeProperty("font-size");
  }
}
export const THEMES: Theme[] = [
  "light", "solarized-light", "dracula-light", "catppuccin-latte", "blossom", "lavender", "paper", "high-contrast",
  "dark", "dracula", "nord", "solarized-dark", "github-dark", "catppuccin", "twilight", "midnight-rose", "high-contrast-dark",
];

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [accentColor, setAccentColorState] = useState<string>("default");
  const [fontSize, setFontSizeState] = useState<string>("base");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Restore theme
    const savedTheme = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (savedTheme && THEMES.includes(savedTheme)) {
      setThemeState(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    }
    // Restore accent and apply immediately (before paint)
    const savedAccent = localStorage.getItem(ACCENT_STORAGE_KEY) || "default";
    setAccentColorState(savedAccent);
    applyAccent(savedAccent, !isLightTheme(savedTheme ?? "light"));
    // Restore font size
    const savedFontSize = localStorage.getItem(FONT_SIZE_STORAGE_KEY) || "base";
    setFontSizeState(savedFontSize);
    applyFontSize(savedFontSize);
    setMounted(true);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
    // Re-apply accent so light/dark variant updates
    const currentAccent = localStorage.getItem(ACCENT_STORAGE_KEY) || "default";
    applyAccent(currentAccent, !isLightTheme(t));
  }, []);

  const setAccentColor = useCallback((key: string) => {
    setAccentColorState(key);
    localStorage.setItem(ACCENT_STORAGE_KEY, key);
    const currentTheme = localStorage.getItem(STORAGE_KEY) || "light";
    applyAccent(key, !isLightTheme(currentTheme));
  }, []);

  const setFontSize = useCallback((key: string) => {
    setFontSizeState(key);
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, key);
    applyFontSize(key);
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    setTheme(THEMES[(idx + 1) % THEMES.length]);
  }, [theme, setTheme]);

  // Prevent flash of wrong theme
  if (!mounted) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, accentColor, setAccentColor, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
