import esbuild from "esbuild";

const releaseBuild = process.argv.includes("--release");

await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/*"],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  outfile: "dist/main.js",
  sourcemap: false,
  minify: releaseBuild,
  logLevel: "info",
});
