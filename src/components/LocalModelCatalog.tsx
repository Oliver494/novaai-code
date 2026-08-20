import { Check, Download, HardDrive, LoaderCircle, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ai, asDiagnostic, providerMeta } from "../services/ai";
import type { Diagnostic, LocalModelCatalogItem, ProviderConfig, ProviderId } from "../types";
import { usePreferences } from "../services/preferences";

type Props = { provider: Extract<ProviderId, "ollama" | "lm_studio">; config: ProviderConfig; onClose: () => void; onInstalled: () => void };

export function LocalModelCatalog({ provider, config, onClose, onInstalled }: Props) {
  const { t } = usePreferences();
  const [items, setItems] = useState<LocalModelCatalogItem[]>([]);
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState("Todos");
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("Cargando catálogo local…");
  const [error, setError] = useState<Diagnostic | null>(null);
  useEffect(() => { ai.localCatalog().then(setItems).catch((cause) => setError(asDiagnostic(cause))); }, []);
  const families = useMemo(() => ["Todos", ...Array.from(new Set(items.map((item) => item.family)))], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const search = `${item.name} ${item.family} ${item.description}`.toLocaleLowerCase();
    return (family === "Todos" || item.family === family) && search.includes(query.toLocaleLowerCase());
  }), [items, family, query]);
  async function download(item: LocalModelCatalogItem) {
    setDownloading(item.id); setProgress(0); setError(null); setStatus(`Preparando ${item.name}…`);
    try {
      await ai.downloadLocalModel(config, item.id, (event) => {
        if (event.type === "status") { setStatus(event.message); setProgress(event.progress); }
        else if (event.type === "error") setError(event.diagnostic);
      });
      setStatus(`${item.name} está listo para usar.`); setProgress(100); onInstalled();
    } catch (cause) { setError(asDiagnostic(cause)); } finally { setDownloading(null); }
  }
  const source = providerMeta[provider].name;
  return <div className="local-model-overlay" role="dialog" aria-modal="true" aria-label={t("Biblioteca de modelos locales", "Local model library")}>
    <section className="local-model-catalog">
      <header className="local-model-catalog__header"><div className="local-model-catalog__title"><span className="local-model-catalog__glyph"><HardDrive size={18} /></span><div><strong>{t("Modelos locales", "Local models")}</strong><span>{t("Descarga desde", "Download from")} {source}; {t("NovaAI no guarda modelos.", "NovaAI does not store models.")}</span></div></div><button className="icon-button" onClick={onClose} aria-label={t("Cerrar biblioteca", "Close library")}><X size={18} /></button></header>
      <div className="local-model-catalog__tools"><label className="local-model-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Buscar Qwen, código, ligero…", "Search Qwen, code, lightweight…")} autoFocus /></label><div className="local-model-filters" aria-label={t("Familias de modelos", "Model families")}>{families.map((item) => <button key={item} className={family === item ? "is-active" : ""} onClick={() => setFamily(item)}>{item === "Todos" ? t("Todos", "All") : item}</button>)}</div></div>
      {downloading && <div className="local-download-status"><div><LoaderCircle className="spin" size={16} /><span>{status}</span></div>{progress !== null && <><div className="local-download-status__track"><i style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong></>}</div>}
      {error && <div className="local-model-error"><strong>{error.title}</strong><span>{error.explanation}</span><small>{error.action}</small></div>}
      <div className="local-model-grid">{filtered.map((item) => <article className="local-model-card" key={item.id}><div className="local-model-card__top"><span>{item.family}</span>{item.recommended && <em><Sparkles size={12} />{t("Recomendado", "Recommended")}</em>}</div><h3>{item.name}</h3><p>{item.description}</p><div className="local-model-card__facts"><span>{item.parameters}</span><span>{item.size}</span></div><button className="secondary-button" disabled={Boolean(downloading)} onClick={() => void download(item)}>{downloading === item.id ? <LoaderCircle className="spin" size={15} /> : <Download size={15} />}{downloading === item.id ? t("Descargando", "Downloading") : `${t("Descargar en", "Download with")} ${source}`}</button></article>)}{!filtered.length && <div className="local-model-empty">{t("No hay resultados para esta búsqueda.", "No results for this search.")}</div>}</div>
      <footer className="local-model-catalog__footer"><span><Check size={14} />{t("Las descargas se guardan y gestionan por", "Downloads are stored and managed by")} {source}.</span><button className="secondary-button" onClick={onClose}>{t("Listo", "Done")}</button></footer>
    </section>
  </div>;
}
