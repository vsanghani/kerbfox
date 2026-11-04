import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requireFromCore = createRequire(
  fileURLToPath(
    new URL("../../node_modules/@playwright/experimental-ct-core/package.json", import.meta.url),
  ),
);
const cli = path.join(path.dirname(requireFromCore.resolve("playwright/package.json")), "cli.js");
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
