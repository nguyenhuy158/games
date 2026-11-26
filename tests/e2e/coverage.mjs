import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const OUTPUT_DIRECTORY = resolve(".nyc_output");
const UTF8 = "utf8";
const EMPTY_PAGE = "about:blank";

export async function saveCoverage(page) {
  if (!process.env.E2E_COVERAGE || page.url() === EMPTY_PAGE) return;
  const coverage = await page.evaluate(() => globalThis.__coverage__);
  await saveCoverageData(coverage, page.url());
}

export async function saveCoverageData(coverage, sourceUrl) {
  if (!process.env.E2E_COVERAGE || sourceUrl === EMPTY_PAGE) return;
  if (!coverage || !Object.keys(coverage).length) throw new Error(`No instrumented browser coverage at ${sourceUrl}`);
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  await writeFile(resolve(OUTPUT_DIRECTORY, `browser-${randomUUID()}.json`), JSON.stringify(coverage), UTF8);
}
