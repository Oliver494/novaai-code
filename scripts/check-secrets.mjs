import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ignoredDirectories = new Set([".git", "node_modules", "dist", "target", "release-artifacts"]);
const ignoredFiles = new Set(["package-lock.json", "generated.ts", "check-secrets.mjs"]);
const textExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".toml", ".md", ".yml", ".yaml", ".html", ".css", ".rs", ".txt"]);
const signatures = [
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{16,}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g],
  ["NVIDIA API key", /\bnvapi-[A-Za-z0-9_-]{20,}\b/gi],
  ["Private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") && entry.name !== ".github") return [];
    if (ignoredDirectories.has(entry.name)) return [];
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files(target);
    if (ignoredFiles.has(entry.name) || !textExtensions.has(path.extname(entry.name).toLowerCase())) return [];
    return [target];
  });
}

const findings = [];
for (const file of files(root)) {
  const content = fs.readFileSync(file, "utf8");
  for (const [name, expression] of signatures) {
    expression.lastIndex = 0;
    for (const match of content.matchAll(expression)) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(`${path.relative(root, file)}:${line} — ${name}`);
    }
  }
}

if (findings.length) {
  console.error("Potential secrets found:\n" + findings.join("\n"));
  process.exit(1);
}
console.log("Secret scan passed.");
