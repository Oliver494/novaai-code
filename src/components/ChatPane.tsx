import {
  AlertCircle, Check, ChevronDown, Clipboard, Edit3, FileCode2, ShieldCheck,
  Image, LoaderCircle, MessageSquarePlus, Plus, Send, Settings2, Square,
  Upload, X,
} from "lucide-react";
import { type ClipboardEvent as ReactClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { ai, asDiagnostic, providerMeta } from "../services/ai";
import { agent } from "../services/agent";
import { createConversation, loadConversations, saveConversations } from "../services/conversations";
import { archiveConversation, conversationMarkdown, duplicateConversation, isConversationBusy, pinConversation, renameConversation, sortConversations } from "../services/conversationActions";
import { chooseChatFiles, errorMessage, projectFiles } from "../services/fileSystem";
import { usePreferences } from "../services/preferences";
import type { AgentCommandEvent, AgentTask, AiProjectAction, AiSettings, ChatMessage, ChatUpload, Conversation, DetectedCommand, Diagnostic, OpenFile, ProjectInfo } from "../types";
import { AgentTaskCard } from "./AgentTaskCard";
import { AssistantMessageContent } from "./AssistantMessageContent";
import { DiagnosticCard } from "./DiagnosticCard";
import { ChatModelPicker } from "./ChatModelPicker";
import { ConversationSidebar } from "./ConversationSidebar";
import type { ConversationMenuAction } from "./ConversationMenu";
import { ConversationDialog } from "./ConversationDialog";

type PreviewAction = AiProjectAction & { before?: string; isNew?: boolean };
type Props = {
  project: ProjectInfo | null;
  openFiles: OpenFile[];
  settings: AiSettings | null;
  sidebarOpen: boolean;
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
  if (!match) return [];
  return validActions(match[1].trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
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

function requestsProjectAction(prompt: string, history: ChatMessage[]) {
  const current = prompt.toLocaleLowerCase();
  const directAction = /\b(crea|crear|créalo|crealo|crearla|haz|hazlo|edita|editar|modifica|modificar|implementa|implementar|añade|agrega|elimina|eliminar|borra|borrar|renombra|renombrar|mueve|mover|arregla|arreglar|arréglalo|arreglalo|corrige|corregir)\b/u;
  // Una ruta externa no puede convertirse en una operación, aunque el modelo lo proponga.
  if (/(?:\b[a-z]:[\\/]|\\\\)/i.test(prompt)) return false;
  if (directAction.test(current)) return true;
  // Preguntar si Nova puede ver o leer una carpeta nunca es permiso para modificarla.
  if (/\b(puedes?|puede|puedo|ver|leer|muestra|mostrar|explora|explorar|qué hay|que hay|tienes acceso)\b/u.test(current)) return false;
  // Only short continuation messages inherit the previous task. Ordinary new
  // questions must never become file operations just because an older message
  // mentioned HTML, CSS, or a file.
  if (!/^(sí|si|hazlo|continúa|continua|sigue|adelante|ok|vale)[!.\s]*$/u.test(current.trim())) return false;
  const previousUserMessage = [...history].reverse().find((item) => item.role === "user")?.content ?? "";
  return directAction.test(previousUserMessage.toLocaleLowerCase());
}

function requestHistory(messages: ChatMessage[]) {
  // NVIDIA and several cloud models have different context limits. Keeping the
  // latest turns preserves the active task without repeatedly sending a whole
  // long chat (or old generated files) on every request.
  return messages.slice(-6).map((item) => ({
    ...item,
    content: (item.role === "assistant" ? visibleAnswer(item.content) : item.content).slice(-24_000),
  }));
}

function message(role: ChatMessage["role"], content: string, uploads?: ChatMessage["uploads"]): ChatMessage {
  return { id: crypto.randomUUID(), role, content, createdAt: Date.now(), uploads };
}

const SLASH_COMMANDS = [
  { command: "/new", label: "Nueva conversación", description: "Abre un chat nuevo" },
  { command: "/clear", label: "Limpiar chat", description: "Borra los mensajes de este chat" },
  { command: "/compact", label: "Compactar contexto", description: "Resume el historial para usar menos contexto" },
  { command: "/test", label: "Ejecutar pruebas", description: "Detecta y ejecuta las pruebas del proyecto" },
  { command: "/build", label: "Compilar proyecto", description: "Detecta y ejecuta la compilación" },
  { command: "/check", label: "Comprobar proyecto", description: "Ejecuta lint o comprobación de tipos" },
  { command: "/help", label: "Ver comandos", description: "Muestra la ayuda rápida" },
];

export function ChatPane({ project, openFiles, settings, sidebarOpen, onConfigure, onSettingsChange, onFilesChanged }: Props) {
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
  const active = settings?.providers.find((item) => item.provider === settings.activeProvider) ?? null;
  const ready = !!active?.model && (!providerMeta[active.provider].requiresKey || active.apiKeyConfigured);
  const conversation = conversations.find((item) => item.id === activeId) ?? conversations[0];
  const generatingHere = generating && generatingConversationId === conversation?.id;
  const commandSuggestions = input.trimStart().startsWith("/") ? SLASH_COMMANDS.filter((item) => item.command.startsWith(input.trimStart().toLocaleLowerCase())) : [];
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
    const loaded = loadConversations(project?.path ?? null);
    const initial = (loaded.length ? loaded : [createConversation(project?.path ?? null)]).map((item) => ({
      ...item,
      // Nunca mostramos ni conservamos razonamientos internos de respuestas anteriores.
      messages: item.messages.map(({ reasoning: _reasoning, ...entry }) => entry),
    }));
    skipPersistence.current = true;
    setConversations(initial);
    setActiveId(initial[0].id);
    setInput(""); setUploads([]); setProjectAttachments([]); setPreview([]); setDiagnostic(null);
    setGeneratingConversationId(null);
  }, [project?.path]);

  useEffect(() => {
    // El estado visual de una petición pertenece únicamente al chat que la inició.
    setInput(""); setUploads([]); setProjectAttachments([]); setAttachmentOpen(false); setPreview([]); setDiagnostic(null);
  }, [activeId]);

  useEffect(() => {
    if (!project) { setDetectedCommands([]); return; }
    agent.detectCommands(project.path).then(setDetectedCommands).catch(() => setDetectedCommands([]));
  }, [project?.path]);

  useEffect(() => {
    if (skipPersistence.current) { skipPersistence.current = false; return; }
    if (conversations.length) {
      const result = saveConversations(project?.path ?? null, conversations);
      setPersistenceError(result.ok ? "" : "No se pudieron guardar los chats. El almacenamiento local está lleno o no está disponible.");
    }
  }, [conversations, project?.path]);

  const estimatedTokens = useMemo(() => Math.ceil((input.length + projectAttachments.reduce((sum, path) => sum + (openFiles.find((file) => file.relativePath === path)?.content.length ?? 0), 0) + uploads.filter((item) => item.kind === "text").reduce((sum, item) => sum + item.data.length, 0)) / 4), [input, openFiles, projectAttachments, uploads]);

  function updateConversation(updater: (current: Conversation) => Conversation) {
    updateConversationById(activeId, updater);
  }

  function updateConversationById(id: string, updater: (current: Conversation) => Conversation) {
    setConversations((items) => items.map((item) => item.id === id ? updater(item) : item));
  }

  function newConversation() {
    const created = createConversation(project?.path ?? null);
    setConversations((items) => [created, ...items]); setActiveId(created.id); setInput(""); setPreview([]); setDiagnostic(null);
  }

  function addLocalMessage(content: string) {
    if (!conversation) return;
    updateConversationById(conversation.id, (item) => ({ ...item, messages: [...item.messages, message("assistant", content)], updatedAt: Date.now() }));
  }

  async function compactConversation() {
    if (!conversation || !active || !ready || generating) return;
    if (conversation.messages.length < 2) { addLocalMessage("No hay suficiente conversación para compactar todavía."); return; }
    const transcript = conversation.messages.slice(-40).map((item) => `${item.role === "user" ? "Usuario" : "Nova"}:\n${visibleAnswer(item.content)}`).join("\n\n").slice(-120_000);
    let summary = "";
    setGeneratingConversationId(conversation.id); setGenerating(true); setDiagnostic(null); setStatus("Compactando el contexto…"); setWaitMs(0);
    const timer = window.setInterval(() => setWaitMs((value) => value + 100), 100);
    try {
      const id = crypto.randomUUID(); requestId.current = id;
      await ai.chat({
        requestId: id, projectPath: null, config: active,
        messages: [
          { role: "system", content: "Resume la conversación para que otro asistente pueda continuar el trabajo. Conserva decisiones, archivos, cambios realizados, errores, tareas pendientes y preferencias. Sé conciso, técnico y responde solo con el resumen." },
          { role: "user", content: transcript },
        ], attachments: [], uploads: [], workspaceAccess: false, canEdit: false,
      }, (event) => {
        if (event.type === "status") { setStatus(event.message); setWaitMs(event.elapsedMs); }
        if (event.type === "delta") summary += event.text;
        if (event.type === "done") { setStatus("Contexto compactado"); setWaitMs(event.elapsedMs); }
        if (event.type === "error") setDiagnostic(event.diagnostic);
      });
      if (summary.trim()) {
        updateConversationById(conversation.id, (item) => ({ ...item, compactedContext: summary.trim(), compactedAt: Date.now(), updatedAt: Date.now() }));
        addLocalMessage("Contexto compactado. Nova conservará los puntos importantes y enviará menos historial en los próximos mensajes.");
      } else if (!diagnostic) {
        setDiagnostic({ code: "COMPACTION_FAILED", title: "No se pudo compactar el contexto", explanation: "El modelo no devolvió un resumen.", cause: "La respuesta llegó vacía o se interrumpió.", action: "Vuelve a intentarlo más tarde.", technicalDetails: null, retryable: true });
      }
    } catch (cause) { setDiagnostic(asDiagnostic(cause)); setStatus("No se pudo compactar el contexto"); }
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
      if (!ready) { addLocalMessage("Configura un proveedor y un modelo antes de compactar el contexto."); return true; }
      void compactConversation();
      return true;
    }
    if (["/test", "/build", "/check"].includes(command)) { setInput(""); void requestDetectedCommand(command.slice(1) as DetectedCommand["kind"]); return true; }
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
    const created = createConversation(project?.path ?? null);
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
    updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === messageId ? { ...entry, content: result, reasoning: undefined } : entry), updatedAt: Date.now() }));
  }

  async function preparePreview(actions: AiProjectAction[], owner?: { conversationId: string; messageId: string }) {
    if (!project || !actions.length) return;
    const values: PreviewAction[] = [];
    for (const action of actions.slice(0, 30)) {
      if (action.type === "write" || action.type === "delete") {
        try { const old = await projectFiles.read(project.path, action.path); values.push({ ...action, before: old.content, isNew: false }); }
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
      if (action.type === "write") {
        try { await projectFiles.read(project.path, action.path); described.push({ ...action, isNew: false }); }
        catch { described.push({ ...action, isNew: true }); }
      } else described.push(action);
    }
    const paths = await projectFiles.applyAiActions(project.path, actions);
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
    const requestAttachments = [...projectAttachments];
    const requestUploads = uploads.map(({ name, mimeType, kind, data }) => ({ name, mimeType, kind, data }));
    const base = editingMessageId ? conversation.messages.slice(0, conversation.messages.findIndex((item) => item.id === editingMessageId)) : conversation.messages;
    const uploadedMeta = uploads.map(({ data: _data, ...item }) => item);
    const requestHasImages = requestUploads.some((item) => item.kind === "image");
    const userMessage = message("user", prompt, uploadedMeta);
    const assistantMessage = message("assistant", "");
    const conversationId = conversation.id;
    const useWorkspace = !!project && !isSimpleGreeting(prompt);
    const actionExpected = useWorkspace && requestsProjectAction(prompt, base);
    const recentBase = requestHistory(base);
    const history = [...recentBase, userMessage];
    const nextMessages = [...history, assistantMessage];
    const title = conversation.messages.length === 0 && !conversation.customTitle ? (prompt.replace(/\s+/g, " ").slice(0, 46) || "Imagen adjunta") : conversation.title;
    updateConversationById(conversationId, (item) => ({ ...item, title, messages: nextMessages, lastError: false, updatedAt: Date.now() }));
    setInput(""); setEditingMessageId(null); setDiagnostic(null); setPreview([]); setGeneratingConversationId(conversationId); setGenerating(true); setStatus("Preparando solicitud…"); setWaitMs(0); lastPrompt.current = prompt; assistantBuffer.current = "";
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
      setStatus(conversation.approvalMode === "ask" ? "Preparando cambios para revisar…" : "Creando archivos…");
      streamedActionPromise = handleProposedActions(actions, conversation.approvalMode, { conversationId, messageId: assistantMessage.id });
      // The complete operation is already available. Stop any trailing explanation
      // so the user does not wait for duplicate tokens before the file is created.
      const activeRequestId = requestId.current;
      if (activeRequestId) void ai.cancel(activeRequestId).catch(() => undefined);
    };

    const receive = (event: import("../types").AiChatEvent) => {
      if (event.type === "status") { setStatus(event.message); setWaitMs(event.elapsedMs); }
      if (event.type === "reasoning") setStatus("Generando respuesta…");
      if (event.type === "delta") {
        assistantBuffer.current += event.text;
        if (!streamedActionPromise) updateConversationById(conversationId, (item) => ({ ...item, messages: item.messages.map((entry) => entry.id === assistantMessage.id ? { ...entry, content: entry.content + event.text } : entry), updatedAt: Date.now() }));
        applyCompletedActionStream();
      }
      if (event.type === "done") { setStatus(`Completado en ${(event.elapsedMs / 1000).toFixed(1)} s`); setWaitMs(event.elapsedMs); }
      if (event.type === "cancelled") {
        interrupted = true;
        if (actionStreamComplete) {
          setStatus(conversation.approvalMode === "ask" ? "Operaciones listas para revisar" : "Aplicando cambios…");
        } else if (requestId.current && userStoppedRequests.current.has(requestId.current)) {
          setStatus("Generación detenida");
        } else {
          setStatus("La conexión se interrumpió");
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
        workspaceAccess: useWorkspace, canEdit: actionExpected,
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
      if (actionExpected && actions.length) {
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
    setStatus("Deteniendo generación…");
    try { await ai.cancel(id); }
    catch (error) { userStoppedRequests.current.delete(id); setDiagnostic(asDiagnostic(errorMessage(error))); }
  }
  function toggleProjectAttachment(path: string) { setProjectAttachments((items) => items.includes(path) ? items.filter((item) => item !== path) : [...items, path]); }

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
    <ConversationSidebar open={sidebarOpen} projectName={project?.name ?? "Sin proyecto"} projectPath={project?.path ?? null} conversations={conversations} activeId={activeId} generatingConversationId={generatingConversationId} persistenceError={persistenceError} onSelect={setActiveId} onNew={newConversation} onAction={manageConversation} isBusy={(item) => isConversationBusy(item, generatingConversationId)} />
    <section className="chat-pane">
      <header className="chat-header">
        <div className="chat-provider"><span className={`provider-dot ${ready ? "is-ready" : ""}`} /><div><strong>{active ? providerMeta[active.provider].name : "Sin proveedor"}</strong><span>{active?.model || "Configura un modelo"}</span></div></div>
        <div className="chat-header__actions">
          {project && conversation && <label className={`approval-control approval-control--${conversation.approvalMode}`} title={t("Controla cuándo Nova necesita tu aprobación", "Controls when Nova needs your approval")}><ShieldCheck size={14} /><select value={conversation.approvalMode} onChange={(event) => updateConversation((item) => ({ ...item, approvalMode: event.target.value as Conversation["approvalMode"], updatedAt: Date.now() }))} aria-label={t("Permisos de la conversación", "Conversation permissions")}><option value="ask">{t("Solicitar aprobación", "Ask for approval")}</option><option value="auto">{t("Aprobar por mí", "Approve for me")}</option><option value="full">{t("Acceso completo", "Full access")}</option></select></label>}
          <div className="chat-connection">{ready ? <><Check size={13} />{t("Configurado", "Configured")}</> : <><AlertCircle size={13} />{t("Incompleto", "Incomplete")}</>}<button className="icon-button" onClick={onConfigure} title={t("Configurar proveedores", "Configure providers")}><Settings2 size={16} /></button></div>
        </div>
      </header>
      <div className="chat-messages" ref={messagesRef} onScroll={handleMessagesScroll}>
        {!conversation?.messages.length && <div className="chat-empty"><div><MessageSquarePlus size={20} /></div><h1>{t("¿Qué quieres construir?", "What do you want to build?")}</h1><p>{project ? t(`Nova tiene acceso a ${project.name}.`, `Nova has access to ${project.name}.`) : t("Abre una carpeta para trabajar con su código.", "Open a folder to work with its code.")}</p>{!ready && <button className="primary-button" onClick={onConfigure}><Settings2 size={15} />{t("Configurar proveedor", "Configure provider")}</button>}</div>}
        {conversation?.messages.map((item, index) => <article key={item.id} className={`chat-message chat-message--${item.role}`}>
          <span>{item.role === "user" ? "Tú" : "Nova"}</span>
          <div className="message-body">
            <div>{item.role === "assistant" ? <AssistantMessageContent content={visibleAnswer(item.content)} /> : item.content}{!(item.role === "assistant" ? visibleAnswer(item.content) : item.content) && generatingHere && index === conversation.messages.length - 1 ? <span className="waiting-text"><LoaderCircle className="spin" size={14} />{status} {(waitMs / 1000).toFixed(1)} s</span> : null}</div>
            {!!item.uploads?.length && <div className="message-attachments">{item.uploads.map((file) => <span key={file.id}>{file.kind === "image" ? <Image size={12} /> : <FileCode2 size={12} />}{file.name}</span>)}</div>}
            {(item.role === "user" ? item.content : visibleAnswer(item.content)) && <div className="message-actions"><button onClick={() => navigator.clipboard.writeText(item.role === "assistant" ? visibleAnswer(item.content) : item.content)} title={t("Copiar", "Copy")}><Clipboard size={13} /></button>{item.role === "user" && !generatingHere && <button onClick={() => editQuestion(item)} title={t("Editar pregunta", "Edit question")}><Edit3 size={13} /></button>}</div>}
          </div>
        </article>)}
        {conversation?.agentTask && <AgentTaskCard task={conversation.agentTask} pending={pendingCommand?.conversationId === conversation.id ? pendingCommand.command : null} busy={commandBusy} onApprove={pendingCommand?.conversationId === conversation.id ? () => void executeDetectedCommand(pendingCommand.command) : undefined} onApproveTask={pendingCommand?.conversationId === conversation.id ? () => void executeDetectedCommand(pendingCommand.command, true) : undefined} onReject={() => { setPendingCommand(null); updateConversation((item) => item.agentTask ? { ...item, agentTask: { ...item.agentTask, state: "cancelled", updatedAt: Date.now() }, updatedAt: Date.now() } : item); }} onStop={() => void stopAgentCommand()} />}
        {diagnostic && <DiagnosticCard diagnostic={diagnostic} onRetry={() => void send(lastPrompt.current)} />}
      </div>
      {showJumpToBottom && <button type="button" className="jump-to-bottom" onClick={() => scrollToBottom()} title={t("Ir al final", "Jump to bottom")} aria-label={t("Ir al final del chat", "Jump to the bottom of the chat")}><ChevronDown size={17} /></button>}
      <div className="chat-composer-wrap">
        {editingMessageId && <div className="editing-banner"><Edit3 size={12} />{t("Editando pregunta", "Editing question")}<button onClick={() => { setEditingMessageId(null); setInput(""); }}><X size={12} /></button></div>}
        {(projectAttachments.length > 0 || uploads.length > 0) && <div className="attached-files">{projectAttachments.map((path) => <span key={path}><FileCode2 size={12} />{path}<button onClick={() => toggleProjectAttachment(path)}><X size={12} /></button></span>)}{uploads.map((file) => <span key={file.id} title={file.name}>{file.kind === "image" ? <img className="attached-files__image" src={`data:${file.mimeType};base64,${file.data}`} alt="Imagen adjunta" /> : <FileCode2 size={12} />}{file.name}<button onClick={() => setUploads((items) => items.filter((item) => item.id !== file.id))} aria-label={`Quitar ${file.name}`}><X size={12} /></button></span>)}</div>}
        {attachmentOpen && <div className={`attachment-menu${openFiles.length ? "" : " attachment-menu--compact"}`}><button className="attachment-menu__upload" onClick={() => void uploadFiles()}><Upload size={14} />{t("Subir archivo o imagen", "Upload file or image")}</button>{openFiles.length > 0 && <div className="attachment-menu__files">{openFiles.map((file) => <label key={file.relativePath}><input type="checkbox" checked={projectAttachments.includes(file.relativePath)} onChange={() => toggleProjectAttachment(file.relativePath)} /><FileCode2 size={14} /><span>{file.relativePath}</span><small>{Math.ceil(file.content.length / 4).toLocaleString()} tokens</small></label>)}</div>}</div>}
        {!!commandSuggestions.length && <div className="slash-command-menu" role="listbox" aria-label="Comandos del chat">{commandSuggestions.map((item) => <button type="button" key={item.command} onClick={() => { setInput(""); runCommand(item.command); }}><code>{item.command}</code><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>}
        <div className="chat-composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} onPaste={handlePaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={ready ? t("Pide un cambio o pregunta sobre el proyecto…", "Ask for a change or about the project…") : t("Selecciona un modelo para comenzar", "Select a model to begin")} disabled={!ready || generatingHere} rows={2} /><footer><div><button className="composer-button composer-button--attach" disabled={generatingHere} onClick={() => setAttachmentOpen((value) => !value)} aria-expanded={attachmentOpen} title={t("Adjuntar archivo o imagen", "Attach file or image")} aria-label={t("Adjuntar archivo o imagen", "Attach file or image")}><Plus size={16} /></button><span>{estimatedTokens.toLocaleString()} {t("tokens aprox.", "approx. tokens")}</span></div><div className="composer-actions">{project && conversation && <label className={`approval-control approval-control--${conversation.approvalMode}`} title={t("Controla cuándo Nova necesita tu aprobación", "Controls when Nova needs your approval")}><ShieldCheck size={14} /><select value={conversation.approvalMode} onChange={(event) => updateConversation((item) => ({ ...item, approvalMode: event.target.value as Conversation["approvalMode"], updatedAt: Date.now() }))} aria-label={t("Permisos de la conversación", "Conversation permissions")}><option value="ask">{t("Solicitar aprobación", "Ask for approval")}</option><option value="auto">{t("Aprobar por mí", "Approve for me")}</option><option value="full">{t("Acceso completo", "Full access")}</option></select></label>}{settings && <ChatModelPicker projectPath={project?.path ?? null} settings={settings} disabled={generatingHere} onChange={onSettingsChange} onConfigure={onConfigure} />}{generatingHere ? <button className="stop-button" onClick={() => void stop()}><Square size={13} fill="currentColor" />{t("Detener", "Stop")}</button> : <button className="send-button" disabled={!ready || (!input.trim() && uploads.length === 0 && projectAttachments.length === 0)} onClick={() => void send()} aria-label={t("Enviar", "Send")}><Send size={16} /></button>}</div></footer></div>
      </div>
    </section>
    {!!preview.length && <div className="change-overlay" role="dialog" aria-modal="true" aria-label="Revisar operaciones"><section className="change-review"><header><div><strong>Revisar operaciones</strong><span>Una sola aprobación para {preview.length}</span></div><button className="icon-button" onClick={() => setPreview([])}><X size={16} /></button></header><div className="change-list">{preview.map((action, index) => <article key={`${action.type}-${action.path}-${index}`}><h3>{action.path}<span>{action.type === "mkdir" ? "Crear carpeta" : action.type === "rename" ? `Renombrar → ${action.newPath}` : action.type === "delete" ? "Eliminar" : action.isNew ? "Crear archivo" : "Editar archivo"}</span></h3>{action.type === "write" ? <div className="diff-columns"><section><strong>Antes</strong><pre>{action.isNew ? "Archivo nuevo" : action.before}</pre></section><section><strong>Después</strong><pre>{action.content}</pre></section></div> : <div className={`operation-summary operation-summary--${action.type}`}>{action.type === "mkdir" ? "Se creará esta carpeta dentro del proyecto." : action.type === "rename" ? `Se moverá a ${action.newPath}.` : "Se eliminará este elemento del proyecto."}</div>}</article>)}</div><footer><button className="secondary-button" onClick={() => setPreview([])} disabled={applying}>Rechazar todo</button><button className="primary-button" onClick={() => void applyPreview()} disabled={applying}>{applying ? "Aplicando…" : "Aprobar todo"}</button></footer></section></div>}
    {clearRequestedId && conversations.find((item) => item.id === clearRequestedId) && <ConversationDialog kind="clear" conversation={conversations.find((item) => item.id === clearRequestedId)!} projectName={project?.name ?? "Sin proyecto"} busy={isConversationBusy(conversations.find((item) => item.id === clearRequestedId)!, generatingConversationId)} onClose={() => setClearRequestedId(null)} onConfirm={() => { manageConversation(clearRequestedId, "clear"); setClearRequestedId(null); setInput(""); setDiagnostic(null); setPreview([]); }} />}
  </section>;
}
