export type ProjectInfo = {
  name: string;
  path: string;
};

export type FileNode = {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children: FileNode[];
};

export type OpenFile = {
  name: string;
  path: string;
  relativePath: string;
  content: string;
  savedContent: string;
};

export type Notice = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
};

export type ProviderId = "ollama" | "lm_studio" | "open_ai" | "anthropic" | "gemini" | "nvidia" | "zai" | "custom";
export type ReasoningEffort = "low" | "medium" | "high";

export type ProviderConfig = {
  provider: ProviderId;
  endpoint: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  connectTimeoutSecs: number;
  firstResponseTimeoutSecs: number;
  inactivityTimeoutSecs: number;
  maxResponseTimeoutSecs: number;
  apiKeyConfigured: boolean;
};

export type AiSettings = {
  activeProvider: ProviderId | null;
  providers: ProviderConfig[];
};

export type ModelInfo = {
  id: string;
  name: string;
  loaded: boolean | null;
  contextWindow: number | null;
};

export type LocalModelCatalogItem = {
  id: string;
  name: string;
  family: string;
  description: string;
  parameters: string;
  size: string;
  ollamaId: string;
  lmStudioId: string;
  recommended: boolean;
};

export type LocalModelDownloadEvent =
  | { type: "status"; message: string; progress: number | null }
  | { type: "done"; modelId: string }
  | { type: "error"; diagnostic: Diagnostic };

export type Diagnostic = {
  code: string;
  title: string;
  explanation: string;
  cause: string;
  action: string;
  technicalDetails: string | null;
  retryable: boolean;
};

export type ProviderTestResult = {
  connected: boolean;
  durationMs: number;
  models: ModelInfo[];
  diagnostic: Diagnostic | null;
};

export type ChatUpload = {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  kind: "image" | "text";
  data: string;
  size: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  createdAt: number;
  uploads?: Omit<ChatUpload, "data">[];
};

export type Conversation = {
  id: string;
  title: string;
  customTitle: boolean;
  projectPath: string | null;
  pinned: boolean;
  pinnedOrder: number | null;
  archived: boolean;
  archivedAt: number | null;
  lastError?: boolean;
  approvalMode: "ask" | "auto" | "full";
  agentTask?: AgentTask;
  compactedContext?: string;
  compactedAt?: number;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

export type AgentState = "idle" | "analyzing" | "planning" | "awaiting_approval" | "executing" | "testing" | "correcting" | "completed" | "cancelled" | "failed" | "interrupted";
export type AgentStep = { id: string; label: string; status: "pending" | "in_progress" | "completed" | "failed"; detail?: string };
export type AgentTask = { id: string; state: AgentState; startedAt: number; updatedAt: number; steps: AgentStep[]; command?: string; output?: string; exitCode?: number | null; durationMs?: number; truncated?: boolean };
export type AgentToolSpec = { id: string; description: string; risk: "low" | "medium" | "high"; permission: "read" | "write" | "execute" | "destructive"; timeoutSecs: number; cancellable: boolean };
export type DetectedCommand = { id: string; label: string; program: string; args: string[]; kind: "test" | "build" | "check" };
export type AgentCommandEvent =
  | { type: "started"; command: string }
  | { type: "output"; stream: "stdout" | "stderr"; text: string }
  | { type: "finished"; exitCode: number | null; durationMs: number; truncated: boolean }
  | { type: "cancelled" }
  | { type: "error"; code: string; title: string; explanation: string; action: string };

export type AiFileChange = { path: string; content: string };
export type AiProjectAction = {
  type: "write" | "mkdir" | "rename" | "delete";
  path: string;
  content?: string;
  newPath?: string;
};

export type AiChatEvent =
  | { type: "status"; message: string; elapsedMs: number }
  | { type: "reasoning"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; elapsedMs: number }
  | { type: "cancelled" }
  | { type: "error"; diagnostic: Diagnostic };
