import { rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { freePort, run, startServer } from "@huyab/e2e";

const require = createRequire(import.meta.url);
const NYC = require.resolve("nyc/bin/nyc.js");
const REGISTER = fileURLToPath(new URL("./register-coverage.mjs", import.meta.url));
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTPUT_DIRECTORIES = [".nyc_output", "coverage", ".coverage-sources"];
const NODE_OPTIONS = [process.env.NODE_OPTIONS, "--import", JSON.stringify(REGISTER)].filter(Boolean).join(" ");
const BROWSER_SUITES = ["readonly-smoke", "round-evidence", "core-coverage", "board-coverage", "solo-social-coverage"];
const COVERAGE_ENABLED = "1";
const EXIT_FAILURE = 1;

process.chdir(ROOT);
for (const path of OUTPUT_DIRECTORIES) await rm(path, { recursive: true, force: true });
let failure;
let server;
try {
  await run(process.execPath, [NYC, "--silent", process.execPath, "logic.test.mjs"], { label: "unit coverage", env: { NODE_OPTIONS } });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  server = await startServer({
    command: "pnpm",
    args: ["exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", port],
    readyUrl: `${base}/api/version`,
    env: { E2E_COVERAGE: COVERAGE_ENABLED },
  });
  for (const suite of BROWSER_SUITES) {
    try {
      await run(process.execPath, [`e2e/${suite}.mjs`], {
        label: suite,
        env: { E2E_COVERAGE: COVERAGE_ENABLED, E2E_BASE_URL: base, E2E_PAGE_CONCURRENCY: "1", E2E_VIDEO_DIR: "" },
      });
    } catch (error) {
      console.error(error);
      failure ??= error;
    }
  }
} catch (error) {
  failure = error;
} finally {
  if (server) await server.stop();
  await run(process.execPath, [NYC, "report"], { label: "combined coverage report" });
}
if (failure) {
  console.error(failure);
  process.exitCode = EXIT_FAILURE;
} else {
  await run(process.execPath, [NYC, "check-coverage"], { label: "100% whole-application coverage gate" });
}
