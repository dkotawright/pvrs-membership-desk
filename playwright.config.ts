import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:5173", viewport: { width: 1440, height: 900 } },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 5173 --strictPort", url: "http://127.0.0.1:5173", reuseExistingServer: true, timeout: 60000 },
});
