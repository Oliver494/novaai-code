import type { ProviderId } from "../types";

export function supportsReasoningEffort(provider: ProviderId, modelId: string): boolean {
  const model = modelId.trim().toLocaleLowerCase();
  if (!model) return false;

  switch (provider) {
    case "open_ai":
      return (/^o\d/.test(model) || model.includes("gpt-5") || model.includes("codex") || model.includes("gpt-oss")) && !model.includes("-pro");
    case "anthropic":
      return ["opus-4-5", "opus-4-6", "opus-4-7", "opus-4-8", "opus-5", "sonnet-4-6", "sonnet-5", "fable-5", "mythos"].some((name) => model.includes(name));
    case "gemini":
      return model.includes("gemini-2.5") || model.includes("gemini-3");
    case "ollama":
    case "lm_studio":
      return model.includes("gpt-oss");
    case "nvidia":
      return model.includes("gpt-oss") || model.includes("sarvam-m");
    case "zai":
    case "custom":
      return false;
  }
}
