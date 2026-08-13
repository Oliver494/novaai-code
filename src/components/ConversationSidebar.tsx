import { AlertCircle, Archive, FolderClosed, LoaderCircle, MessageSquarePlus, Pin, Plus, Search, ShieldQuestion, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { conversationMatches, sortConversations } from "../services/conversationActions";
import type { Conversation } from "../types";
import { ConversationDialog } from "./ConversationDialog";
import { ConversationMenu, type ConversationMenuAction } from "./ConversationMenu";

type Props = {
  open: boolean;
  projectName: string;
  projectPath: string | null;
  conversations: Conversation[];
  activeId: string;
  generatingConversationId: string | null;
  persistenceError?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onAction: (id: string, action: ConversationMenuAction, value?: string) => void;
  isBusy: (conversation: Conversation) => boolean;
};

type DialogState = { kind: "rename" | "delete" | "clear"; conversation: Conversation } | null;

export function ConversationSidebar({ open, projectName, projectPath, conversations, activeId, generatingConversationId, persistenceError, onSelect, onNew, onAction, isBusy }: Props) {
  const [archivedView, setArchivedView] = useState(false);
  const [query, setQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setArchivedView(false); setQuery(""); setMenuId(null); setDialog(null); }, [projectPath]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
      if (event.ctrlKey && event.key.toLocaleLowerCase() === "n") { event.preventDefault(); setArchivedView(false); onNew(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [onNew]);

  const visible = useMemo(() => sortConversations(conversations.filter((item) => conversationMatches(item, query)), archivedView), [conversations, archivedView, query]);
  const pinned = archivedView ? [] : visible.filter((item) => item.pinned);
  const regular = archivedView ? visible : visible.filter((item) => !item.pinned);

  function requestAction(conversation: Conversation, action: ConversationMenuAction) {
    if (action === "rename" || action === "delete" || action === "clear") setDialog({ kind: action, conversation });
    else { if (action === "duplicate") setArchivedView(false); onAction(conversation.id, action); }
  }

  const renderRow = (item: Conversation) => <div key={item.id} className={`conversation-row ${item.id === activeId ? "is-active" : ""}`} onContextMenu={(event) => { event.preventDefault(); setMenuId(item.id); }}>
    <button className="conversation-row__select" onClick={() => onSelect(item.id)} onKeyDown={(event) => {
      if (event.key === "F2") { event.preventDefault(); setDialog({ kind: "rename", conversation: item }); }
      if (event.key === "Delete") { event.preventDefault(); setDialog({ kind: "delete", conversation: item }); }
    }}>
      <span>{item.title}</span>
      <small className="conversation-statuses">
        {item.pinned && <i title="Fijado"><Pin size={10} /><span className="sr-only">Fijado</span></i>}
        {generatingConversationId === item.id && <i title="Respuesta en curso"><LoaderCircle className="spin" size={10} /><span className="sr-only">Respuesta en curso</span></i>}
        {item.agentTask?.state === "awaiting_approval" && <i title="Pendiente de aprobación"><ShieldQuestion size={10} /><span className="sr-only">Pendiente de aprobación</span></i>}
        {(item.lastError || item.agentTask?.state === "failed") && <i className="is-error" title="Terminó con error"><AlertCircle size={10} /><span className="sr-only">Terminó con error</span></i>}
        {item.archived && <i title="Archivado"><Archive size={10} /><span className="sr-only">Archivado</span></i>}
      </small>
    </button>
    <ConversationMenu conversation={item} open={menuId === item.id} onOpen={() => setMenuId(item.id)} onClose={() => setMenuId(null)} onAction={(action) => requestAction(item, action)} />
  </div>;

  return <aside className={`thread-sidebar ${open ? "" : "thread-sidebar--closed"}`}>
    <header><strong>{archivedView ? "Archivados" : "Chats"}</strong><div><button onClick={() => setArchivedView((value) => !value)} title={archivedView ? "Volver a chats" : "Ver archivados"} aria-label={archivedView ? "Volver a chats" : "Ver archivados"}>{archivedView ? <MessageSquarePlus size={15} /> : <Archive size={14} />}</button><button onClick={() => { setArchivedView(false); onNew(); }} title="Nueva conversación (Ctrl+N)" aria-label="Nueva conversación"><Plus size={15} /></button></div></header>
    <div className="thread-project" title={projectPath ?? "Sin carpeta asignada"}><FolderClosed size={15} strokeWidth={1.8} /><strong>{projectName}</strong></div>
    <div className="conversation-search"><Search size={13} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar chats" aria-label="Buscar conversaciones" />{query && <button onClick={() => setQuery("")} title="Limpiar búsqueda" aria-label="Limpiar búsqueda"><X size={12} /></button>}</div>
    <div className="thread-list">
      {!!pinned.length && <section className="conversation-section"><h2>Fijados</h2>{pinned.map(renderRow)}</section>}
      {!!regular.length && <section className="conversation-section"><h2>{archivedView ? "Archivados" : pinned.length ? "Recientes" : "Conversaciones"}</h2>{regular.map(renderRow)}</section>}
      {!visible.length && <div className="conversation-empty"><Search size={16} /><span>{query ? "No hay resultados" : archivedView ? "No hay chats archivados" : "No hay conversaciones"}</span></div>}
    </div>
    {persistenceError && <div className="conversation-persistence-error" role="alert"><AlertCircle size={13} /><span>{persistenceError}</span></div>}
    {dialog && <ConversationDialog kind={dialog.kind} conversation={dialog.conversation} projectName={projectName} busy={isBusy(dialog.conversation)} onClose={() => setDialog(null)} onConfirm={(value) => { onAction(dialog.conversation.id, dialog.kind, value); setDialog(null); }} />}
  </aside>;
}
