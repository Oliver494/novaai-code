import { ArrowUpRight, BellRing, Clock3, X } from "lucide-react";
import { usePreferences } from "../services/preferences";
import { useUpdates } from "../services/updates";

export function UpdateBanner() {
  const { t } = usePreferences();
  const updates = useUpdates();
  const release = updates.lastResult?.release;
  if (!updates.bannerVisible || !release) return null;
  const summary = release.notes.trim().split(/\r?\n/).find((line) => line.trim())?.replace(/^#+\s*/, "") ?? t("Incluye mejoras y correcciones.", "Includes improvements and fixes.");
  return <aside className="update-banner" aria-live="polite"><div className="update-banner__icon"><BellRing size={17} /></div><div className="update-banner__content"><strong>{t("Nueva versión disponible", "New version available")}</strong><span>{updates.installedVersion} → {release.version}</span><p>{summary}</p><div><button className="update-banner__primary" onClick={() => void updates.openRelease()}>{t("Ver actualización", "View update")}<ArrowUpRight size={13} /></button><button onClick={updates.remindLater}><Clock3 size={13} />{t("Recordar más tarde", "Remind me later")}</button></div></div><button className="update-banner__close" onClick={updates.closeBanner} aria-label={t("Cerrar", "Close")}><X size={14} /></button></aside>;
}
