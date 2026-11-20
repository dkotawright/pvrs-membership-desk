import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENTS, parseTheme, resolvedMode } from "./theme";

function lin(c: number) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function contrast(hex: string, bg: string) {
  const L = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const a = L(hex);
  const b = L(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("theme", () => {
  it("follows the system only when asked", () => {
    expect(resolvedMode("system", true)).toBe("dark");
    expect(resolvedMode("system", false)).toBe("light");
    expect(resolvedMode("light", true)).toBe("light");
    expect(resolvedMode("dark", false)).toBe("dark");
  });

  it("rejects a broken saved theme", () => {
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme("{")).toBeNull();
    expect(parseTheme(JSON.stringify({ mode: "neon", accent: "crimson" }))).toBeNull();
    expect(parseTheme(JSON.stringify({ mode: "dark", accent: "purple" }))).toEqual({ mode: "dark", accent: "purple" });
  });

  it("offers a crimson default and five other accents", () => {
    expect(ACCENTS[0].id).toBe("crimson");
    expect(ACCENTS.map((a) => a.id)).toEqual(["crimson", "blue", "green", "purple", "orange", "graphite"]);
  });

  it("keeps dark-mode stage and accent text at AA on the dark cards", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const darkInks = [...css.matchAll(/html\[data-mode="dark"\][^{]*\{[^}]*--(?:lane-ink|accent-ink):\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]);
    expect(darkInks.length).toBeGreaterThanOrEqual(12);
    for (const hex of darkInks) {
      for (const bg of ["#1c1c1e", "#2c2c2e", "#0e0e10"]) expect(contrast(hex, bg), `${hex} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
