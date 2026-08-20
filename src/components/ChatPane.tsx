import {
  AlertCircle, Bot, Check, ChevronDown, Clipboard, Code2, Edit3, FileCode2, FolderPlus, ShieldCheck,
  Image, LoaderCircle, Plus, Send, Settings2, Square,
  Upload, X,
} from "lucide-react";
import { type ClipboardEvent as ReactClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ai, asDiagnostic, providerMeta } from "../services/ai";
import { agent } from "../services/agent";
import { requestsProjectAction } from "../services/actionIntent";
import { createConversation, loadConversations, saveConversations } from "../services/conversations";
import { archiveConversation, conversationMarkdown, duplicateConversation, isConversationBusy, pinConversation, renameConversation, sortConversations } from "../services/conversationActions";
import { chooseChatFiles, chooseExternalFolder, errorMessage, projectFiles } from "../services/fileSystem";
import { usePreferences } from "../services/preferences";
import type { AgentCommandEvent, AgentTask, AiProjectAction, AiSettings, AppliedChange, AssistantWorkspace, ChatMessage, ChatUpload, ContextReference, Conversation, DetectedCommand, Diagnostic, ExternalFolderGrant, OpenFile, ProjectInfo } from "../types";
import { AgentTaskCard } from "./AgentTaskCard";
import { AssistantMessageContent } from "./AssistantMessageContent";
import { DiagnosticCard } from "./DiagnosticCard";
import { ChatModelPicker } from "./ChatModelPicker";
import { ConversationSidebar } from "./ConversationSidebar";
import type { ConversationMenuAction } from "./ConversationMenu";
import { ConversationDialog } from "./ConversationDialog";

type PreviewAction = AiProjectAction & { before?: string; isNew?: boolean };
type Props = {
  mode: AssistantWorkspace;
  activeWorkspace: boolean;
  project: ProjectInfo | null;
  projects: ProjectInfo[];
  openFiles: OpenFile[];
  settings: AiSettings | null;
  sidebarOpen: boolean;
  onAddProject: () => void;
  onSelectProject: (path: string) => void;
  onConfigure: () => void;
  onSettingsChange: (settings: AiSettings) => void;
  onFilesChanged: (paths: string[]) => Promise<void>;
};

function visibleAnswer(content: string) {
  const internalBlock = content.indexOf("<nova_actions>");
  return (internalBlock >= 0 ? content.slice(0, internalBlock) : content).trim();
}

function validActions(value: unknown): AiProjectAction[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as { actions?: AiProjectAction[] } | AiProjectAction[] : value as { actions?: AiProjectAction[] } | AiProjectAction[];
    const actions = Array.isArray(parsed) ? parsed : parsed.actions || [];
    return actions.filter((item) => {
      if (!["write", "mkdir", "rename", "delete"].includes(item.type) || typeof item.path !== "string" || !item.path.trim()) return false;
      if (item.type === "write") return typeof item.content === "string";
      if (item.type === "rename") return typeof item.newPath === "string" && !!item.newPath.trim();
      return true;
    });
  } catch { return []; }
}

function proposedActions(content: string): AiProjectAction[] {
  const match = content.match(/<nova_actions>([\s\S]*?)<\/nova_actions>/);
  if (match) return validActions(match[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));

  // Some otherwise capable models return the same action JSON without Nova's
  // wrapper. Accept only JSON that validates as an action list; normal prose
  // and ordinary code blocks continue to be treated as chat content.
  const jsonBlock = content.match(/```json\s*\r?\n([\s\S]*?)```/i);
  return validActions(jsonBlock?.[1]?.trim() ?? content.trim());
}

function codeBlockAction(content: string, prompt: string): AiProjectAction[] {
  const blocks = [...content.matchAll(/```([\w.+-]*)?\s*\r?\n([\s\S]*?)```/g)];
  if (!blocks.length) return [];
  const preferred = blocks.find((item) => /^(html?|css|javascript|js|typescript|ts|jsx|tsx)$/i.test(item[1] || "")) ?? blocks[0];
  const code = preferred[2].trim();
  if (!code || code.length > 2 * 1024 * 1024) return [];
  const language = (preferred[1] || "").toLocaleLowerCase();
  const explicitName = prompt.match(/\b([\w-]+\.(?:html?|css|m?js|jsx|tsx?|json|md|py|rs|java|go))\b/i)?.[1];
  const extension = explicitName?.split(".").pop()?.toLocaleLowerCase()
    ?? (/(html?|htm)/.test(language) || /\bhtml\b/i.test(prompt) ? "html"
      : /css/.test(language) || /\bcss\b/i.test(prompt) ? "css"
        : /tsx?/.test(language) ? "ts"
          : /jsx?|javascript/.test(language) ? "js" : "txt");
  const path = explicitName ?? (extension === "html" ? "index.html" : extension === "css" ? "styles.css" : extension === "js" ? "script.js" : `archivo.${extension}`);
  return validActions([{ type: "write", path, content: code }]);
}

function isSimpleGreeting(prompt: string) {
  const normalized = prompt.trim().toLocaleLowerCase().replace(/[¡!¿?,.]/g, "").replace(/\s+/g, " ");
  return /^(hola|hello|hi|hey|buenas|buenos días|buenas tardes|buenas noches|qué tal|que tal)( [\p{L}\p{N}_-]+)?$/u.test(normalized);
}

function requestHistory(messages: ChatMessage[]) {
  // A conversation is its own memory. Do not silently discard earlier turns;
  // providers report a clear context-limit diagnostic when needed.
  return messages.map((item) => ({
    ...item,
    content: item.role === "assistant" ? visibleAnswer(item.content) : item.content,
  }));
}

function message(role: ChatMessage["role"], content: string, uploads?: ChatMessage["uploads"], contextReferences?: ContextReference[]): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: Date.now(), uploads, contextReferences };
}

const SLASH_COMMANDS = [
  { command: "/new", label: ["Nueva conversación", "New conversation"], description: ["Abre un chat nuevo", "Open a new chat"] },
  { command: "/clear", label: ["Limpiar chat", "Clear chat"], description: ["Borra los mensajes de este chat", "Delete the messages in this chat"] },
  { command: "/compact", label: ["Compactar contexto", "Compact context"], description: ["Resume el historial para usar menos contexto", "Summarize history to use less context"] },
  { command: "/test", label: ["Ejecutar pruebas", "Run tests"], description: ["Detecta y ejecuta las pruebas del proyecto", "Detect and run project tests"] },
  { command: "/build", label: ["Compilar proyecto", "Build project"], description: ["Detecta y ejecuta la compilación", "Detect and run the build"] },
  { command: "/check", label: ["Comprobar proyecto", "Check project"], description: ["Ejecuta lint o comprobación de tipos", "Run lint or type checking"] },
  { command: "/help", label: ["Ver comandos", "View commands"], description: ["Muestra la ayuda rápida", "Show quick help"] },
];

export function ChatPane({ mode, activeWorkspace, project, projects, openFiles, settings, sidebarOpen, onAddProject, onSelectProject, onConfigure, onSettingsChange, onFilesChanged }: Props) {
  const { t } = usePreferences();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [projectAttachments, setProjectAttachments] = useState<string[]>([]);
  const [uploads, setUploads] = useState<ChatUpload[]>([]);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingConversationId, setGeneratingConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [waitMs, setWaitMs] = useState(0);
  const [diagnostic, setDiagnostic] = useState<Diagnostic | null>(null);
  const [persistenceError, setPersistenceError] = useState("");
  const [clearRequestedId, setClearRequestedId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewAction[]>([]);
  const [applying, setApplying] = useState(false);
  const [detectedCommands, setDetectedCommands] = useState<DetectedCommand[]>([]);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [pendingCommand, setPendingCommand] = useState<{ conversationId: string; command: DetectedCommand } | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);
  const followMessages = useRef(true);
  const agentRequestId = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const userStoppedRequests = useRef(new Set<string>());
  const lastPrompt = useRef("");
  const assistantBuffer = useRef("");
  const skipPersistence = useRef(false);
  const previewOwner = useRef<{ conversationId: string; messageId: string } | null>(null);
  const modePickerRef = useRef<HTMLDivElement | null>(null);
  const active = settings?.providers.find((item) => item.provider === settings.activeProvider) ?? null;
  const ready = !!active?.model && (!providerMeta[active.provider].requiresKey || active.apiKeyConfigured);
  const conversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const generatingHere = generating && generatingConversationId === conversation?.id;
  const codeMode = mode === "code";
  const modeSwitchDisabled = true;
  const availableCommands = codeMode ? SLASH_COMMANDS : SLASH_COMMANDS.filter((item) => !["/test", "/build", "/check"].includes(item.command));
  const commandSuggestions = input.trimStart().startsWith("/") ? availableCommands.filter((item) => item.command.startsWith(input.trimStart().toLocaleLowerCase())) : [];
  const lastMessageContent = conversation?.messages[conversation.messages.length - 1]?.content ?? "";

  function scrollToBottom(behavior: ScrollBehavior = "smooth") {
    const node = messagesRef.current;
    if (!node) return;
    followMessages.current = true;
    setShowJumpToBottom(false);
    node.scrollTo({ top: node.scrollHeight, behavior });
  }

  function handleMessagesScroll() {
    const node = messagesRef.current;
    if (!node) return;
    const nearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 72;
    followMessages.current = nearBottom;
    setShowJumpToBottom(!nearBottom && node.scrollHeight > node.clientHeight + 40);
  }

  useEffect(() => {
    followMessages.current = true;
    setShowJumpToBottom(false);
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [activeId]);

  useEffect(() => {
    if (!followMessages.current) return;
    requestAnimationFrame(() => scrollToBottom("auto"));
  }, [lastMessageContent, conversation?.messages.length, diagnostic, generatingHere, status]);

  useEffect(() => {
    const storageProject = codeMode ? project?.path ?? null : null;
    if (codeMode && !storageProject) return;
    const loaded = loadConversations(storageProject, mode);
    const initial = (loaded.length ? loaded : [createConversation(storageProject, mode)]).map((item) => ({
      ...item,
      assistantMode: mode,
      // Nunca mostramos ni conservamos razonamientos internos de respuestas anteriores.
      messages: item.messages.map(({ reasoning: _reasoning, ...entry }) => entry),
    }));
    skipPersistence.current = true;
    setConversations(initial);
    setActiveId(initial[0].id);
    setInput(""); setUploads([]); setProjectAttachments([]); setPreview([]); setDiagnostic(null);
    setGeneratingConversationId(null);
  }, [codeMode, mode, project?.path]);

  useEffect(() => {
    // El estado visual de una petición pertenece únicamente al chat que la inició.
    setInput(""); setUploads([]); setProjectAttachments([]); setAttachmentOpen(false); setPreview([]); setDiagnostic(null);
    const selected = conversations.find((item) => item.id === activeId);
    if (selected?.lastError) {
      lastPrompt.current = [...selected.messages].reverse().find((item) => item.role === "user")?.content ?? "";
      setDiagnostic({ code: "INTERRUPTED_SESSION", title: t("Respuesta interrumpida", "Interrupted response"), explanation: t("Nova se cerró o perdió la conexión antes de terminar esta respuesta.", "Nova closed or lost the connection before completing this response."), cause: t("La conversación y la pregunta se conservaron localmente.", "The conversation and question were preserved locally."), action: t("Pulsa Reintentar para continuar.", "Press Retry to continue."), technicalDetails: null, retryable: true });
    }
  }, [activeId]);

  useEffect(() => {
    if (!project) { setDetectedCommands([]); return; }
    agent.detectCommands(project.path).then(setDetectedCommands).catch(() => setDetectedCommands([]));
  }, [project?.path]);

  useEffect(() => {
    if (skipPersistence.current) { skipPersistence.current = false; return; }
    if (conversations.length) {
      const result = saveConversations(codeMode ? project?.path ?? null : null, conversations, mode);
      setPersistenceError(result.ok ? "" : "No se pudieron guardar los chats. El almacenamiento local está lleno o no está disponible.");
    }
  }, [codeMode, conversations, mode, project?.path]);

  const estimatedTokens = useMemo(() => Math.ceil((input.length + projectAttachments.reduce((sum, path) => sum + (openFiles.find((file) => file.relativePath === path)?.content.length ?? 0), 0) + uploads.filter((item) => item.kind === "text").reduce((sum, item) => sum + item.data.length, 0)) / 4), [input, openFiles, projectAttachments, uploads]);

  function updateConversation(updater: (current: Conversation) => Conversation) {
    updateConversationById(activeId, updater);
  }

  function updateConversationById(id: string, updater: (current: Conversation) => Conversation) {
    setConversations((items) => items.map((item) => item.id === id ? updater(item) : item));
  }

  function changeAssistantMode(_nextMode: Conversation["assistantMode"]) {
    // Product workspaces are selected globally; conversations cannot cross them.
    setModePickerOpen(false);
  }

  function newConversation() {
    const created = createConversation(codeMode ? project?.path ?? null : null, mode);
    setConversations((items) => [created, ...items]); setActiveId(created.id); setInput(""); setPreview([]); setDiagnostic(null);
  }

  function addLocalMessage(content: string) {
    if (!conversation) return;
    updateConversationById(conversation.id, (item) => ({ ...item, messages: [...item.messages, message("assistant", content)], updatedAt: Date.now() }));
  }

  async function compactConversation() {
    if (!conversation || !active || !ready || generating) return;
    if (conversation.messages.length < 2) { addLocalMessage(t("No hay suficiente conversación para compactar todavía.", "There is not enough conversation to compact yet.")); return; }
    const transcript = conversation.messages.slice(-40).map((item) => `${item.role === "user" ? "Usuario" : "Nova"}:\n${visibleAnswer(item.content)}`).join("\n\n").slice(-120_000);
    let summary = "";
    setGeneratingConversationId(conversation.id); setGenerating(true); setDiagnostic(null); setStatus(t("Compactando el contexto…", "Compacting context…")); setWaitMs(0);
    const timer = window.setInterval(() => setWaitMs((value) => value + 100), 100);
    try {
      const id = crypto.randomUUID(); requestId.current = id;
      await ai.chat({
        requestId: id, projectPath: null, config: active,
        messages: [
          { role: "system", content: "Resume la conversación para que otro asistente pueda continuar el trabajo. Conserva decisiones, archivos, cambios realizados, errores, tareas pendientes y preferencias. Sé conciso, técnico y responde solo con el resumen." },
          { role: "user", content: transcript },
        ], attachments: [], uploads: [], externalFolders: [], workspaceAccess: false, canEdit: false, codeMode: false,
      }, (event) => {
        if (event.type === "status") { setStatus(event.message); setWaitMs(event.elapsedMs); }
        if (event.type === "delta") summary += event.text;
        if (event.type === "done") { setStatus(t("Contexto compactado", "Context compacted")); setWaitMs(event.elapsedMs); }
        if (event.type === "error") setDiagnostic(event.diagnostic);
      });
      if (summary.trim()) {
        updateConversationById(conversation.id, (item) => ({ ...item, compactedContext: summary.trim(), compactedAt: Date.now(), updatedAt: Date.now() }));
        addLocalMessage(t("Contexto compactado. Nova conservará los puntos importantes y enviará menos historial en los próximos mensajes.", "Context compacted. Nova will keep the important points and send less history in future messages."));
      } else if (!diagnostic) {
        setDiagnostic({ code: "COMPACTION_FAILED", title: "No se pudo compactar el contexto", explanation: "El modelo no devolvió un resumen.", cause: "La respuesta llegó vacía o se interrumpió.", action: "Vuelve a intentarlo más tarde.", technicalDetails: null, retryable: true });
      }
    } catch (cause) { setDiagnostic(asDiagnostic(cause)); setStatus(t("No se pudo compactar el contexto", "Context could not be compacted")); }
    finally { window.clearInterval(timer); setGenerating(false); setGeneratingConversationId(null); requestId.current = null; }
  }

  function runCommand(value: string) {
    const command = value.trim().toLocaleLowerCase().replace(/^\/\s+/, "/").split(/\s+/)[0];
    if (command === "/new") { newConversation(); return true; }
    if (command === "/clear") {
      if (conversation) setClearRequestedId(conversation.id);
      return true;
    }
    if (command === "/compact") {
      setInput("");
      if (!ready) { addLocalMessage(t("Configura un proveedor y un modelo antes de compactar el contexto.", "Configure a provider and model before compacting the context.")); return true; }
      void compactConversation();
      return true;
    }
    if (["/test", "/build", "/check"].includes(command)) {
      setInput("");
      if (!codeMode) addLocalMessage(t("Cambia a NovaAI Code para ejecutar comandos del proyecto.", "Switch to NovaAI Code to run project commands."));
      else void requestDetectedCommand(command.slice(1) as DetectedCommand["kind"]);
      return true;
    }
    if (command === "/help") { addLocalMessage("Comandos disponibles:\n• /new — nueva conversación\n• /clear — limpiar este chat\n• /compact — resumir historial\n• /test — ejecutar pruebas\n• /build — compilar el proyecto\n• /check — comprobar el código\n• /help — ver esta ayuda"); setInput(""); return true; }
    if (command.startsWith("/")) { addLocalMessage(`No conozco “${command}”. Escribe /help para ver los comandos disponibles.`); setInput(""); return true; }
    return false;
  }

  async function requestDetectedCommand(kind: DetectedCommand["kind"]) {
    if (!conversation || !project || commandBusy) return;
    const command = detectedCommands.find((item) => item.kind === kind);
    if (!command) { addLocalMessage(`No encontré un comando de ${kind === "test" ? "pruebas" : kind === "build" ? "compilación" : "comprobación"} configurado en este proyecto.`); return; }
    const direct = conversation.approvalMode === "full";
    const task: AgentTask = { id: crypto.randomUUID(), state: direct ? (kind === "test" ? "testing" : "executing") : "awaiting_approval", startedAt: Date.now(), updatedAt: Date.now(), command: `${command.program} ${command.args.join(" ")}`, steps: [{ id: "detect", label: "Comando detectado", status: "completed" }, { id: "run", label: kind === "test" ? "Ejecutar pruebas" : kind === "build" ? "Compilar proyecto" : "Comprobar código", status: direct ? "in_progress" : "pending" }] };
    updateConversation((item) => ({ ...item, agentTask: task, updatedAt: Date.now() }));
    if (direct) await executeDetectedCommand(command); else setPendingCommand({ conversationId: conversation.id, command });
  }

  async function executeDetectedCommand(command: DetectedCommand, _approveTask = false) {
    if (!conversation || !project || commandBusy) return;
    const conversationId = conversation.id; const id = crypto.randomUUID(); agentRequestId.current = id; setPendingCommand(null); setCommandBusy(true); setDiagnostic(null);
    // “Aprobar para esta tarea” no cambia el permiso permanente de la conversación.
    const updateTask = (updater: (task: AgentTask) => AgentTask) => updateConversationById(conversationId, (item) => item.agentTask ? ({ ...item, agentTask: updater(item.agentTask), updatedAt: Date.now() }) : item);
    updateTask((task) => ({ ...task, state: command.kind === "test" ? "testing" : "executing", updatedAt: Date.now(), steps: task.steps.map((step) => step.id === "run" ? { ...step, status: "in_progress" } : step) }));
    const receive = (event: AgentCommandEvent) => {
      if (event.type === "output") updateTask((task) => ({ ...task, output: `${task.output || ""}${event.text}`.slice(-524288), updatedAt: Date.now() }));
      if (event.type === "finished") updateTask((task) => ({ ...task, state: event.exitCode === 0 ? "completed" : "failed", exitCode: event.exitCode, durationMs: event.durationMs, truncated: event.truncated, updatedAt: Date.now(), steps: task.steps.map((step) => step.id === "run" ? { ...step, status: event.exitCode === 0 ? "completed" : "failed" } : step) }));
      if (event.type === "cancelled") updateTask((task) => ({ ...task, state: "cancelled", updatedAt: Date.now() }));
      if (event.type === "error") { setDiagnostic({ code: event.code, title: event.title, explanation: event.explanation, cause: "La ejecución segura no pudo continuar.", action: event.action, technicalDetails: null, retryable: true }); updateTask((task) => ({ ...task, state: "failed", updatedAt: Date.now() })); }
    };
    try { await agent.runCommand({ requestId: id, root: project.path, cwd: "", program: command.program, args: command.args, timeoutSecs: 900 }, receive); }
    catch (cause) { setDiagnostic(asDiagnostic(cause)); updateTask((task) => ({ ...task, state: "failed", updatedAt: Date.now() })); }
    finally { agentRequestId.current = null; setCommandBusy(false); }
  }

  async function stopAgentCommand() { const id = agentRequestId.current; if (id) await agent.cancel(id); }

  function selectAvailableConversation(items: Conversation[], excludedId: string) {
    const available = sortConversations(items.filter((item) => item.id !== excludedId), false);
    if (available.length) { setActiveId(available[0].id); return items; }
    const created = createConversation(codeMode ? project?.path ?? null : null, mode);
    setActiveId(created.id);
    return [created, ...items];
  }

  function manageConversation(id: string, action: ConversationMenuAction, value?: string) {
    const target = conversations.find((item) => item.id === id);
    if (!target || target.projectPath?.toLocaleLowerCase() !== (project?.path ?? null)?.toLocaleLowerCase()) return;
    if ((action === "delete" || action === "clear") && isConversationBusy(target, generatingConversationId)) return;
    if (action === "pin") { setConversations((items) => pinConversation(items, id, !target.pinned)); return; }
    if (action === "rename" && value) { setConversations((items) => renameConversation(items, id, value)); return; }
    if (action === "archive") {
      setConversations((items) => {
        const archived = archiveConversation(items, id, true);
        return id === activeId ? selectAvailableConversation(archived, id) : archived;
      });
      return;
    }
    if (action === "restore") { setConversations((items) => archiveConversation(items, id, false)); return; }
    if (action === "duplicate") {
      const copy = duplicateConversation(target);
      setConversations((items) => [copy, ...items]); setActiveId(copy.id); return;
    }
    if (action === "markdown") { void navigator.clipboard.writeText(conversationMarkdown(target)); return; }
    if (action === "copy-id") { void navigator.clipboard.writeText(target.id); return; }
    if (action === "clear") {
      setConversations((items) => items.map((item) => item.id === id ? { ...item, messages: [], compactedContext: undefined, compactedAt: undefined, agentTask: undefined, lastError: false, updatedAt: Date.now() } : item));
      return;
    }
    if (action === "delete") {
      setConversations((items) => {
        const remaining = items.filter((item) => item.id !== id);
        return id === activeId ? selectAvailableConversation(remaining, id) : remaining;
      });
    }
  }

  function appendOperationResult(conversationId: string, messageId: string, actions: PreviewAction[]) {
    if (!actions.length) return;
    const descriptions = actions.map((action) => {
      if (action.type === "write") return `${action.isNew ? "He creado" : "He actualizado"} ${action.path}`;
      if (action.type === "mkdir") return `He creado la carpeta ${action.path}`;
      if (action.type === "rename") return `He renombrado ${action.path} como ${action.newPath}`;
      return `He eliminado ${action.path}`;
    });
    const result = descriptions.length === 1
      ? `Listo, ${descriptions[0].charAt(0).toLocaleLowerCase()}${descriptions[0].slice(1)}.`
      : `Listo, he aplicado ${descriptions.length} cambios:\n${descriptions.map((text) => `• ${text}`).join("\n")}`;
    const appliedChanges: AppliedChange[] = actions.map((action) => {
      const before = action.before ?? "";
      const after = action.type === "write" ? action.content ?? "" : "";
      const limit = 24_000;
      return { type: action.type, path: action.path, newPath: action.newPath, before: before.slice(0, limit), after: after.slice(0, limit), truncated: before.length > limit || after.length > limit };
    });
    updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === messageId ? { ...entry, content: result, reasoning: undefined, appliedChanges } : entry), updatedAt: Date.now() }));
  }

  async function preparePreview(actions: AiProjectAction[], owner?: { conversationId: string; messageId: string }) {
    if (!project || !actions.length) return;
    const values: PreviewAction[] = [];
    for (const action of actions.slice(0, 500)) {
      if (action.type === "write" || action.type === "delete") {
        try { const old = await projectFiles.read(actionRoot(action), action.path); values.push({ ...action, before: old.content, isNew: false }); }
        catch { values.push({ ...action, before: "", isNew: action.type === "write" }); }
      } else values.push(action);
    }
    previewOwner.current = owner ?? null;
    setPreview(values);
  }

  async function applyActions(actions: AiProjectAction[]) {
    if (!project || !actions.length) return { paths: [], actions: [] as PreviewAction[] };
    const described: PreviewAction[] = [];
    for (const action of actions) {
      if (action.type === "write" || action.type === "delete") {
        try { const old = await projectFiles.read(actionRoot(action), action.path); described.push({ ...action, before: old.content, isNew: false }); }
        catch { described.push({ ...action, before: "", isNew: action.type === "write" }); }
      } else described.push(action);
    }
    const groups = new Map<string, AiProjectAction[]>();
    for (const action of actions) {
      const root = actionRoot(action);
      groups.set(root, [...(groups.get(root) ?? []), { ...action, rootId: undefined }]);
    }
    const paths: string[] = [];
    for (const [root, group] of groups) {
      const changed = await projectFiles.applyAiActions(root, group);
      if (root === project.path) paths.push(...changed);
    }
    await onFilesChanged(paths);
    return { paths, actions: described };
  }

  async function handleProposedActions(actions: AiProjectAction[], mode: Conversation["approvalMode"], owner: { conversationId: string; messageId: string }) {
    if (!actions.length || !project) return;
    try {
      if (mode === "full") {
        setStatus("Aplicando operaciones con acceso completo…");
        const applied = await applyActions(actions);
        appendOperationResult(owner.conversationId, owner.messageId, applied.actions);
        const paths = applied.paths;
        setStatus(`${paths.length} operación${paths.length === 1 ? "" : "es"} aplicada${paths.length === 1 ? "" : "s"}`);
        return;
      }
      if (mode === "auto") {
        const automatic = actions.filter((item) => item.type === "write" || item.type === "mkdir");
        const sensitive = actions.filter((item) => item.type === "rename" || item.type === "delete");
        if (automatic.length) appendOperationResult(owner.conversationId, owner.messageId, (await applyActions(automatic)).actions);
        if (sensitive.length) await preparePreview(sensitive, owner);
        setStatus(sensitive.length ? "Hay operaciones destructivas pendientes de aprobación" : "Cambios aplicados automáticamente");
        return;
      }
      await preparePreview(actions, owner);
      setStatus("Operaciones listas para revisar");
    } catch (error) { setDiagnostic(asDiagnostic(errorMessage(error))); setStatus("No se pudieron aplicar las operaciones"); }
  }

  async function send(forcedPrompt?: string) {
    const prompt = forcedPrompt ?? input.trim();
    if ((!prompt && uploads.length === 0 && projectAttachments.length === 0) || !conversation) return;
    if (generating) {
      if (generatingConversationId !== conversation.id) addLocalMessage("Nova está terminando una respuesta en otra conversación. Este chat se mantiene separado; espera a que termine para enviar aquí.");
      return;
    }
    if (!forcedPrompt && runCommand(prompt)) return;
    if (!active || !ready) return;
    // La solicitud conserva una copia del proveedor y del proyecto al enviarse.
    // Cambiar de vista, conversación o modelo solo afecta a la siguiente solicitud.
    followMessages.current = true;
    setShowJumpToBottom(false);
    const requestConfig = { ...active };
    const requestProjectPath = project?.path ?? null;
    const requestCodeMode = conversation.assistantMode === "code";
    const requestAttachments = requestCodeMode ? [...projectAttachments] : [];
    const requestUploads = uploads.map(({ name, mimeType, kind, data }) => ({ name, mimeType, kind, data }));
    const base = editingMessageId ? conversation.messages.slice(0, conversation.messages.findIndex((item) => item.id === editingMessageId)) : conversation.messages;
    const uploadedMeta = uploads.map(({ data: _data, ...item }) => item);
    const requestHasImages = requestUploads.some((item) => item.kind === "image");
    const useWorkspace = requestCodeMode && !!project && !isSimpleGreeting(prompt);
    const userMessage = message("user", prompt, uploadedMeta, []);
    const assistantMessage = message("assistant", "");
    const conversationId = conversation.id;
    const actionExpected = requestCodeMode && useWorkspace && requestsProjectAction(prompt, base);
    const recentBase = requestHistory(base);
    const history = [...recentBase, userMessage];
    const nextMessages = [...history, assistantMessage];
    const title = conversation.messages.length === 0 && !conversation.customTitle ? (prompt.replace(/\s+/g, " ").slice(0, 46) || "Imagen adjunta") : conversation.title;
    updateConversationById(conversationId, (item) => ({ ...item, title, messages: nextMessages, lastError: false, updatedAt: Date.now() }));
    if (useWorkspace && project) {
      // References are informational and must not delay the provider request.
      void projectFiles.contextPreview(project.path, prompt).then((references) => {
        updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === userMessage.id ? { ...entry, contextReferences: references } : entry) }));
      }).catch(() => undefined);
    }
    setInput(""); setEditingMessageId(null); setDiagnostic(null); setPreview([]); setGeneratingConversationId(conversationId); setGenerating(true); setStatus(t("Preparando solicitud…", "Preparing request…")); setWaitMs(0); lastPrompt.current = prompt; assistantBuffer.current = "";
    const timer = window.setInterval(() => setWaitMs((value) => value + 100), 100);
    let interrupted = false;
    let actionStreamComplete = false;
    let streamedActions: AiProjectAction[] = [];
    let streamedActionPromise: Promise<void> | null = null;

    const applyCompletedActionStream = () => {
      if (!actionExpected || streamedActionPromise || !assistantBuffer.current.includes("</nova_actions>")) return;
      const actions = proposedActions(assistantBuffer.current);
      if (!actions.length) return;
      streamedActions = actions;
      actionStreamComplete = true;
      setStatus(conversation.approvalMode === "ask" ? t("Preparando cambios para revisar…", "Preparing changes for review…") : t("Creando archivos…", "Creating files…"));
      streamedActionPromise = handleProposedActions(actions, conversation.approvalMode, { conversationId, messageId: assistantMessage.id });
      // Keep receiving the stream. Nova must never cancel a response on its own
      // merely because it has received a valid operation block.
    };

    const receive = (event: import("../types").AiChatEvent) => {
      if (event.type === "status") { setStatus(event.message); setWaitMs(event.elapsedMs); }
      if (event.type === "reasoning") setStatus(t("Generando respuesta…", "Generating response…"));
      if (event.type === "delta") {
        assistantBuffer.current += event.text;
        if (!streamedActionPromise) updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, content: entry.content + event.text } : entry), updatedAt: Date.now() }));
        applyCompletedActionStream();
      }
      if (event.type === "done") { setStatus(`${t("Completado en", "Completed in")} ${(event.elapsedMs / 1000).toFixed(1)} s`); setWaitMs(event.elapsedMs); }
      if (event.type === "cancelled") {
        interrupted = true;
        if (actionStreamComplete) {
          setStatus(conversation.approvalMode === "ask" ? t("Operaciones listas para revisar", "Operations ready to review") : t("Aplicando cambios…", "Applying changes…"));
        } else if (requestId.current && userStoppedRequests.current.has(requestId.current)) {
          setStatus(t("Generación detenida", "Generation stopped"));
        } else {
          setStatus(t("La conexión se interrumpió", "The connection was interrupted"));
          setDiagnostic({ code: "CONNECTION_LOST", title: "La respuesta se interrumpió", explanation: "El proveedor cerró la generación sin que pulsaras Detener.", cause: "La conexión con el proveedor se perdió o terminó de forma inesperada.", action: "La pregunta se conserva. Pulsa Reintentar para continuar.", technicalDetails: null, retryable: true });
        }
      }
      if (event.type === "error") {
        interrupted = true;
        if (requestHasImages && event.diagnostic.code === "IMAGE_NOT_SUPPORTED") {
          const explanation = "No puedo ver esta imagen con el modelo seleccionado. Elige un modelo que admita visión y vuelve a enviarla.";
          assistantBuffer.current = explanation;
          updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, content: explanation } : entry), lastError: false, updatedAt: Date.now() }));
          setStatus("El modelo no admite imágenes");
          setDiagnostic(null);
        } else {
          setDiagnostic(event.diagnostic);
          updateConversationById(conversationId, (item) => ({ ...item, lastError: true, updatedAt: Date.now() }));
        }
      }
    };
    const runRequest = async (requestMessages: { role: "system" | "user" | "assistant"; content: string }[]) => {
      const id = crypto.randomUUID(); requestId.current = id;
      await ai.chat({
        requestId: id, projectPath: requestProjectPath, config: requestConfig,
        messages: requestMessages, attachments: requestAttachments,
        uploads: requestUploads,
        externalFolders: requestCodeMode ? conversation.externalFolders : [],
        // Capability stays enabled throughout NovaAI Code. actionExpected is
        // the separate safety gate for reviewing/applying this message's edits.
        workspaceAccess: useWorkspace, canEdit: requestCodeMode, codeMode: requestCodeMode,
      }, receive);
    };
    try {
      const requestHistory = [
        ...(conversation.compactedContext ? [{ role: "system" as const, content: `MEMORIA COMPACTADA DE ESTA CONVERSACIÓN:\n${conversation.compactedContext}` }] : []),
        ...history.map(({ role, content }) => ({ role, content })),
      ];
      await runRequest(requestHistory);
      if (requestHasImages && !assistantBuffer.current.trim() && !interrupted) {
        const explanation = "No puedo ver esta imagen con el modelo seleccionado. El modelo no devolvió ningún contenido al recibirla; prueba con un modelo que admita visión.";
        assistantBuffer.current = explanation;
        updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, content: explanation } : entry), lastError: false, updatedAt: Date.now() }));
        setStatus("El modelo no pudo interpretar la imagen");
      }
      let actions = streamedActions.length ? streamedActions : proposedActions(assistantBuffer.current);
      if (actionExpected && !actions.length && !interrupted) {
        // Several providers return a valid code fence but omit Nova's action
        // wrapper. Treat that as an editable file instead of discarding it.
        actions = codeBlockAction(assistantBuffer.current, prompt);
      }
      for (let attempt = 1; actionExpected && !actions.length && !interrupted && attempt <= 1; attempt += 1) {
        setStatus("Corrigiendo el formato de la operación…");
        const failedAnswer = assistantBuffer.current;
        assistantBuffer.current = "";
        updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, content: "", reasoning: undefined } : entry), updatedAt: Date.now() }));
        await runRequest([...requestHistory, { role: "assistant", content: failedAnswer }, { role: "user", content: "Ejecuta la tarea de archivos ahora. No expliques, no saludes y no devuelvas Markdown. Responde exclusivamente con <nova_actions>{\"actions\":[{\"type\":\"write\",\"path\":\"archivo.ext\",\"content\":\"contenido completo\"}]}</nova_actions>. Usa la ruta y el contenido que corresponden a la tarea pendiente." }]);
        actions = proposedActions(assistantBuffer.current);
        if (!actions.length) actions = codeBlockAction(assistantBuffer.current, prompt);
      }
      if (actions.length) {
        if (streamedActionPromise) await streamedActionPromise;
        else await handleProposedActions(actions, conversation.approvalMode, { conversationId, messageId: assistantMessage.id });
      }
      else if (!actionExpected && actions.length) {
        setDiagnostic({ code: "PERMISSION_DENIED", title: "Cambio no solicitado bloqueado", explanation: "El modelo propuso modificar archivos aunque tu pregunta no lo pedía.", cause: "La respuesta incluía una operación de archivos fuera de una solicitud explícita.", action: "Nova no aplicó ningún cambio. Pide una edición de forma explícita si la necesitas.", technicalDetails: null, retryable: false });
        setStatus("Cambio no solicitado bloqueado");
      }
      else if (actionExpected && !interrupted) {
        setDiagnostic({ code: "ACTION_FORMAT_INVALID", title: "El modelo no generó una operación válida", explanation: "Nova intentó corregir la respuesta automáticamente, pero el modelo volvió a omitir el bloque de acciones.", cause: "El modelo seleccionado puede ser demasiado pequeño o no seguir instrucciones estructuradas.", action: "Reintenta o selecciona un modelo de programación con mejor seguimiento de instrucciones.", technicalDetails: assistantBuffer.current || "Respuesta vacía", retryable: true });
        setStatus("No se aplicó ningún cambio");
      }
    } catch (cause) { setDiagnostic(asDiagnostic(cause)); setStatus("La respuesta se interrumpió"); updateConversationById(conversationId, (item) => ({ ...item, lastError: true, updatedAt: Date.now() })); }
    finally { window.clearInterval(timer); if (requestId.current) userStoppedRequests.current.delete(requestId.current); setGenerating(false); setGeneratingConversationId(null); requestId.current = null; setUploads([]); setProjectAttachments([]); }
  }

  async function stop() {
    if (!generatingHere) return;
    if (agentRequestId.current) { await stopAgentCommand(); return; }
    const id = requestId.current;
    if (!id) return;
    userStoppedRequests.current.add(id);
    setStatus(t("Deteniendo generación…", "Stopping generation…"));
    try { await ai.cancel(id); }
    catch (error) { userStoppedRequests.current.delete(id); setDiagnostic(asDiagnostic(errorMessage(error))); }
  }
  function toggleProjectAttachment(path: string) { setProjectAttachments((items) => items.includes(path) ? items.filter((item) => item !== path) : [...items, path]); }

  async function grantExternalFolder(access: ExternalFolderGrant["access"]) {
    try {
      const path = await chooseExternalFolder();
      if (!path) return;
      const name = path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
      updateConversation((item) => {
        const existing = item.externalFolders.find((folder) => folder.path.toLocaleLowerCase() === path.toLocaleLowerCase());
        const folder: ExternalFolderGrant = existing ? { ...existing, access } : { id: crypto.randomUUID(), path, name, access };
        return { ...item, externalFolders: [...item.externalFolders.filter((entry) => entry.id !== folder.id), folder], updatedAt: Date.now() };
      });
      setAttachmentOpen(false);
    } catch (cause) { setDiagnostic(asDiagnostic(errorMessage(cause))); }
  }

  function revokeExternalFolder(id: string) {
    updateConversation((item) => ({ ...item, externalFolders: item.externalFolders.filter((folder) => folder.id !== id), updatedAt: Date.now() }));
  }

  function actionRoot(action: AiProjectAction) {
    if (!project) throw new Error("No hay un proyecto abierto.");
    if (!action.rootId) return project.path;
    const folder = conversation?.externalFolders.find((entry) => entry.id === action.rootId);
    if (!folder) throw new Error("La carpeta adicional ya no tiene permiso.");
    if (folder.access !== "write") throw new Error(`La carpeta ${folder.name} solo tiene permiso de lectura.`);
    return folder.path;
  }

  async function uploadFiles() {
    try {
      const selected = await chooseChatFiles();
      if (!selected.length) return;
      for (const path of selected) {
        const loaded = await projectFiles.loadAttachment(path);
        setUploads((items) => items.some((item) => item.path === loaded.path) ? items : [...items, { ...loaded, id: crypto.randomUUID() }]);
      }
      // Tras adjuntar, el usuario debe volver directamente al mensaje, no cerrar el menú a mano.
      setAttachmentOpen(false);
    } catch (error) { setDiagnostic(asDiagnostic(errorMessage(error))); }
  }

  async function attachClipboardImage(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setDiagnostic({ code: "CONTEXT_TOO_LARGE", title: "La imagen es demasiado grande", explanation: "La imagen pegada supera el límite de 10 MB.", cause: "Las imágenes grandes pueden bloquear o ralentizar al modelo.", action: "Reduce el tamaño de la imagen e inténtalo de nuevo.", technicalDetails: null, retryable: false });
      return;
    }
    const mimeType = file.type || "image/png";
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(mimeType)) {
      setDiagnostic({ code: "INVALID_RESPONSE", title: "Formato de imagen no compatible", explanation: "NovaAI Code acepta PNG, JPG, WEBP y GIF en el chat.", cause: `El portapapeles proporcionó ${mimeType}.`, action: "Pega una imagen compatible o súbela como archivo.", technicalDetails: null, retryable: false });
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("No se pudo leer la imagen del portapapeles."));
        reader.onload = () => {
          const result = typeof reader.result === "string" ? reader.result : "";
          const base64 = result.split(",", 2)[1];
          base64 ? resolve(base64) : reject(new Error("La imagen del portapapeles no contiene datos válidos."));
        };
        reader.readAsDataURL(file);
      });
      const extension = mimeType.split("/")[1] === "jpeg" ? "jpg" : mimeType.split("/")[1];
      const id = crypto.randomUUID();
      setUploads((items) => [...items, { id, name: `Imagen pegada.${extension}`, path: `clipboard://${id}`, mimeType, kind: "image", data, size: file.size }]);
      setAttachmentOpen(false);
      setDiagnostic(null);
    } catch (error) { setDiagnostic(asDiagnostic(errorMessage(error))); }
  }

  function handlePaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const image = Array.from(event.clipboardData.items)
      .find((item) => item.kind === "file" && item.type.startsWith("image/"));
    const file = image?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void attachClipboardImage(file);
  }

  function editQuestion(item: ChatMessage) { setEditingMessageId(item.id); setInput(item.content); document.querySelector<HTMLTextAreaElement>(".chat-composer textarea")?.focus(); }

  async function applyPreview() {
    if (!project || !preview.length) return;
    setApplying(true);
    try {
      const applied = await applyActions(preview.map(({ before: _before, isNew: _isNew, ...action }) => action));
      if (previewOwner.current) appendOperationResult(previewOwner.current.conversationId, previewOwner.current.messageId, applied.actions);
      previewOwner.current = null;
      setPreview([]); setStatus(`${applied.paths.length} operación${applied.paths.length === 1 ? "" : "es"} aplicada${applied.paths.length === 1 ? "" : "s"}`);
    } catch (error) { setDiagnostic(asDiagnostic(errorMessage(error))); }
    finally { setApplying(false); }
  }

  return <section className="chat-layout">
    <ConversationSidebar mode={mode} interactive={activeWorkspace} open={sidebarOpen} projectName={project?.name ?? t("Sin proyecto", "No project")} projectPath={project?.path ?? null} projects={projects} conversations={conversations} activeId={activeId} generatingConversationId={generatingConversationId} persistenceError={persistenceError} onAddProject={onAddProject} onSelectProject={onSelectProject} onSelect={setActiveId} onNew={newConversation} onAction={manageConversation} isBusy={(item) => isConversationBusy(item, generatingConversationId)} />
    <section className="chat-pane">
      <header className="chat-header">
        <div className="chat-header__identity">
          {conversation && <div className={`assistant-mode-picker${modePickerOpen ? " is-open" : ""}`} ref={modePickerRef}>
            <button className="assistant-mode-trigger" type="button" onClick={() => setModePickerOpen((open) => !open)} disabled={modeSwitchDisabled} aria-haspopup="menu" aria-expanded={modePickerOpen} aria-label={t("Elegir modo del asistente", "Choose assistant mode")}>
              <span className={`assistant-mode-icon assistant-mode-icon--${codeMode ? "code" : "chat"}`}>{codeMode ? <Code2 size={15} /> : <Bot size={15} />}</span>
              <span><strong>{codeMode ? "NovaAI Code" : "NovaAI"}</strong><small>{codeMode ? t("Agente de código", "Coding agent") : t("Chat con IA", "AI chat")}</small></span>
              <ChevronDown size={14} />
            </button>
            {modePickerOpen && <div className="assistant-mode-menu" role="menu" aria-label={t("Elegir modo", "Choose mode")}>
              <header><strong>{t("Elige cómo quieres trabajar", "Choose how you want to work")}</strong><span>{t("Puedes usar un modo diferente en cada chat.", "You can use a different mode in each chat.")}</span></header>
              <button type="button" role="menuitemradio" aria-checked={!codeMode} className={!codeMode ? "is-selected" : ""} onClick={() => changeAssistantMode("chat")}>
                <span className="assistant-mode-card-icon assistant-mode-card-icon--chat"><Bot size={19} /></span>
                <span><strong>NovaAI</strong><small>{t("Pregunta, aprende y genera contenido sin modificar archivos.", "Ask, learn, and generate content without changing files.")}</small></span>
                {!codeMode && <Check size={16} />}
              </button>
              <button type="button" role="menuitemradio" aria-checked={codeMode} className={codeMode ? "is-selected" : ""} onClick={() => changeAssistantMode("code")} disabled={!project}>
                <span className="assistant-mode-card-icon assistant-mode-card-icon--code"><Code2 size={19} /></span>
                <span><strong>NovaAI Code</strong><small>{project ? t("Lee, crea y edita archivos dentro del proyecto abierto.", "Read, create, and edit files inside the open project.") : t("Abre un proyecto para activar el agente de código.", "Open a project to enable the coding agent.")}</small></span>
                {codeMode && <Check size={16} />}
              </button>
              <footer><ShieldCheck size={13} /><span>{codeMode ? t("Los cambios respetan tus permisos y muestran un diff.", "Changes follow your permissions and show a diff.") : t("NovaAI no recibe acceso automático al proyecto.", "NovaAI does not receive automatic project access.")}</span></footer>
            </div>}
          </div>}
          <div className="chat-provider"><span className={`provider-dot ${ready ? "is-ready" : ""}`} /><div><strong>{active ? providerMeta[active.provider].name : t("Sin proveedor", "No provider")}</strong><span>{active?.model || t("Configura un modelo", "Configure a model")}</span></div></div>
        </div>
        <div className="chat-header__actions">
          {codeMode && project && conversation && <label className={`approval-control approval-control--${conversation.approvalMode}`} title={t("Controla cuándo Nova necesita tu aprobación", "Controls when Nova needs your approval")}><ShieldCheck size={14} /><select value={conversation.approvalMode} onChange={(event) => updateConversation((item) => ({ ...item, approvalMode: event.target.value as Conversation["approvalMode"], updatedAt: Date.now() }))} aria-label={t("Permisos de la conversación", "Conversation permissions")}><option value="ask">{t("Solicitar aprobación", "Ask for approval")}</option><option value="auto">{t("Aprobar por mí", "Approve for me")}</option><option value="full">{t("Acceso completo", "Full access")}</option></select></label>}
          <div className="chat-connection">{ready ? <><Check size={13} />{t("Configurado", "Configured")}</> : <><AlertCircle size={13} />{t("Incompleto", "Incomplete")}</>}<button className="icon-button" onClick={onConfigure} title={t("Configurar proveedores", "Configure providers")}><Settings2 size={16} /></button></div>
        </div>
      </header>
      <div className="chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
        {!conversation?.messages.length && <div className={`chat-empty chat-empty--${mode}`}><div>{codeMode ? <Code2 size={20} /> : <Bot size={20} />}</div><h1>{codeMode ? t("¿Qué quieres construir?", "What do you want to build?") : t("¿En qué puedo ayudarte hoy?", "How can I help today?")}</h1><p>{codeMode ? (project ? t(`NovaAI Code puede trabajar en ${project.name}.`, `NovaAI Code can work in ${project.name}.`) : t("Abre una carpeta para trabajar con su código.", "Open a folder to work with its code.")) : t("Pregunta, analiza una imagen o desarrolla una idea.", "Ask a question, analyze an image, or develop an idea.")}</p>{!codeMode && <div className="chat-starters"><button onClick={() => setInput(t("Ayúdame a entender un tema", "Help me understand a topic"))}>{t("Aprender algo", "Learn something")}</button><button onClick={() => setInput(t("Analiza esta idea y ayúdame a mejorarla", "Analyze this idea and help me improve it"))}>{t("Desarrollar una idea", "Develop an idea")}</button><button onClick={() => setAttachmentOpen(true)}>{t("Analizar un archivo", "Analyze a file")}</button></div>}{!ready && <button className="primary-button" onClick={onConfigure}><Settings2 size={15} />{t("Configurar proveedor", "Configure provider")}</button>}</div>}
        {conversation?.messages.map((item, index) => <article key={item.id} className={`chat-message chat-message--${item.role}`}>
          <span>{item.role === "user" ? t("Tú", "You") : codeMode ? "NovaAI Code" : "NovaAI"}</span>
          <div className="message-body">
            <div>{item.role === "assistant" ? <AssistantMessageContent content={visibleAnswer(item.content)} /> : item.content}{!(item.role === "assistant" ? visibleAnswer(item.content) : item.content) && generatingHere && index === conversation.messages.length - 1 ? <span className="waiting-text" role="status" aria-live="polite"><LoaderCircle className="spin" size={14} />{status} {(waitMs / 1000).toFixed(1)} s</span> : null}</div>
            {!!item.uploads?.length && <div className="message-attachments">{item.uploads.map((file) => <span key={file.id}>{file.kind === "image" ? <Image size={12} /> : <FileCode2 size={12} />}{file.name}</span>)}</div>}
            {!!item.contextReferences?.length && <details className="message-context"><summary><FileCode2 size={12} />{item.contextReferences.length} {t("archivos usados como contexto", "files used as context")}</summary><div>{item.contextReferences.map((reference) => <button key={reference.path} type="button" title={reference.path}>{reference.path}:{reference.startLine}-{reference.endLine}{reference.truncated ? ` ${t("(truncado)", "(truncated)")}` : ""}</button>)}</div></details>}
            {!!item.appliedChanges?.length && <details className="message-final-diff"><summary><Check size={12} />{t("Ver diff final", "View final diff")} · {item.appliedChanges.length}</summary><div>{item.appliedChanges.map((change, changeIndex) => <article key={`${change.type}-${change.path}-${changeIndex}`}><strong>{change.path}{change.newPath ? ` → ${change.newPath}` : ""}</strong>{change.type === "write" ? <div className="final-diff-columns"><pre>{change.before || t("Archivo nuevo", "New file")}</pre><pre>{change.after}</pre></div> : <span>{change.type === "mkdir" ? t("Carpeta creada", "Folder created") : change.type === "rename" ? t("Elemento renombrado", "Item renamed") : t("Elemento eliminado", "Item deleted")}</span>}{change.truncated && <small>{t("Diff truncado para proteger el historial local", "Diff truncated to protect local history")}</small>}</article>)}</div></details>}
            {(item.role === "user" ? item.content : visibleAnswer(item.content)) && <div className="message-actions"><button onClick={() => navigator.clipboard.writeText(item.role === "assistant" ? visibleAnswer(item.content) : item.content)} title={t("Copiar", "Copy")}><Clipboard size={13} /></button>{item.role === "user" && !generatingHere && <button onClick={() => editQuestion(item)} title={t("Editar pregunta", "Edit question")}><Edit3 size={13} /></button>}</div>}
          </div>
        </article>)}
        {conversation?.agentTask && <AgentTaskCard task={conversation.agentTask} pending={pendingCommand?.conversationId === conversation.id ? pendingCommand.command : null} busy={commandBusy} onApprove={pendingCommand?.conversationId === conversation.id ? () => void executeDetectedCommand(pendingCommand.command) : undefined} onApproveTask={pendingCommand?.conversationId === conversation.id ? () => void executeDetectedCommand(pendingCommand.command, true) : undefined} onReject={() => { setPendingCommand(null); updateConversation((item) => item.agentTask ? { ...item, agentTask: { ...item.agentTask, state: "cancelled", updatedAt: Date.now() }, updatedAt: Date.now() } : item); }} onStop={() => void stopAgentCommand()} onResume={conversation.agentTask.state === "interrupted" ? () => { const latest = [...conversation.messages].reverse().find((item) => item.role === "user")?.content; if (latest) void send(latest); } : undefined} />}
        {diagnostic && <DiagnosticCard diagnostic={diagnostic} onRetry={() => void send(lastPrompt.current)} />}
      </div>
      {showJumpToBottom && <button type="button" className="jump-to-bottom" onClick={() => scrollToBottom()} title={t("Ir al final", "Jump to bottom")} aria-label={t("Ir al final del chat", "Jump to the bottom of the chat")}><ChevronDown size={17} /></button>}
      <div className="chat-composer-wrap">
        {editingMessageId && <div className="editing-banner"><Edit3 size={12} />{t("Editando pregunta", "Editing question")}<button onClick={() => { setEditingMessageId(null); setInput(""); }}><X size={12} /></button></div>}
        {codeMode && conversation?.externalFolders.length ? <div className="attached-files external-folder-grants">{conversation.externalFolders.map((folder) => <span key={folder.id} title={folder.path}><FolderPlus size={12} />{folder.name} · {folder.access === "write" ? t("editar", "edit") : t("lectura", "read")}<button onClick={() => revokeExternalFolder(folder.id)} aria-label={`${t("Quitar", "Remove")} ${folder.name}`}><X size={12} /></button></span>)}</div> : null}
        {(projectAttachments.length > 0 || uploads.length > 0) && <div className="attached-files">{projectAttachments.map((path) => <span key={path}><FileCode2 size={12} />{path}<button onClick={() => toggleProjectAttachment(path)}><X size={12} /></button></span>)}{uploads.map((file) => <span key={file.id} title={file.name}>{file.kind === "image" ? <img className="attached-files__image" src={`data:${file.mimeType};base64,${file.data}`} alt={t("Imagen adjunta", "Attached image")} /> : <FileCode2 size={12} />}{file.name}<button onClick={() => setUploads((items) => items.filter((item) => item.id !== file.id))} aria-label={`${t("Quitar", "Remove")} ${file.name}`}><X size={12} /></button></span>)}</div>}
        {attachmentOpen && <div className={`attachment-menu${codeMode && openFiles.length ? "" : " attachment-menu--compact"}`}><button className="attachment-menu__upload" onClick={() => void uploadFiles()}><Upload size={14} />{t("Subir archivo o imagen", "Upload file or image")}</button>{codeMode && project && <div className="external-folder-actions"><button type="button" onClick={() => void grantExternalFolder("read")}><FolderPlus size={14} />{t("Añadir carpeta de lectura", "Add read-only folder")}</button><button type="button" onClick={() => void grantExternalFolder("write")}><FolderPlus size={14} />{t("Añadir carpeta con edición", "Add editable folder")}</button></div>}{codeMode && openFiles.length > 0 && <div className="attachment-menu__files">{openFiles.map((file) => <label key={file.relativePath}><input type="checkbox" checked={projectAttachments.includes(file.relativePath)} onChange={() => toggleProjectAttachment(file.relativePath)} /><FileCode2 size={14} /><span>{file.relativePath}</span><small>{Math.ceil(file.content.length / 4).toLocaleString()} tokens</small></label>)}</div>}</div>}
        {!!commandSuggestions.length && <div className="slash-command-menu" role="listbox" aria-label={t("Comandos del chat", "Chat commands")}>{commandSuggestions.map((item) => <button type="button" key={item.command} onClick={() => { setInput(""); runCommand(item.command); }}><code>{item.command}</code><span><strong>{t(item.label[0], item.label[1])}</strong><small>{t(item.description[0], item.description[1])}</small></span></button>)}</div>}
        <div className="chat-composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={ready ? (codeMode ? t("Pide un cambio o pregunta sobre el proyecto…", "Ask for a change or about the project…") : t("Pregunta lo que quieras…", "Ask anything…")) : t("Selecciona un modelo para comenzar", "Select a model to begin")} disabled={!ready || generatingHere} rows={2} /><footer><div><button className="composer-button composer-button--attach" disabled={generatingHere} onClick={() => setAttachmentOpen((value) => !value)} aria-expanded={attachmentOpen} title={t("Adjuntar archivo o imagen", "Attach file or image")} aria-label={t("Adjuntar archivo o imagen", "Attach file or image")}><Plus size={16} /></button><span>{estimatedTokens.toLocaleString()} {t("tokens aprox.", "approx. tokens")}</span></div><div className="composer-actions">{codeMode && project && conversation && <label className={`approval-control approval-control--${conversation.approvalMode}`} title={t("Controla cuándo Nova necesita tu aprobación", "Controls when Nova needs your approval")}><ShieldCheck size={14} /><select value={conversation.approvalMode} onChange={(event) => updateConversation((item) => ({ ...item, approvalMode: event.target.value as Conversation["approvalMode"], updatedAt: Date.now() }))} aria-label={t("Permisos de la conversación", "Conversation permissions")}><option value="ask">{t("Solicitar aprobación", "Ask for approval")}</option><option value="auto">{t("Aprobar por mí", "Approve for me")}</option><option value="full">{t("Acceso completo", "Full access")}</option></select></label>}{settings && <ChatModelPicker projectPath={project?.path ?? null} settings={settings} disabled={generatingHere} onChange={onSettingsChange} onConfigure={onConfigure} />}{generatingHere ? <button className="stop-button" onClick={() => void stop()}><Square size={13} fill="currentColor" />{t("Detener", "Stop")}</button> : <button className="send-button" disabled={!ready || (!input.trim() && uploads.length === 0 && projectAttachments.length === 0)} onClick={() => void send()} aria-label={t("Enviar", "Send")}><Send size={16} /></button>}</div></footer></div>
      </div>
    </section>
    {!!preview.length && <div className="change-overlay" role="dialog" aria-modal="true" aria-label={t("Revisar operaciones", "Review operations")}><section className="change-review"><header><div><strong>{t("Revisar operaciones", "Review operations")}</strong><span>{t("Una sola aprobación para", "One approval for")} {preview.length}</span></div><button className="icon-button" onClick={() => setPreview([])} aria-label={t("Cerrar", "Close")}><X size={16} /></button></header><div className="change-list">{preview.map((action, index) => <article key={`${action.type}-${action.path}-${index}`}><h3>{action.path}<span>{action.type === "mkdir" ? t("Crear carpeta", "Create folder") : action.type === "rename" ? `${t("Renombrar", "Rename")} → ${action.newPath}` : action.type === "delete" ? t("Eliminar", "Delete") : action.isNew ? t("Crear archivo", "Create file") : t("Editar archivo", "Edit file")}</span></h3>{action.type === "write" ? <div className="diff-columns"><section><strong>{t("Antes", "Before")}</strong><pre>{action.isNew ? t("Archivo nuevo", "New file") : action.before}</pre></section><section><strong>{t("Después", "After")}</strong><pre>{action.content}</pre></section></div> : <div className={`operation-summary operation-summary--${action.type}`}>{action.type === "mkdir" ? t("Se creará esta carpeta dentro del proyecto.", "This folder will be created inside the project.") : action.type === "rename" ? `${t("Se moverá a", "It will be moved to")} ${action.newPath}.` : t("Se eliminará este elemento del proyecto.", "This project item will be deleted.")}</div>}</article>)}</div><footer><button className="secondary-button" onClick={() => setPreview([])} disabled={applying}>{t("Rechazar todo", "Reject all")}</button><button className="primary-button" onClick={() => void applyPreview()} disabled={applying}>{applying ? t("Aplicando…", "Applying…") : t("Aprobar todo", "Approve all")}</button></footer></section></div>}
    {clearRequestedId && conversations.find((item) => item.id === clearRequestedId) && <ConversationDialog kind="clear" conversation={conversations.find((item) => item.id === clearRequestedId)!} projectName={project?.name ?? t("Sin proyecto", "No project")} busy={isConversationBusy(conversations.find((item) => item.id === clearRequestedId)!, generatingConversationId)} onClose={() => setClearRequestedId(null)} onConfirm={() => { manageConversation(clearRequestedId, "clear"); setClearRequestedId(null); setInput(""); setDiagnostic(null); setPreview([]); }} />}
  </section>;
}
