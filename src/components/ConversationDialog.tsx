import { AlertTriangle, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Conversation } from "../types";
import { usePreferences } from "../services/preferences";

type Props = {
  kind: "rename" | "delete" | "clear";
  conversation: Conversation;
  projectName: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (value?: string) => void;
};

export function ConversationDialog({ kind, conversation, projectName, busy = false, onClose, onConfirm }: Props) {
  const { t } = usePreferences();
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
  const heading = kind === "rename" ? t("Renombrar chat", "Rename chat") : kind === "clear" ? t("¿Limpiar los mensajes?", "Clear messages?") : t("¿Seguro que quieres eliminar este chat?", "Are you sure you want to delete this chat?");
  const confirmLabel = kind === "rename" ? t("Guardar nombre", "Save name") : kind === "clear" ? t("Limpiar mensajes", "Clear messages") : t("Eliminar chat", "Delete chat");

  function confirm() {
    if (!valid || busy || submitting) return;
    setSubmitting(true);
    onConfirm(kind === "rename" ? title.trim().slice(0, 80) : undefined);
  }

  return <div className="conversation-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="conversation-dialog" role="dialog" aria-modal="true" aria-labelledby="conversation-dialog-title">
      <header>
        <div className={destructive ? "is-danger" : ""}>{destructive && <AlertTriangle size={16} />}<strong id="conversation-dialog-title">{heading}</strong></div>
        <button className="icon-button" onClick={onClose} title={t("Cerrar", "Close")} aria-label={t("Cerrar", "Close")}><X size={15} /></button>
      </header>
      {kind === "rename" ? <div className="conversation-dialog__body">
        <label htmlFor="conversation-title">{t("Nombre de la conversación", "Conversation name")}</label>
        <input ref={inputRef} id="conversation-title" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") confirm(); }} />
        <small>{title.length}/80</small>
      </div> : <div className="conversation-dialog__body">
        <p className="conversation-dialog__name">{conversation.title}</p>
        <dl><div><dt>{t("Proyecto", "Project")}</dt><dd>{projectName}</dd></div><div><dt>{t("Historial", "History")}</dt><dd>{kind === "delete" ? t("Se eliminarán la conversación y todos sus mensajes.", "The conversation and all its messages will be deleted.") : t("Se eliminarán los mensajes, pero conservarás el chat.", "The messages will be deleted, but the chat will remain.")}</dd></div></dl>
        {kind === "delete" && <p className="conversation-dialog__warning">{t("Esta operación no se puede deshacer.", "This operation cannot be undone.")}</p>}
        {busy && <p className="conversation-dialog__busy">{t("Esta conversación tiene una respuesta o tarea activa. Deténla antes de continuar.", "This conversation has an active response or task. Stop it before continuing.")}</p>}
      </div>}
      <footer><button className="secondary-button" onClick={onClose}>{t("Cancelar", "Cancel")}</button><button className={destructive ? "danger-button" : "primary-button"} disabled={!valid || busy || submitting} onClick={confirm}>{confirmLabel}</button></footer>
    </section>
  </div>;
}
