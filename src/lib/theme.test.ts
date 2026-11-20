import { describe, expect, it } from "vitest";
import { ACCENTS, parseTheme, resolvedMode } from "./theme";

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
});
