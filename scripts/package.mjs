// Zips the builds, ready for the stores or a GitHub release:
//   moddog-<version>-chrome.zip   Chrome Web Store, Edge Add-ons, Opera add-ons (Opera GX)
//   moddog-<version>-firefox.zip  addons.mozilla.org
// Usage: npm run build && npm run package
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { zipSync } from "fflate";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const builds = { chrome: "dist", firefox: "dist-firefox" };

for (const [target, dir] of Object.entries(builds)) {
  if (!existsSync(join(dir, "manifest.json"))) {
    throw new Error(`${dir}/manifest.json missing: run \`npm run build\` first.`);
  }
  const files = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(dir, path).replaceAll("\\", "/")] = readFileSync(path);
    }
  };
  walk(dir);
  const out = `moddog-${version}-${target}.zip`;
  writeFileSync(out, zipSync(files, { level: 9 }));
  console.log(`${out} (${Object.keys(files).length} files)`);
}
