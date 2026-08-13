import anthropicLogo from "../assets/providers/anthropic.png";
import geminiLogo from "../assets/providers/gemini.svg";
import lmStudioLogo from "../assets/providers/lm-studio.png";
import nvidiaLogo from "../assets/providers/nvidia.svg";
import ollamaLogo from "../assets/providers/ollama.png";
import openAiLogo from "../assets/providers/openai.svg";
import zaiLogo from "../assets/providers/zai.svg";
import { Plug } from "lucide-react";
import type { ProviderId } from "../types";

type Props = { provider: ProviderId; size?: "small" | "medium" | "large"; className?: string };

const logos: Partial<Record<ProviderId, string>> = {
  ollama: ollamaLogo,
  lm_studio: lmStudioLogo,
  open_ai: openAiLogo,
  anthropic: anthropicLogo,
  gemini: geminiLogo,
  nvidia: nvidiaLogo,
  zai: zaiLogo,
};

const names: Record<ProviderId, string> = {
  ollama: "Ollama",
  lm_studio: "LM Studio",
  open_ai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  nvidia: "NVIDIA",
  zai: "Z.AI",
  custom: "Personalizado",
};

export function ProviderLogo({ provider, size = "medium", className = "" }: Props) {
  const logo = logos[provider];
  return <i className={`provider-logo provider-logo--${provider} provider-logo--${size} ${className}`} aria-hidden="true">
    {logo ? <img src={logo} alt="" title={names[provider]} draggable={false} /> : <Plug size={size === "large" ? 24 : size === "small" ? 15 : 19} />}
  </i>;
}
