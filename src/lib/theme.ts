export const THEME_KEY = "pvrsTheme";

export const MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof MODES)[number];

export const ACCENTS = [
  { id: "crimson", label: "PVRS Crimson", color: "#d92d20" },
  { id: "blue", label: "Blue", color: "#0071e3" },
  { id: "green", label: "Green", color: "#0e7a45" },
  { id: "purple", label: "Purple", color: "#6d28d9" },
  { id: "orange", label: "Orange", color: "#c2410c" },
  { id: "graphite", label: "Graphite", color: "#3f3f46" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"];

export interface ThemeChoice {
  mode: ThemeMode;
  accent: AccentId;
}

export const DEFAULT_THEME: ThemeChoice = { mode: "system", accent: "crimson" };

export function themeKey(email?: string) {
  return email ? `${THEME_KEY}:${email.toLowerCase()}` : THEME_KEY;
}

export function parseTheme(raw: string | null): ThemeChoice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ThemeChoice>;
    const mode = MODES.includes(v.mode as ThemeMode) ? (v.mode as ThemeMode) : null;
    const accent = ACCENTS.some((a) => a.id === v.accent) ? (v.accent as AccentId) : null;
    if (!mode || !accent) return null;
    return { mode, accent };
  } catch {
    return null;
  }
}

export function resolvedMode(mode: ThemeMode, prefersDark: boolean): "light" | "dark" {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function readTheme(email?: string): ThemeChoice {
  try {
    const own = email ? parseTheme(localStorage.getItem(themeKey(email))) : null;
    return own || parseTheme(localStorage.getItem(THEME_KEY)) || DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(choice: ThemeChoice, prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches) {
  const mode = resolvedMode(choice.mode, prefersDark);
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.dataset.accent = choice.accent;
  root.style.colorScheme = mode;
}

/** Saved on this browser, under the signed-in email when we know it. Firestore rules do not let a person write their own staff or portal doc, so this stays on the device. */
export function writeTheme(choice: ThemeChoice, email?: string) {
  const raw = JSON.stringify(choice);
  try {
    localStorage.setItem(THEME_KEY, raw);
    if (email) localStorage.setItem(themeKey(email), raw);
  } catch { /* private mode */ }
  applyTheme(choice);
}
