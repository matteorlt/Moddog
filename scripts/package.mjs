// Zips dist/ into moddog-<version>.zip, ready for the Chrome Web Store or a GitHub release.
// Usage: npm run build && npm run package
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files[relative("dist", path).replaceAll("\\", "/")] = readFileSync(path);
  }
};
walk("dist");
if (!files["manifest.json"]) throw new Error("dist/manifest.json missing: run `npm run build` first.");
const out = `moddog-${version}.zip`;
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out} (${Object.keys(files).length} files)`);
