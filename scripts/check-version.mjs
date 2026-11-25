// Fails if package.json and the manifest disagree on the version,
// or (when given a tag like v1.2.3) if the tag doesn't match them.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")).version;
const tag = process.argv[2]?.replace(/^refs\/tags\//, "");

const errors = [];
if (pkg !== manifest) errors.push(`package.json is ${pkg} but public/manifest.json is ${manifest}`);
if (tag && tag !== `v${pkg}`) errors.push(`tag ${tag} doesn't match version v${pkg}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`version ${pkg} OK${tag ? ` (tag ${tag})` : ""}`);
