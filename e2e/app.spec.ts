import { test, expect } from "@playwright/test";
import { declinedSeed, interviewerSeed, memberSeed, ownerSeed, portalSeed } from "../src/lib/demo";

async function expectOneSidebar(page: import("@playwright/test").Page, label: string) {
  const buttons = page.locator("aside nav button");
  const rows = await buttons.evaluateAll((els) => els.map((el) => ({
    name: (el as HTMLElement).innerText.split("\n")[0]?.trim() || "",
    current: el.getAttribute("aria-current"),
    bg: getComputedStyle(el).backgroundColor,
  })));
  const lit = rows.filter((row) => row.current === "page" || (row.bg !== "rgba(0, 0, 0, 0)" && row.bg !== "transparent"));
  expect(lit.map((row) => row.name)).toEqual([label]);
}

async function boot(page: import("@playwright/test").Page, seed: object | null, path = "/", theme: { mode: string; accent: string } | null = null) {
  await page.addInitScript(({ s, theme }) => {
    try { localStorage.setItem("pvrsTourOff", "1"); } catch { /* ignore */ }
    localStorage.setItem("pvrsTheme", JSON.stringify(theme || { mode: "light", accent: "crimson" }));
    (window as unknown as { __PVRS_MOCK: boolean; __PVRS_SEED: object | null }).__PVRS_MOCK = true;
    (window as unknown as { __PVRS_SEED: object | null }).__PVRS_SEED = s;
  }, { s: seed, theme });
  await page.goto(path);
}

test("home invites people to apply", async ({ page }) => {
  await boot(page, { user: null, docs: {} });
  await expect(page.getByRole("heading", { name: "Serve Potsdam." })).toBeVisible();
  await expect(page.getByText("Save lives.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Apply to join PVRS/i })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/home-desktop.png", fullPage: false });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `/opt/cursor/artifacts/home-ecg-${i}.png`, fullPage: false });
  }
});

test("sign-in offers Google, a link, and a password", async ({ page }) => {
  await boot(page, { user: null, docs: {} }, "/signin");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/signin-desktop.png", fullPage: false });
  await page.getByRole("button", { name: "Password" }).click();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

test("application wizard blocks an empty first step", async ({ page }) => {
  await boot(page, { user: null, docs: {} }, "/apply");
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("first name");
  await page.screenshot({ path: "/opt/cursor/artifacts/apply-desktop.png", fullPage: false });
});

test("owner pipeline shows every lane and opens a file", async ({ page }) => {
  await boot(page, ownerSeed());
  await expect(page.getByRole("heading", { name: "Dispatch" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Jordan Hale/ }).first()).toBeVisible();
  await expect(page.getByText("Screening").first()).toBeVisible();
  await expect(page.getByText("Onboarding").first()).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/pipeline-board.png", fullPage: false });
  await page.screenshot({ path: "/opt/cursor/artifacts/nav-desktop.png", fullPage: false });
  await page.getByRole("button", { name: /Orientation/ }).click();
  await expect(page.getByRole("heading", { name: "Orientation" })).toBeVisible();
  await expectOneSidebar(page, "Orientation");
  await page.screenshot({ path: "/opt/cursor/artifacts/onboard-desktop.png", fullPage: false });
  for (const name of ["Messages", "Board meeting", "Rig check", "Dispatch"]) {
    await page.locator("aside nav").getByRole("button", { name: new RegExp("^" + name) }).click();
    await expectOneSidebar(page, name);
  }
  await page.getByRole("button", { name: /Dispatch/ }).first().click();
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("button", { name: /Riley Brooks/ })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/pipeline-list.png", fullPage: false });
  await page.getByRole("button", { name: /Jordan Hale/ }).first().click();
  await expect(page.getByRole("heading", { name: "Jordan Hale" })).toBeVisible();
  await page.getByRole("tab", { name: /Interview/ }).click();
  await expect(page.getByRole("button", { name: "Tailored questions" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/applicant-file.png", fullPage: false });
});

test("search finds an applicant and Med Control opens", async ({ page }) => {
  await boot(page, ownerSeed());
  await page.getByPlaceholder("Search people, stages, actions").fill("Riley");
  await expect(page.getByRole("button", { name: /Riley Brooks/ }).last()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Med Control" }).click();
  const mc = page.getByRole("dialog", { name: "Med Control" });
  await expect(mc).toBeVisible();
  await expect(mc.getByText("Chats aren't saved and clear when you close this.")).toBeVisible();
  await expect(mc.getByText("Claude")).toBeVisible();
  await mc.getByRole("button", { name: "Today" }).click();
  await expect(mc.getByText(/ready for the board/i).first()).toBeVisible();
  await mc.getByRole("button", { name: "Clear" }).click();
  await expect(mc.getByText(/ready for the board/i)).toHaveCount(0);
  await mc.getByRole("button", { name: "Today" }).click();
  await expect(mc.getByText(/ready for the board/i).first()).toBeVisible();
  await mc.getByRole("button", { name: "Close" }).click();
  await expect(mc).toHaveCount(0);
  await page.getByRole("button", { name: "Med Control" }).click();
  await expect(mc.getByText(/ready for the board/i)).toHaveCount(0);
  await mc.getByRole("button", { name: "Today" }).click();
  await expect(mc.getByText(/ready for the board/i).first()).toBeVisible();
  await page.locator("aside nav").getByRole("button", { name: /^Messages/ }).click();
  await expect(mc.getByText(/ready for the board/i)).toHaveCount(0);
  await page.screenshot({ path: "/opt/cursor/artifacts/med-control.png" });
});

test("messages are a channel, not a buried menu", async ({ page }) => {
  await boot(page, ownerSeed());
  await page.getByRole("button", { name: /Messages/ }).click();
  await expect(page.getByText("Board packet is ready for Tuesday.")).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/messages-desktop.png", fullPage: false });
});

test("a declined applicant is not told they were denied", async ({ page }) => {
  await boot(page, declinedSeed());
  await expect(page.getByText(/membership committee/i)).toBeVisible();
  await expect(page.getByText(/denied/i)).toHaveCount(0);
  await expect(page.getByText("SECRET-DL")).toHaveCount(0);
  await page.screenshot({ path: "/opt/cursor/artifacts/portal-declined.png", fullPage: false });
});

test("applicant portal offers the next step and a message thread", async ({ page }) => {
  await boot(page, portalSeed());
  await expect(page.getByRole("heading", { name: /Hi Jordan/ })).toBeVisible();
  await expect(page.getByLabel("Your next step")).toBeVisible();
  await expect(page.getByText(/Thursday evening/)).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/portal-desktop.png", fullPage: false });
});

test("an interviewer only sees people assigned to them", async ({ page }) => {
  await boot(page, interviewerSeed());
  await expect(page.getByText("Jordan Hale").first()).toBeVisible();
  await expect(page.getByText("Avery Chen")).toHaveCount(0);
  await expect(page.getByText("SECRET-DL")).toHaveCount(0);
});

test("a member does not get applicant files", async ({ page }) => {
  await boot(page, memberSeed());
  await expect(page.getByText("Avery Chen")).toHaveCount(0);
  await page.getByRole("button", { name: /Messages/ }).click();
  await expect(page.getByRole("heading", { name: "#General" })).toBeVisible();
});

test("a bad reference link explains itself", async ({ page }) => {
  await boot(page, { user: null, docs: {} }, "/ref/not-a-real-code");
  await expect(page.getByRole("heading", { name: /This link/i })).toBeVisible();
});

test("mobile pipeline and home", async ({ page }) => {
  await boot(page, { user: null, docs: {} });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const btn = await page.getByRole("button", { name: "Member and applicant sign in" }).boundingBox();
    const rig = await page.locator("[data-ecg]").boundingBox();
    expect(btn && rig).toBeTruthy();
    const hit = btn && rig && btn.x < rig.x + rig.width && btn.x + btn.width > rig.x && btn.y < rig.y + rig.height && btn.y + btn.height > rig.y;
    expect(hit).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/opt/cursor/artifacts/home-mobile.png", fullPage: false });
  await page.goto("/apply");
  await page.screenshot({ path: "/opt/cursor/artifacts/apply-mobile.png", fullPage: false });
  await page.goto("/signin");
  await page.screenshot({ path: "/opt/cursor/artifacts/signin-mobile.png", fullPage: false });
  await page.addInitScript((s) => {
    (window as unknown as { __PVRS_MOCK: boolean; __PVRS_SEED: object }).__PVRS_MOCK = true;
    (window as unknown as { __PVRS_SEED: object }).__PVRS_SEED = s;
  }, ownerSeed());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dispatch" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/pipeline-mobile.png", fullPage: false });
  await page.screenshot({ path: "/opt/cursor/artifacts/nav-mobile.png", fullPage: false });
  for (const name of ["Dispatch", "Orientation", "Messages", "More"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator("nav.dock button.on")).toHaveCount(1);
    await expect(page.locator("nav.dock button.on")).toHaveText(name);
    if (name === "More") await page.locator(".fixed.inset-0").click({ position: { x: 8, y: 8 } });
  }
  await page.getByRole("button", { name: "Orientation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orientation" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/onboard-mobile.png", fullPage: false });
  await page.getByRole("button", { name: "Dispatch", exact: true }).click();
  await page.getByRole("button", { name: /Jordan Hale/ }).first().click();
  await expect(page.getByRole("heading", { name: "Jordan Hale" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/file-mobile.png", fullPage: false });
  await page.getByRole("button", { name: /Med Control/ }).click();
  await page.screenshot({ path: "/opt/cursor/artifacts/medcontrol-mobile.png", fullPage: false });
});

test("mobile portal", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, portalSeed());
  await expect(page.getByRole("heading", { name: /Hi Jordan/ })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/portal-mobile.png", fullPage: false });
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    const marks = page.locator("[data-marker]");
    const n = await marks.count();
    expect(n).toBeGreaterThan(3);
    for (let i = 0; i < n; i++) {
      const box = await marks.nth(i).boundingBox();
      expect(box).toBeTruthy();
      expect(Math.abs((box?.width || 0) - (box?.height || 0))).toBeLessThan(1.5);
      expect(box?.width || 0).toBeGreaterThan(16);
    }
    const card = page.locator("#journey");
    const cardBox = await card.boundingBox();
    expect(cardBox).toBeTruthy();
    expect((cardBox?.x || 0) + (cardBox?.width || 0)).toBeLessThanOrEqual(width + 1);
  }
});

test("appearance is per person and reaches the portal", async ({ page }) => {
  await boot(page, ownerSeed(), "/", { mode: "dark", accent: "purple" });
  await expect(page.getByRole("heading", { name: "Dispatch" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
  await page.screenshot({ path: "/opt/cursor/artifacts/pipeline-dark.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Orientation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Orientation" })).toBeVisible();
  await expect(page.locator("nav.dock button.on")).toHaveCount(1);
  await expect(page.locator("nav.dock button.on")).toHaveText("Orientation");
  await expect(page.getByRole("dialog", { name: "How this works" })).toHaveCount(0);
  await page.screenshot({ path: "/opt/cursor/artifacts/onboard-dark-mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: /Dispatch/ }).first().click();
  await page.getByRole("button", { name: /Jordan Hale/ }).first().click();
  await expect(page.getByRole("heading", { name: "Jordan Hale" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/applicant-file-dark.png", fullPage: false });
  await page.getByRole("button", { name: /Rig check/ }).click();
  await expect(page.getByRole("heading", { name: "Appearance" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Purple" })).toHaveAttribute("aria-checked", "true");
  await page.screenshot({ path: "/opt/cursor/artifacts/theme-picker.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, portalSeed(), "/", { mode: "dark", accent: "crimson" });
  await expect(page.getByRole("heading", { name: /Hi Jordan/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await page.screenshot({ path: "/opt/cursor/artifacts/portal-dark-mobile.png", fullPage: false });
  await page.getByRole("button", { name: "Appearance" }).click();
  await expect(page.getByRole("dialog", { name: "Appearance" })).toBeVisible();
});
