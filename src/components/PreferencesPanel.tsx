import { Check, Languages, Monitor, Moon, Search, Sun, X } from "lucide-react";
import { useMemo, useState } from "react";
import { usePreferences, type AppLanguage, type LanguagePreference, type ThemePreference } from "../services/preferences";

type Props = { onClose: () => void; onOpenProviders: () => void };

export function PreferencesPanel({ onClose, onOpenProviders }: Props) {
  const { theme, language, resolvedLanguage, setTheme, setLanguage, t } = usePreferences();
  const [query, setQuery] = useState("");
  const themes: { id: ThemePreference; label: string; description: string; icon: typeof Monitor }[] = [
    { id: "system", label: t("Sistema", "System"), description: t("Sigue Windows", "Follows Windows"), icon: Monitor },
    { id: "light", label: t("Claro", "Light"), description: t("Interfaz luminosa", "Light interface"), icon: Sun },
    { id: "dark", label: t("Oscuro", "Dark"), description: t("Cómodo con poca luz", "Comfortable in low light"), icon: Moon },
  ];
  const languageNames: Record<AppLanguage, [string, string]> = { es: ["Español", "Spanish"], en: ["English", "Inglés"], fr: ["Français", "French"], de: ["Deutsch", "German"], pt: ["Português", "Portuguese"], it: ["Italiano", "Italian"], zh: ["中文", "Chinese"], ja: ["日本語", "Japanese"], ko: ["한국어", "Korean"], ru: ["Русский", "Russian"], ar: ["العربية", "Arabic"], hi: ["हिन्दी", "Hindi"] };
  const languages: { id: LanguagePreference; name: string; nativeName: string; detail: string }[] = [
    { id: "auto", name: t("Automático", "Automatic"), nativeName: t("Idioma de Windows", "Windows language"), detail: languageNames[resolvedLanguage][0] },
    ...(Object.entries(languageNames) as [AppLanguage, [string, string]][]).map(([id, names]) => ({ id, name: names[0], nativeName: names[1], detail: names[0] })),
  ];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return languages.filter((item) => !normalized || `${item.name} ${item.nativeName} ${item.detail}`.toLocaleLowerCase().includes(normalized));
  }, [languages, query]);

  return <div className="preferences-overlay" role="dialog" aria-modal="true" aria-label={t("Configuración", "Settings")}>
    <section className="preferences-panel">
      <header><div><strong>{t("Configuración", "Settings")}</strong><span>{t("Apariencia e idioma", "Appearance and language")}</span></div><button className="icon-button" onClick={onClose} aria-label={t("Cerrar", "Close")}><X size={17} /></button></header>
      <div className="preferences-content">
        <section className="preference-section"><div className="preference-heading"><Sun size={15} /><div><strong>{t("Apariencia", "Appearance")}</strong><span>{t("Elige cómo se muestra NovaAI Code", "Choose how NovaAI Code looks")}</span></div></div><div className="theme-options">{themes.map((item) => { const Icon = item.icon; return <button type="button" key={item.id} className={theme === item.id ? "is-active" : ""} onClick={() => setTheme(item.id)}><Icon size={17} /><span><strong>{item.label}</strong><small>{item.description}</small></span>{theme === item.id && <Check size={14} />}</button>; })}</div></section>
        <section className="preference-section"><div className="preference-heading"><Languages size={15} /><div><strong>{t("Idioma", "Language")}</strong><span>{t("Automático usa el idioma de Windows", "Automatic uses the Windows language")}</span></div></div><div className="language-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Buscar idioma…", "Search languages…")} autoFocus={false} /></div><div className="language-list">{filtered.map((item) => <button type="button" key={item.id} className={language === item.id ? "is-active" : ""} onClick={() => setLanguage(item.id)}><span className="language-symbol">{item.id === "auto" ? <Monitor size={15} /> : item.id.toUpperCase()}</span><span><strong>{item.name}</strong><small>{item.nativeName}{item.id === "auto" ? ` · ${item.detail}` : ""}</small></span>{language === item.id && <Check size={14} />}</button>)}{!filtered.length && <p>{t("No encontramos ese idioma.", "No languages found.")}</p>}</div></section>
      </div>
      <footer><button type="button" className="secondary-button" onClick={onOpenProviders}>{t("Configurar proveedores", "Configure providers")}</button><button type="button" className="primary-button" onClick={onClose}>{t("Listo", "Done")}</button></footer>
    </section>
  </div>;
}
