import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { generatedTranslations } from "../src/locales/generated.ts";

const translatedLanguages = ["fr", "de", "pt", "it", "zh", "ja", "ko", "ru", "ar", "hi"] as const;
const dynamicKeys = [
  "File name", "Folder name", "New name", "Clear chat", "Compact context", "Run tests", "Build project", "Check project", "View commands",
  "Open a new chat", "Delete the messages in this chat", "Summarize history to use less context", "Detect and run project tests",
  "Detect and run the build", "Run lint or type checking", "Show quick help",
];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) && !target.endsWith(path.join("locales", "generated.ts")) ? [target] : [];
  });
}

function uiKeys() {
  const keys = new Set(dynamicKeys);
  const expression = /\bt\(\s*"(?:\\.|[^"])*"\s*,\s*"((?:\\.|[^"])*)"/g;
  for (const file of sourceFiles(path.resolve("src"))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(expression)) keys.add(JSON.parse(`"${match[1]}"`) as string);
  }
  return [...keys];
}

test("todos los idiomas tienen cada texto de la interfaz", () => {
  const keys = uiKeys();
  assert.ok(keys.length > 250, `El catálogo parece incompleto: ${keys.length} textos`);
  for (const language of translatedLanguages) {
    const catalog = generatedTranslations[language] ?? {};
    const missing = keys.filter((key) => !catalog[key]?.trim());
    assert.deepEqual(missing, [], `${language} tiene textos sin traducir`);
  }
});
