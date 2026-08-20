import { GitBranch, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { localSystem, type GitStatus } from "../services/localSystem";
import { usePreferences } from "../services/preferences";

type Props = { projectPath: string | null };

export function GitPanel({ projectPath }: Props) {
  const { t } = usePreferences();
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [diff, setDiff] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");

  async function load() {
    if (!projectPath) return;
    setLoading(true);
    try {
      const next = await localSystem.gitStatus(projectPath);
      setStatus(next);
      setDiff(next.repository ? await localSystem.gitDiff(projectPath) : "");
    } finally {
      setLoading(false);
    }
  }

  async function commit() {
    if (!projectPath || !status?.changes.length || !message.trim()) return;
    const confirmed = window.confirm(
      `${t("Crear commit con todos los cambios", "Commit all changes")}?\n\n${message.trim()}\n\n${status.changes.slice(0, 12).join("\n")}`,
    );
    if (!confirmed) return;
    setLoading(true);
    setResult("");
    try {
      setResult(await localSystem.gitCommit(projectPath, message.trim()));
      setMessage("");
      await load();
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    }
  }

  async function discard() {
    if (!projectPath || !status?.changes.length) return;
    const visibleChanges = status.changes.slice(0, 20).join("\n");
    const remaining = Math.max(0, status.changes.length - 20);
    const confirmed = window.confirm(
      `${t("Descartar todos estos cambios", "Discard all these changes")}?\n\n${visibleChanges}${remaining ? `\n... +${remaining}` : ""}\n\n${t("Nova creará primero una copia de recuperación local.", "Nova will create a local recovery copy first.")}`,
    );
    if (!confirmed) return;
    setLoading(true);
    setResult("");
    try {
      const discarded = await localSystem.gitDiscardChanges(projectPath);
      setResult(
        discarded.length
          ? t(
              `Se descartaron ${discarded.length} rutas. Puedes recuperarlas desde Recuperación.`,
              `${discarded.length} paths discarded. You can restore them from Recovery.`,
            )
          : t("No había cambios que descartar.", "There were no changes to discard."),
      );
      await load();
    } catch (reason) {
      setResult(reason instanceof Error ? reason.message : String(reason));
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [projectPath]);

  if (!projectPath) {
    return (
      <div className="settings-empty">
        <GitBranch size={22} />
        <strong>{t("No hay un proyecto abierto", "No project is open")}</strong>
        <span>{t("Abre un proyecto para comprobar Git.", "Open a project to inspect Git.")}</span>
      </div>
    );
  }

  return (
    <section className="git-panel">
      <div className="settings-toolbar">
        <span>{t("Estado, diff, commits y restauración local", "Local status, diff, commits, and restoration")}</span>
        <button className="secondary-button" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? "spin" : ""} size={15} />
          {t("Actualizar", "Refresh")}
        </button>
      </div>
      {status && !status.repository ? (
        <div className="settings-empty">
          <GitBranch size={22} />
          <strong>{status.installed ? t("No es un repositorio Git", "Not a Git repository") : t("Git no está instalado", "Git is not installed")}</strong>
          <span>{status.diagnostic}</span>
        </div>
      ) : status ? (
        <>
          <div className="git-summary">
            <span><GitBranch size={15} />{status.branch ?? t("Rama desconocida", "Unknown branch")}</span>
            <strong>{status.changes.length} {t("cambios", "changes")}</strong>
          </div>
          <div className="git-change-list">
            {status.changes.length
              ? status.changes.map((item, index) => <code key={`${item}-${index}`}>{item}</code>)
              : <span>{t("El proyecto no tiene cambios pendientes", "The project has no pending changes")}</span>}
          </div>
          {diff && <details className="git-diff"><summary>{t("Ver diff de Git", "View Git diff")}</summary><pre>{diff}</pre></details>}
          {status.changes.length > 0 && (
            <div className="git-actions">
              <div className="git-commit">
                <input
                  value={message}
                  maxLength={120}
                  onChange={(event) => setMessage(event.target.value.replace(/[\r\n]/g, " "))}
                  placeholder={t("Mensaje del commit", "Commit message")}
                />
                <button className="primary-button" disabled={loading || !message.trim()} onClick={() => void commit()}>
                  {t("Crear commit", "Create commit")}
                </button>
              </div>
              <button className="danger-button git-discard-button" disabled={loading} onClick={() => void discard()}>
                <RotateCcw size={15} />
                {t("Descartar cambios", "Discard changes")}
              </button>
            </div>
          )}
          {result && <p className="settings-note" role="status">{result}</p>}
        </>
      ) : null}
    </section>
  );
}
