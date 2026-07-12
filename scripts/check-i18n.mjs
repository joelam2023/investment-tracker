import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import ts from "typescript";

const root = process.cwd();
const srcRoot = resolve(root, "src");
const localeRoot = resolve(srcRoot, "i18n", "locales");
const localeFiles = new Map([
  ["zh", "zh.ts"],
  ["zh-TW", "zh-TW.ts"],
  ["ja", "ja.ts"],
  ["ko", "ko.ts"],
  ["es", "es.ts"],
  ["de", "de.ts"],
  ["fr", "fr.ts"],
  ["pt-BR", "pt-BR.ts"],
]);
const requestedLocales = new Set(process.argv.slice(2));
const checkedLocaleFiles = requestedLocales.size === 0
  ? localeFiles
  : new Map([...localeFiles].filter(([locale]) => requestedLocales.has(locale)));
for (const locale of requestedLocales) {
  if (!localeFiles.has(locale)) throw new Error(`Unknown locale: ${locale}`);
}

async function listTypeScriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listTypeScriptFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

function placeholders(value) {
  return [...new Set(value.match(/\{[A-Za-z0-9_]+\}/g) ?? [])].sort();
}

function readCatalog(source, fileName) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const catalog = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
      for (const property of declaration.initializer.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteralLike(property.initializer)) continue;
        const name = property.name;
        const key = ts.isStringLiteralLike(name) || ts.isIdentifier(name) ? name.text : null;
        if (key !== null) catalog.set(key, property.initializer.text);
      }
    }
  }
  return catalog;
}

const errors = [];
const messages = new Set();
const sourceFiles = await listTypeScriptFiles(srcRoot);
for (const path of sourceFiles) {
  if (path.startsWith(localeRoot)) continue;
  const source = await readFile(path, "utf8");
  const display = relative(root, path);
  if (!path.includes(`${resolve(srcRoot, "i18n")}/`) && /[\u3400-\u9fff]/u.test(source)) {
    errors.push(`${display}: contains Han characters outside the locale layer`);
  }
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "t") {
      const first = node.arguments[0];
      if (!first || !ts.isStringLiteralLike(first)) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        errors.push(`${display}:${position.line + 1}: t() must use a literal English source string`);
      } else {
        messages.add(first.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

for (const [locale, fileName] of checkedLocaleFiles) {
  const path = resolve(localeRoot, fileName);
  const catalog = readCatalog(await readFile(path, "utf8"), fileName);
  for (const message of messages) {
    const translation = catalog.get(message);
    if (!translation) {
      errors.push(`${relative(root, path)}: missing translation for ${JSON.stringify(message)}`);
      continue;
    }
    if (JSON.stringify(placeholders(translation)) !== JSON.stringify(placeholders(message))) {
      errors.push(`${relative(root, path)}: placeholder mismatch for ${JSON.stringify(message)}`);
    }
  }
  for (const key of catalog.keys()) {
    if (!messages.has(key)) errors.push(`${relative(root, path)}: unused translation key ${JSON.stringify(key)}`);
  }
}

if (errors.length > 0) {
  process.stderr.write(`i18n check failed:\n${errors.map((error) => `- ${error}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  const languageCount = checkedLocaleFiles.size + (requestedLocales.size === 0 ? 1 : 0);
  process.stdout.write(`i18n check passed for ${messages.size} source messages across ${languageCount} language${languageCount === 1 ? "" : "s"}.\n`);
}
