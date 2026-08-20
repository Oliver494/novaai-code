import fs from "node:fs";
import path from "node:path";
import { generatedTranslations } from "../src/locales/generated.ts";

const languages = { fr: "French", de: "German", pt: "Portuguese", it: "Italian", zh: "Simplified Chinese", ja: "Japanese", ko: "Korean", ru: "Russian", ar: "Arabic", hi: "Hindi" };
function files(directory) { return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name)) : /\.(ts|tsx)$/.test(entry.name) && entry.name !== "generated.ts" ? [path.join(directory, entry.name)] : []); }
const keys = new Set();
const expression = /\bt\(\s*"(?:\\.|[^"])*"\s*,\s*"((?:\\.|[^"])*)"/g;
for (const file of files(path.resolve("src"))) for (const match of fs.readFileSync(file, "utf8").matchAll(expression)) keys.add(JSON.parse(`"${match[1]}"`));

async function translate(value, language) {
  const response = await fetch("http://127.0.0.1:11434/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "qwen2.5-coder:7b", stream: false, format: "json", options: { temperature: 0 }, messages: [{ role: "system", content: `Translate one software UI string from English to ${language}. Return valid JSON only as {"translation":"..."}. Preserve product names, NovaAI Code, API, RAM, VRAM, Git, Ollama, LM Studio, numbers, and punctuation. Use concise natural language.` }, { role: "user", content: value }] }) });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const result = await response.json();
  const parsed = JSON.parse(result.message.content);
  if (typeof parsed.translation !== "string" || !parsed.translation.trim()) throw new Error("Invalid translation");
  return parsed.translation.trim();
}

for (const [code, name] of Object.entries(languages)) {
  const catalog = { ...(generatedTranslations[code] ?? {}) };
  const missing = [...keys].filter((key) => !catalog[key]?.trim());
  for (const key of missing) catalog[key] = await translate(key, name);
  generatedTranslations[code] = Object.fromEntries(Object.entries(catalog).sort(([left], [right]) => left.localeCompare(right)));
  const output = `// Generated from the complete UI string catalog. Keep keys in English.\nimport type { AppLanguage } from "../services/preferences";\n\nexport const generatedTranslations: Partial<Record<AppLanguage, Record<string, string>>> = ${JSON.stringify(generatedTranslations, null, 2)};\n`;
  fs.writeFileSync(path.resolve("src/locales/generated.ts"), output, "utf8");
  console.log(`${code}: ${missing.length}`);
}
