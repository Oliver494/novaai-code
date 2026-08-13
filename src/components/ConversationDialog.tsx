import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "../types";

type Props = {
  kind: "rename" | "delete" | "clear";
  conversation: Conversation;
  projectName: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (value?: string) => void;
};

export function ConversationDialog({ kind, conversation, projectName, busy = false, onClose, onConfirm }: Props) {
  const [title, setTitle] = useState(conversation.title);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  const destructive = kind !== "rename";
  const valid = kind !== "rename" || !!title.trim();
  const heading = kind === "rename" ? "Renombrar chat" : kind === "clear" ? "¿Limpiar los mensajes?" : "¿Seguro que quieres eliminar este chat?";
  const confirmLabel = kind === "rename" ? "Guardar nombre" : kind === "clear" ? "Limpiar mensajes" : "Eliminar chat";

  function confirm() {
    if (!valid || busy || submitting) return;
    setSubmitting(true);
    onConfirm(kind === "rename" ? title.trim().slice(0, 80) : undefined);
  }

  return <div className="conversation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="conversation-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-dialog-title">
      <header>
        <div className={destructive ? "is-danger" : ""}>{destructive && <AlertTriangle size={16} />}<strong id="conversation-dialog-title">{heading}</strong></div>
        <button className="icon-button" onClick={onClose} title="Cerrar" aria-label="Cerrar"><X size={15} /></button>
      </header>
      {kind === "rename" ? <div className="conversation-dialog__body">
        <label htmlFor="conversation-title">Nombre de la conversación</label>
        <input ref={inputRef} id="conversation-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirm(); }} />
        <small>{title.length}/80</small>
      </div> : <div className="conversation-dialog__body">
        <p className="conversation-dialog__name">{conversation.title}</p>
        <dl><div><dt>Proyecto</dt><dd>{projectName}</dd></div><div><dt>Historial</dt><dd>{kind === "delete" ? "Se eliminarán la conversación y todos sus mensajes." : "Se eliminarán los mensajes, pero conservarás el chat."}</dd></div></dl>
        {kind === "delete" && <p className="conversation-dialog__warning">Esta operación no se puede deshacer.</p>}
        {busy && <p className="conversation-dialog__busy">Esta conversación tiene una respuesta o tarea activa. Deténla antes de continuar.</p>}
      </div>}
      <footer><button className="secondary-button" onClick={onClose}>Cancelar</button><button className={destructive ? "danger-button" : "primary-button"} disabled={!valid || busy || submitting} onClick={confirm}>{confirmLabel}</button></footer>
    </section>
  </div>;
}
