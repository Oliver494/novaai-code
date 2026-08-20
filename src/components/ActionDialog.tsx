import { AlertTriangle, FilePlus2, FolderPlus, Pencil, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePreferences } from "../services/preferences";

export type DialogRequest = {
  kind: "new-file" | "new-folder" | "rename" | "delete";
  targetPath: string;
  targetName?: string;
  isDirectory?: boolean;
};

type Props = {
  request: DialogRequest;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

const details = {
  "new-file": { title: ["Crear archivo", "Create file"], label: ["Nombre del archivo", "File name"], action: ["Crear archivo", "Create file"], Icon: FilePlus2 },
  "new-folder": { title: ["Crear carpeta", "Create folder"], label: ["Nombre de la carpeta", "Folder name"], action: ["Crear carpeta", "Create folder"], Icon: FolderPlus },
  rename: { title: ["Renombrar", "Rename"], label: ["Nuevo nombre", "New name"], action: ["Renombrar", "Rename"], Icon: Pencil },
  delete: { title: ["Eliminar", "Delete"], label: ["", ""], action: ["Eliminar", "Delete"], Icon: AlertTriangle },
};

export function ActionDialog({ request, busy, error, onCancel, onConfirm }: Props) {
  const { t } = usePreferences();
  const [value, setValue] = useState(request.kind === "rename" ? request.targetName ?? "" : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const config = details[request.kind];

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (request.kind === "delete" || value.trim()) onConfirm(value.trim());
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <form className={`dialog-card ${request.kind === "delete" ? "dialog-card--danger" : ""}`} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-card__heading">
          <span className="dialog-card__icon"><config.Icon size={18} /></span>
          <div><h2 id="dialog-title">{t(config.title[0], config.title[1])}</h2><p title={request.targetPath}>{request.targetPath || t("Raíz del proyecto", "Project root")}</p></div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} title={t("Cerrar", "Close")} aria-label={t("Cerrar", "Close")}><X size={16} strokeWidth={1.8} /></button>
        </div>
        {request.kind === "delete" ? (
          <p className="dialog-warning">{t("Se eliminará", "This will delete")} <strong>{request.targetName}</strong>{request.isDirectory ? t(" y todo su contenido", " and all its contents") : ""}. {t("Esta acción no se puede deshacer.", "This action cannot be undone.")}</p>
        ) : (
          <label className="dialog-field">{t(config.label[0], config.label[1])}<input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} /></label>
        )}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>{t("Cancelar", "Cancel")}</button>
          <button className={request.kind === "delete" ? "danger-button" : "primary-button"} type="submit" disabled={busy || (request.kind !== "delete" && !value.trim())}>
            {busy ? t("Procesando…", "Processing…") : t(config.action[0], config.action[1])}
          </button>
        </div>
      </form>
    </div>
  );
}
