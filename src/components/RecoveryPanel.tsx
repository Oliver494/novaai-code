import { History, RefreshCw, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, projectFiles } from "../services/fileSystem";
import { usePreferences } from "../services/preferences";
import type { RecoverySnapshotInfo } from "../types";

type Props = { projectPath: string | null; onRestored: (paths: string[]) => void };

export function RecoveryPanel({ projectPath, onRestored }: Props) {
  const { t } = usePreferences();
  const [items, setItems] = useState<RecoverySnapshotInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectPath) { setItems([]); return; }
    setLoading(true); setError(null);
    try { setItems(await projectFiles.recoverySnapshots(projectPath)); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setLoading(false); }
  }, [projectPath]);

  useEffect(() => { void load(); }, [load]);

  async function restore(item: RecoverySnapshotInfo) {
    if (!projectPath) return;
    const files = item.summary.slice(0, 8).join("\n");
    if (!window.confirm(`${t("Restaurar esta recuperación", "Restore this recovery")}?\n\n${files}`)) return;
    setLoading(true); setError(null);
    try {
      const paths = await projectFiles.restoreRecovery(projectPath, item.id);
      onRestored(paths);
      await load();
    } catch (reason) { setError(errorMessage(reason)); setLoading(false); }
  }

  if (!projectPath) return <div className="settings-empty"><History size={22} /><strong>{t("No hay un proyecto abierto", "No project is open")}</strong><span>{t("Abre un proyecto para ver sus recuperaciones.", "Open a project to view its recoveries.")}</span></div>;
  return <section className="recovery-panel">
    <div className="settings-toolbar"><span>{t("Copias creadas antes de cambios del agente", "Copies created before agent changes")}</span><button className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={15} />{t("Actualizar", "Refresh")}</button></div>
    {error && <div className="settings-inline-error">{error}</div>}
    {!loading && !items.length && <div className="settings-empty"><History size={22} /><strong>{t("Todavía no hay recuperaciones", "No recoveries yet")}</strong><span>{t("Nova creará una antes de modificar archivos.", "Nova will create one before changing files.")}</span></div>}
    <div className="recovery-list">{items.map((item) => <article key={item.id}><div><strong>{new Date(item.createdAt).toLocaleString()}</strong><span>{item.actionCount} {t("operaciones", "operations")}</span><small>{item.summary.slice(0, 3).join(" · ")}</small></div><button className="secondary-button" onClick={() => void restore(item)} disabled={loading}><RotateCcw size={15} />{t("Restaurar", "Restore")}</button></article>)}</div>
  </section>;
}
