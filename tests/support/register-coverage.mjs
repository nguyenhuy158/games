import { register } from "node:module";

const COVERAGE_LOADER = "@istanbuljs/esm-loader-hook";
register(COVERAGE_LOADER, new URL("../../", import.meta.url));
