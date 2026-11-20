import { test, expect } from "@playwright/test";
import { declinedSeed, interviewerSeed, memberSeed, ownerSeed, portalSeed } from "../src/lib/demo";

async function boot(page: import("@playwright/test").Page, seed: object | null, path = "/") {
  await page.addInitScript((s) => {
    try { localStorage.setItem("pvrsTourOff", "1"); } catch { /* ignore */ }
    (window as unknown as { __PVRS_MOCK: boolean; __PVRS_SEED: object | null }).__PVRS_MOCK = true;
    (window as unknown as { __PVRS_SEED: object | null }).__PVRS_SEED = s;
  }, seed);
  await page.goto(path);
}

test("home invites people to apply", async ({ page }) => {
  await boot(page, { user: null, docs: {} });
  await expect(page.getByRole("heading", { name: /Serve Potsdam/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Apply to join PVRS/i })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/home-desktop.png", fullPage: false });
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
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Jordan Hale/ }).first()).toBeVisible();
  await expect(page.getByText("Screening").first()).toBeVisible();
  await expect(page.getByText("Onboarding").first()).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/pipeline-board.png", fullPage: false });
  await page.getByRole("button", { name: "List" }).click();
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
  await expect(page.getByRole("dialog", { name: "Med Control" })).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText(/ready for the board/i).first()).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/med-control.png" });
});

test("messages are a channel, not a buried menu", async ({ page }) => {
  await boot(page, ownerSeed());
  await page.getByRole("button", { name: "Messages" }).click();
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
  await page.getByRole("button", { name: "Messages" }).click();
  await expect(page.getByRole("heading", { name: "#General" })).toBeVisible();
});

test("a bad reference link explains itself", async ({ page }) => {
  await boot(page, { user: null, docs: {} }, "/ref/not-a-real-code");
  await expect(page.getByRole("heading", { name: /This link/i })).toBeVisible();
});

test("mobile pipeline and home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, { user: null, docs: {} });
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
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/pipeline-mobile.png", fullPage: false });
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
});
