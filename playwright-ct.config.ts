import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/experimental-ct-react";
import react from "@vitejs/plugin-react";

const jsonImportHook = Symbol.for("kerbfox.json-import-hook");
if (!Reflect.get(globalThis, jsonImportHook)) {
  Reflect.set(globalThis, jsonImportHook, true);
  registerHooks({
    load(url, context, nextLoad) {
      const loaded = nextLoad(url, context);
      const raw = loaded.source;
      const source =
        typeof raw === "string"
          ? raw
          : raw instanceof Uint8Array
            ? Buffer.from(raw).toString("utf8")
            : undefined;
      if (!source || !source.includes(".json")) return loaded;
      const rewritten = source.replace(
        /(from\s+)(['"])([^'"]+\.json)\2(?!\s*with\b)/g,
        '$1$2$3$2 with { type: "json" }',
      );
      return rewritten === source ? loaded : { ...loaded, source: rewritten };
    },
  });
}

const root = path.dirname(fileURLToPath(import.meta.url));
const blankStyle = path.join(root, "tests/visual/blank-map-style.ts");
const stylesDir = path.join(root, "tests/visual/styles");

const desktop = { width: 1280, height: 800 };
const mobile = { width: 390, height: 844 };

function blankMapStyle() {
  return {
    name: "blank-map-style",
    enforce: "pre" as const,
    resolveId(source: string, importer: string | undefined) {
      if (!importer || (source !== "../config/map" && source !== "../config/map.ts")) return null;
      const resolved = path.resolve(path.dirname(importer), source);
      const normalised = resolved.split(path.sep).join("/");
      if (!normalised.endsWith("/src/config/map") && !normalised.endsWith("/src/config/map.ts"))
        return null;
      return blankStyle;
    },
  };
}

type PreviewResponse = {
  setHeader: (name: string, value: string) => void;
  end: (body: Buffer) => void;
};

type PreviewRequest = { url?: string };

function serveBlankStyles() {
  return {
    name: "serve-blank-styles",
    configurePreviewServer(server: {
      middlewares: {
        use: (
          handler: (req: PreviewRequest, res: PreviewResponse, next: () => void) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        const file = path.join(stylesDir, path.basename(pathname));
        if (!pathname.startsWith("/visual/") || !fs.existsSync(file)) {
          next();
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(fs.readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  testDir: "tests/visual",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  updateSnapshots: process.env.CI ? "none" : "missing",
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    ctPort: 3100,
    timezoneId: "Australia/Melbourne",
    locale: "en-AU",
    deviceScaleFactor: 1,
    ctViteConfig: {
      plugins: [react(), blankMapStyle(), serveBlankStyles()],
    },
  },
  projects: [
    {
      name: "desktop-light",
      use: { ...devices["Desktop Chrome"], viewport: desktop, deviceScaleFactor: 1 },
    },
    {
      name: "desktop-dark",
      use: {
        ...devices["Desktop Chrome"],
        viewport: desktop,
        deviceScaleFactor: 1,
        colorScheme: "dark",
      },
    },
    {
      name: "mobile-light",
      use: {
        ...devices["Pixel 7"],
        viewport: mobile,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile-dark",
      use: {
        ...devices["Pixel 7"],
        viewport: mobile,
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
      },
    },
  ],
});
