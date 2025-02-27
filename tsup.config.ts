import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"], // Build for ESmodules
  dts: false, // Generate declaration file (.d.ts)
  splitting: false, // Disable code splitting if unnecessary
  clean: true, // Clean output folder before build
  sourcemap: false, // Disable sourcemaps for production
  minify: true, // Minify the output
  //onSuccess: 'cp src/config/swarm.key dist/', // Command to copy files post-build
});