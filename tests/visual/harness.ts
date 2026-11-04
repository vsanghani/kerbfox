import { test as base, expect } from "@playwright/experimental-ct-react";

export { expect };

const FIXED_TIME = new Date("2026-06-15T01:30:00.000Z");

export const test = base.extend({
  page: async ({ page }, applyPage, testInfo) => {
    const dark = testInfo.project.name.endsWith("-dark");
    await page.clock.install({ time: FIXED_TIME });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addStyleTag({
      content:
        "*,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important;scroll-behavior:auto !important}html,body{background:var(--paper)}",
    });
    await page.evaluate((isDark) => {
      const root = document.documentElement;
      if (isDark) {
        root.dataset.theme = "dark";
        root.style.colorScheme = "dark";
      } else {
        delete root.dataset.theme;
        root.style.colorScheme = "light";
      }
    }, dark);
    await page.evaluate(async () => {
      await Promise.all([
        document.fonts.load("440 17px Inter"),
        document.fonts.load("520 16px Inter"),
        document.fonts.load("560 32px 'Inter Tight'"),
        document.fonts.load("520 48px 'Inter Tight'"),
      ]);
      await document.fonts.ready;
    });
    const ready = await page.evaluate(
      () => document.fonts.check("16px Inter") && document.fonts.check("32px 'Inter Tight'"),
    );
    if (!ready) throw new Error("Self-hosted fonts were not loaded before the component mounted.");
    await page.route(
      (url) =>
        url.hostname !== "localhost" && url.hostname !== "127.0.0.1" && url.hostname !== "[::1]",
      async (route) => {
        await route.abort("blockedbyclient");
      },
    );
    await page.route("**/api/consent", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          choice: null,
          essential: true,
          analytics: false,
          version: null,
          timestamp: null,
        }),
      });
    });
    await applyPage(page);
  },
});
