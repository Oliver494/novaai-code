import { AlertTriangle, FilePlus2, FolderPlus, Pencil, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

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
  "new-file": { title: "Crear archivo", label: "Nombre del archivo", action: "Crear archivo", Icon: FilePlus2 },
  "new-folder": { title: "Crear carpeta", label: "Nombre de la carpeta", action: "Crear carpeta", Icon: FolderPlus },
  rename: { title: "Renombrar", label: "Nuevo nombre", action: "Renombrar", Icon: Pencil },
  delete: { title: "Eliminar", label: "", action: "Eliminar", Icon: AlertTriangle },
};

export function ActionDialog({ request, busy, error, onCancel, onConfirm }: Props) {
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
          <div><h2 id="dialog-title">{config.title}</h2><p title={request.targetPath}>{request.targetPath || "Raíz del proyecto"}</p></div>
          <button className="icon-button" type="button" onClick={onCancel} disabled={busy} title="Cerrar" aria-label="Cerrar"><X size={16} strokeWidth={1.8} /></button>
        </div>
        {request.kind === "delete" ? (
          <p className="dialog-warning">Se eliminará <strong>{request.targetName}</strong>{request.isDirectory ? " y todo su contenido" : ""}. Esta acción no se puede deshacer.</p>
        ) : (
          <label className="dialog-field">{config.label}<input ref={inputRef} value={value} onChange={(event) => setValue(event.target.value)} disabled={busy} /></label>
        )}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={request.kind === "delete" ? "danger-button" : "primary-button"} type="submit" disabled={busy || (request.kind !== "delete" && !value.trim())}>
            {busy ? "Procesando…" : config.action}
          </button>
        </div>
      </form>
    </div>
  );
}
