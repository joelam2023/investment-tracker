import { readdir, readFile, lstat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(process.cwd());
const skippedDirectories = new Set([".git", "node_modules", "test-dist"]);
const forbiddenDirectories = new Set([".obsidian", "events", "market-cache", "exports", "backups"]);
const forbiddenFileNames = new Set(["data.json", "ledger-meta.json", ".DS_Store"]);
const forbiddenExtensions = new Set([
  ".csv", ".tsv", ".xls", ".xlsx", ".xlsm",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf",
  ".pem", ".key", ".p12", ".pfx",
]);
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".txt", ".yaml", ".yml",
]);
const contentPatterns = [
  { label: "macOS home path", pattern: new RegExp(["/", "Users", "/"].join("")) },
  { label: "Linux home path", pattern: new RegExp(["/", "home", "/"].join("")) },
  { label: "Windows home path", pattern: new RegExp(["[A-Za-z]:\\\\", "Users", "\\\\"].join("")) },
  { label: "private temporary path", pattern: new RegExp(["/", "private", "/", "tmp", "/"].join("")) },
  { label: "macOS temporary path", pattern: new RegExp(["/", "var", "/", "folders", "/"].join("")) },
  { label: "AWS access key", pattern: new RegExp(["AKIA", "[0-9A-Z]{16}"].join("")) },
  { label: "GitHub token", pattern: new RegExp(["gh", "[pousr]_[A-Za-z0-9_]{30,}"].join("")) },
  { label: "OpenAI-style secret", pattern: new RegExp(["s", "k-[A-Za-z0-9_-]{20,}"].join("")) },
  { label: "private key block", pattern: new RegExp(["-----BEGIN ", "[A-Z ]*PRIVATE KEY-----"].join("")) },
];

const errors = [];

function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index).toLowerCase() : "";
}

async function scanDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    const display = relative(root, absolute) || entry.name;
    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name)) continue;
      if (forbiddenDirectories.has(entry.name)) {
        errors.push(`${display}: forbidden private-data directory`);
        continue;
      }
      await scanDirectory(absolute);
      continue;
    }
    if (entry.isSymbolicLink()) {
      if (!skippedDirectories.has(entry.name)) errors.push(`${display}: symbolic links are not allowed`);
      continue;
    }
    if (!entry.isFile()) continue;
    if (forbiddenFileNames.has(entry.name) || entry.name === ".env" || entry.name.startsWith(".env.")) {
      errors.push(`${display}: forbidden private-data file`);
      continue;
    }
    const extension = extensionOf(entry.name);
    if (forbiddenExtensions.has(extension)) {
      errors.push(`${display}: forbidden financial, credential, or image file type`);
      continue;
    }
    if (!textExtensions.has(extension) && entry.name !== "LICENSE" && entry.name !== ".gitignore") continue;
    const status = await lstat(absolute);
    if (status.size > 2_000_000) {
      errors.push(`${display}: text file exceeds the 2 MB privacy scan limit`);
      continue;
    }
    const content = await readFile(absolute, "utf8");
    for (const { label, pattern } of contentPatterns) {
      if (pattern.test(content)) errors.push(`${display}: contains ${label}`);
    }
  }
}

await scanDirectory(root);

if (errors.length > 0) {
  process.stderr.write(`Privacy check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Privacy check passed.\n");
}
