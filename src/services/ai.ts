import { Channel, invoke } from "@tauri-apps/api/core";
import type { AiChatEvent, AiSettings, ChatUpload, Diagnostic, ProviderConfig, ProviderId, ProviderTestResult, ModelInfo, LocalModelCatalogItem, LocalModelDownloadEvent } from "../types";

export const providerMeta: Record<ProviderId, { name: string; type: "local" | "cloud"; defaultEndpoint: string; requiresKey: boolean }> = {
  ollama: { name: "Ollama", type: "local", defaultEndpoint: "http://127.0.0.1:11434", requiresKey: false },
  lm_studio: { name: "LM Studio", type: "local", defaultEndpoint: "http://127.0.0.1:1234/v1", requiresKey: false },
  open_ai: { name: "OpenAI", type: "cloud", defaultEndpoint: "https://api.openai.com/v1", requiresKey: true },
  anthropic: { name: "Anthropic", type: "cloud", defaultEndpoint: "https://api.anthropic.com/v1", requiresKey: true },
  gemini: { name: "Google Gemini", type: "cloud", defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta", requiresKey: true },
  nvidia: { name: "NVIDIA API", type: "cloud", defaultEndpoint: "https://integrate.api.nvidia.com/v1", requiresKey: true },
  zai: { name: "Z.AI", type: "cloud", defaultEndpoint: "https://api.z.ai/api/paas/v4", requiresKey: true },
  custom: { name: "Personalizado", type: "cloud", defaultEndpoint: "http://127.0.0.1:8000/v1", requiresKey: false },
};

export const ai = {
  settings: (projectPath: string | null) => invoke<AiSettings>("get_ai_settings", { projectPath }),
  saveSettings: (projectPath: string | null, settings: AiSettings) => invoke<AiSettings>("save_ai_settings", { projectPath, settings }),
  setKey: (provider: ProviderId, projectPath: string | null, apiKey: string) => invoke<void>("set_provider_key", { provider, projectPath, apiKey }),
  deleteKey: (provider: ProviderId, projectPath: string | null) => invoke<void>("delete_provider_key", { provider, projectPath }),
  models: (config: ProviderConfig, projectPath: string | null) => invoke<ModelInfo[]>("list_ai_models", { config, projectPath }),
  localCatalog: () => invoke<LocalModelCatalogItem[]>("list_local_model_catalog"),
  downloadLocalModel: (config: ProviderConfig, modelId: string, onEvent: (event: LocalModelDownloadEvent) => void) => {
    const channel = new Channel<LocalModelDownloadEvent>();
    channel.onmessage = onEvent;
    return invoke<void>("download_local_model", { config, modelId, onEvent: channel });
  },
  test: (config: ProviderConfig, projectPath: string | null) => invoke<ProviderTestResult>("test_ai_provider", { config, projectPath }),
  cancel: (requestId: string) => invoke<boolean>("cancel_ai_chat", { requestId }),
  chat: (request: { requestId: string; projectPath: string | null; config: ProviderConfig; messages: { role: "system" | "user" | "assistant"; content: string }[]; attachments: string[]; uploads: Pick<ChatUpload, "name" | "mimeType" | "kind" | "data">[]; workspaceAccess: boolean; canEdit: boolean }, onEvent: (event: AiChatEvent) => void) => {
    const channel = new Channel<AiChatEvent>();
    channel.onmessage = onEvent;
    return invoke<void>("chat_ai", { request, onEvent: channel });
  },
};

export function asDiagnostic(error: unknown): Diagnostic {
  if (error && typeof error === "object" && "code" in error && "title" in error) return error as Diagnostic;
  return {
    code: "UNKNOWN_ERROR",
    title: "No se pudo completar la operación",
    explanation: typeof error === "string" ? error : error instanceof Error ? error.message : "Ocurrió un error inesperado.",
    cause: "No se pudo identificar la causa exacta.",
    action: "Comprueba la configuración y vuelve a intentarlo.",
    technicalDetails: null,
    retryable: true,
  };
}
