import { access, readFile } from "node:fs/promises";

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME ?? "";
if (!/^\d+\.\d+\.\d+$/.test(tag)) throw new Error(`Release tag must be x.y.z without a prefix: ${tag || "missing"}`);

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));

if (manifest.version !== tag) throw new Error(`manifest.json version ${manifest.version} does not match tag ${tag}`);
if (packageJson.version !== tag) throw new Error(`package.json version ${packageJson.version} does not match tag ${tag}`);
if (versions[tag] !== manifest.minAppVersion) {
  throw new Error(`versions.json must map ${tag} to minAppVersion ${manifest.minAppVersion}`);
}
if (!/^[a-z][a-z-]*[a-z]$/.test(manifest.id) || manifest.id.includes("obsidian") || manifest.id.endsWith("plugin")) {
  throw new Error(`Invalid community plugin id: ${manifest.id}`);
}

for (const path of ["dist/main.js", "manifest.json", "styles.css"]) await access(path);
process.stdout.write(`Release ${tag} is internally consistent.\n`);
