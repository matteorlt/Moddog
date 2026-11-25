// Bundles the extension for each browser:
//   dist/          Chrome, Edge, Brave, Opera / Opera GX (load it as an unpacked extension)
//   dist-firefox/  Firefox (about:debugging → Load Temporary Add-on → dist-firefox/manifest.json)
//
// Usage: node build.mjs [--watch] [--target=chrome|firefox|all]

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as esbuild from "esbuild";
import { manifestFor } from "./scripts/manifest.mjs";

const watch = process.argv.includes("--watch");
const targetArg = process.argv.find((a) => a.startsWith("--target="))?.split("=")[1] ?? (watch ? "chrome" : "all");
const targets = targetArg === "all" ? ["chrome", "firefox"] : [targetArg];

const OUT = { chrome: "dist", firefox: "dist-firefox" };
const baseManifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));

function prepare(target) {
  const out = OUT[target];
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync("public", out, { recursive: true });
  writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifestFor(target, baseManifest), null, 2)}\n`);
  cpSync("src/popup/popup.html", `${out}/popup.html`);
  cpSync("src/options/options.html", `${out}/options.html`);
  cpSync("src/ui.css", `${out}/ui.css`);
  return out;
}

function options(target, outdir) {
  return {
    entryPoints: {
      background: "src/background.ts",
      content: "src/content.ts",
      popup: "src/popup/popup.ts",
      options: "src/options/options.ts",
    },
    outdir,
    bundle: true,
    format: "esm",
    target: target === "firefox" ? "firefox140" : "chrome120",
    // Firefox's promise-based API is `browser`; the code is written against `chrome`.
    define: target === "firefox" ? { chrome: "browser" } : {},
    loader: { ".css": "text" },
    sourcemap: watch ? "inline" : false,
    minify: !watch,
    logLevel: "info",
  };
}

for (const target of targets) {
  const outdir = prepare(target);
  if (watch) {
    const ctx = await esbuild.context(options(target, outdir));
    await ctx.watch();
  } else {
    await esbuild.build(options(target, outdir));
  }
}
