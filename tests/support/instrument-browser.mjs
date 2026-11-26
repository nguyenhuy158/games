import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInstrumenter } from "istanbul-lib-instrument";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DIST = resolve(ROOT, "dist");
const RAW_DIRECTORY = resolve(ROOT, ".nyc_output");
const INLINE_DIRECTORY = resolve(ROOT, ".coverage-sources");
const FRONTEND = resolve(ROOT, "frontend/src");
const SHARED = resolve(ROOT, "shared");
const UTF8 = "utf8";
const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs"]);
const HTML_EXTENSION = ".html";
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const EXTERNAL_SCRIPT = /\bsrc\s*=/i;
const NON_JAVASCRIPT_TYPE = /\btype\s*=\s*["'](?:application\/ld\+json|application\/json|importmap)["']/i;
const INSTRUMENTER_OPTIONS = { esModules: true, compact: false, coverageGlobalScope: "globalThis", coverageGlobalScopeFunc: false };
const INLINE_SNAPSHOT = "\nglobalThis.__coverageSnapshot?.(globalThis.__coverage__, location.href);\n";
const instrumenter = createInstrumenter(INSTRUMENTER_OPTIONS);
const baseline = {};

function instrument(source, path) {
  const result = instrumenter.instrumentSync(source, path);
  baseline[path] = instrumenter.lastFileCoverage();
  return result;
}

function instrumentHtml(path, output) {
  let index = 0;
  const html = readFileSync(path, UTF8).replace(SCRIPT_TAG, (tag, attributes, source) => {
    if (EXTERNAL_SCRIPT.test(attributes) || NON_JAVASCRIPT_TYPE.test(attributes) || !source.trim()) return tag;
    const scriptPath = resolve(INLINE_DIRECTORY, `${relative(ROOT, path)}.script-${index++}.js`);
    mkdirSync(dirname(scriptPath), { recursive: true });
    writeFileSync(scriptPath, source, UTF8);
    return `<script${attributes}>${instrument(source, scriptPath)}${INLINE_SNAPSHOT}</script>`;
  });
  writeFileSync(output, html, UTF8);
}

function instrumentTree(directory, output) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const destination = resolve(output, entry.name);
    if (entry.isDirectory()) instrumentTree(path, destination);
    else if (JAVASCRIPT_EXTENSIONS.has(extname(path))) writeFileSync(destination, instrument(readFileSync(path, UTF8), path), UTF8);
    else if (extname(path) === HTML_EXTENSION) instrumentHtml(path, destination);
  }
}

instrumentTree(FRONTEND, DIST);
instrumentTree(SHARED, resolve(DIST, "shared"));
instrumentHtml(resolve(ROOT, "index.html"), resolve(DIST, "index.html"));
mkdirSync(RAW_DIRECTORY, { recursive: true });
writeFileSync(resolve(RAW_DIRECTORY, "browser-baseline.json"), JSON.stringify(baseline), UTF8);
