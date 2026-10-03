// Tìm Chromium cho playwright-core (không tự tải browser): ưu tiên biến môi trường,
// rồi thư mục browser cài sẵn (CI: `playwright-core install chromium`), rồi Chrome
// cài trên máy (macOS), cuối cùng để playwright-core tự tìm.
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BROWSER_ROOTS = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  "/opt/pw-browsers",
  join(homedir(), ".cache", "ms-playwright"),
  join(homedir(), "Library", "Caches", "ms-playwright"),
].filter(Boolean);

const BINARY_SUBPATHS = [
  "chrome-linux/chrome",
  "chrome-linux/headless_shell",
  "chrome",
  "headless_shell",
];

const SYSTEM_CHROME =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Đường dẫn Chromium tìm được, hoặc undefined để playwright-core tự quyết. */
export function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH)
    return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  for (const root of BROWSER_ROOTS) {
    if (!existsSync(root)) continue;
    const entries = readdirSync(root).filter((name) =>
      name.startsWith("chromium"),
    );
    // Bản đầy đủ (chromium-*) trước headless_shell để có đủ tính năng.
    entries.sort(
      (a, b) =>
        Number(b.startsWith("chromium-")) - Number(a.startsWith("chromium-")),
    );
    for (const entry of entries) {
      for (const subpath of BINARY_SUBPATHS) {
        const candidate = join(root, entry, subpath);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  if (existsSync(SYSTEM_CHROME)) return SYSTEM_CHROME;
  return undefined;
}
