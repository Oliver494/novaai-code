import type { Conversation } from "../types";

const PREFIX = "novaai-code:conversations:v1:";

function scope(projectPath: string | null) {
  return encodeURIComponent((projectPath || "global").toLowerCase());
}

function sameProject(left: string | null | undefined, right: string | null) {
  return (left || null)?.toLowerCase() === (right || null)?.toLowerCase();
}

export type ConversationSaveResult = { ok: true } | { ok: false; message: string };

export function migrateConversation(item: Partial<Conversation>, projectPath: string | null): Conversation | null {
  if (!item || !Array.isArray(item.messages) || !sameProject(item.projectPath, projectPath)) return null;
  const now = Date.now();
  return {
    id: item.id || crypto.randomUUID(),
    title: item.title?.trim() || "Nueva conversación",
    customTitle: item.customTitle ?? false,
    projectPath,
    pinned: item.pinned ?? false,
    pinnedOrder: typeof item.pinnedOrder === "number" ? item.pinnedOrder : null,
    archived: item.archived ?? false,
    archivedAt: typeof item.archivedAt === "number" ? item.archivedAt : null,
    lastError: item.lastError ?? false,
    approvalMode: item.approvalMode || "ask",
    agentTask: item.agentTask && ["analyzing", "planning", "awaiting_approval", "executing", "testing", "correcting"].includes(item.agentTask.state)
      ? { ...item.agentTask, state: "interrupted" as const }
      : item.agentTask,
    compactedContext: item.compactedContext,
    compactedAt: item.compactedAt,
    messages: item.messages,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || now,
  };
}

export function loadConversations(projectPath: string | null): Conversation[] {
  try {
    const value = JSON.parse(localStorage.getItem(`${PREFIX}${scope(projectPath)}`) || "[]") as Partial<Conversation>[];
    return value.map((item) => migrateConversation(item, projectPath)).filter((item): item is Conversation => !!item);
  } catch {
    return [];
  }
}

export function saveConversations(projectPath: string | null, conversations: Conversation[]): ConversationSaveResult {
  try {
    const isolated = conversations.filter((item) => sameProject(item.projectPath, projectPath)).slice(0, 100);
    localStorage.setItem(`${PREFIX}${scope(projectPath)}`, JSON.stringify(isolated));
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "El almacenamiento local no está disponible." };
  }
}

export function createConversation(projectPath: string | null): Conversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: "Nueva conversación",
    customTitle: false,
    projectPath,
    pinned: false,
    pinnedOrder: null,
    archived: false,
    archivedAt: null,
    lastError: false,
    approvalMode: "ask",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}
