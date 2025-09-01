import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"], // ensure CommonJS for native addons
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: false,
  bundle: true,
  skipNodeModulesBundle: true, // do not bundle deps
  external: [
    "node-datachannel", // keep native addon external
    "wrtc", // (add any other native modules)
  ],
});