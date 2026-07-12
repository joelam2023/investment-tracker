import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

await rm("test-dist", { recursive: true, force: true });

await esbuild.build({
  entryPoints: [
    "tests/calculations.test.ts",
    "tests/events.test.ts",
    "tests/benchmark.test.ts",
    "tests/privacy.test.ts",
    "tests/disclosure.test.ts",
    "tests/monthly-performance.test.ts",
    "tests/encryption.test.ts",
    "tests/performance-sampling.test.ts",
    "tests/performance-defaults.test.ts",
    "tests/chart-scale.test.ts",
    "tests/settings.test.ts",
    "tests/auto-lock.test.ts",
    "tests/support.test.ts",
    "tests/i18n.test.ts",
    "tests/fred-provider.test.ts",
    "tests/money.test.ts",
    "tests/components.test.ts",
  ],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  outdir: "test-dist",
  plugins: [
    {
      name: "obsidian-test-stub",
      setup(build) {
        build.onResolve({ filter: /^obsidian$/ }, () => ({
          path: fileURLToPath(new URL("./tests/obsidian-stub.ts", import.meta.url)),
        }));
      },
    },
  ],
  logLevel: "info",
});
