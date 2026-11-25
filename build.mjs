// Bundles the extension into dist/ (load it as an unpacked extension).
import * as esbuild from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

const watch = process.argv.includes("--watch");

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("public", "dist", { recursive: true });
cpSync("src/popup/popup.html", "dist/popup.html");
cpSync("src/options/options.html", "dist/options.html");
cpSync("src/ui.css", "dist/ui.css");

const options = {
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup/popup.ts",
    options: "src/options/options.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "esm",
  target: "chrome120",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  loader: { ".css": "text" },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
