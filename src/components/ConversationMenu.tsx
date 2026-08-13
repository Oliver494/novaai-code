import { Archive, Clipboard, Copy, FileText, MoreHorizontal, Pencil, Pin, PinOff, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { Conversation } from "../types";

export type ConversationMenuAction = "pin" | "rename" | "archive" | "restore" | "duplicate" | "markdown" | "copy-id" | "clear" | "delete";

type Props = { conversation: Conversation; open: boolean; onOpen: () => void; onClose: () => void; onAction: (action: ConversationMenuAction) => void };

export function ConversationMenu({ conversation, open, onOpen, onClose, onAction }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    window.setTimeout(() => menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus());
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open, onClose]);

  const action = (value: ConversationMenuAction) => { onAction(value); onClose(); };
  const rect = trigger.current?.getBoundingClientRect();
  const menuStyle = rect ? {
    position: "fixed" as const,
    left: Math.max(8, Math.min(window.innerWidth - 182, rect.right - 174)),
    top: rect.bottom + 294 < window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - 294),
  } : undefined;
  return <div className="conversation-menu-wrap" ref={root}>
    <button ref={trigger} className="conversation-more" onClick={(event) => { event.stopPropagation(); open ? onClose() : onOpen(); }} title="Más acciones" aria-label={`Acciones de ${conversation.title}`} aria-expanded={open}><MoreHorizontal size={15} /></button>
    {open && createPortal(<div ref={menu} className="conversation-menu conversation-menu--portal" style={menuStyle} role="menu" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => {
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === "ArrowDown") { event.preventDefault(); buttons[(index + 1) % buttons.length]?.focus(); }
      if (event.key === "ArrowUp") { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length]?.focus(); }
    }}>
      {!conversation.archived && <button role="menuitem" onClick={() => action("pin")}>{conversation.pinned ? <PinOff size={14} /> : <Pin size={14} />}{conversation.pinned ? "Desfijar" : "Fijar"}</button>}
      <button role="menuitem" onClick={() => action("rename")}><Pencil size={14} />Renombrar</button>
      <button role="menuitem" onClick={() => action(conversation.archived ? "restore" : "archive")}>{conversation.archived ? <RotateCcw size={14} /> : <Archive size={14} />}{conversation.archived ? "Restaurar" : "Archivar"}</button>
      <hr />
      <button role="menuitem" onClick={() => action("duplicate")}><Copy size={14} />Duplicar</button>
      <button role="menuitem" onClick={() => action("markdown")}><FileText size={14} />Copiar Markdown</button>
      <button role="menuitem" onClick={() => action("copy-id")}><Clipboard size={14} />Copiar identificador</button>
      <button role="menuitem" onClick={() => action("clear")}><RotateCcw size={14} />Limpiar mensajes</button>
      <hr />
      <button role="menuitem" className="is-danger" onClick={() => action("delete")}><Trash2 size={14} />Eliminar</button>
    </div>, document.body)}
  </div>;
}
