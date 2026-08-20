import { Check, ChevronDown, KeyRound, LoaderCircle, RefreshCw, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ai, asDiagnostic, providerMeta } from "../services/ai";
import { supportsReasoningEffort } from "../services/reasoningEffort";
import { usePreferences } from "../services/preferences";
import type { AiSettings, ModelInfo, ProviderId, ReasoningEffort } from "../types";
import { ProviderLogo } from "./ProviderLogo";

type Props = {
  projectPath: string | null;
  settings: AiSettings;
  disabled?: boolean;
  onChange: (settings: AiSettings) => void;
  onConfigure: () => void;
};

const providerOrder: ProviderId[] = ["ollama", "lm_studio", "open_ai", "anthropic", "gemini", "nvidia", "zai", "kimi", "custom"];
const effortOptions: ReasoningEffort[] = ["low", "medium", "high"];

export function ChatModelPicker({ projectPath, settings, disabled, onChange, onConfigure }: Props) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProviderId>(settings.activeProvider ?? "ollama");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const catalogRequest = useRef(0);
  const active = settings.providers.find((item) => item.provider === settings.activeProvider) ?? null;
  const selectedConfig = settings.providers.find((item) => item.provider === selected)!;
  const effortSupported = supportsReasoningEffort(selected, selectedConfig.model);
  const canLoad = !providerMeta[selected].requiresKey || selectedConfig.apiKeyConfigured;
  const filtered = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    return models.filter((model) => !value || `${model.name} ${model.id}`.toLocaleLowerCase().includes(value));
  }, [models, query]);

  useEffect(() => {
    if (settings.activeProvider) setSelected(settings.activeProvider);
  }, [settings.activeProvider]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  async function loadModels(provider = selected) {
    const request = ++catalogRequest.current;
    const config = settings.providers.find((item) => item.provider === provider)!;
    if (providerMeta[provider].requiresKey && !config.apiKeyConfigured) { setModels([]); setLoading(false); return; }
    setLoading(true); setError("");
    try { const items = await ai.models(config, projectPath); if (request === catalogRequest.current) setModels(items); }
    catch (cause) { if (request === catalogRequest.current) { setModels([]); setError(asDiagnostic(cause).explanation); } }
    finally { if (request === catalogRequest.current) setLoading(false); }
  }

  async function openPicker() {
    const next = !open;
    setOpen(next); setQuery(""); setError("");
    if (next) await loadModels(selected);
  }

  async function chooseProvider(provider: ProviderId) {
    const request = ++catalogRequest.current;
    setSelected(provider); setModels([]); setLoading(false); setQuery(""); setError(""); setSaving(true);
    try {
      const saved = await ai.saveSettings(projectPath, { ...settings, activeProvider: provider });
      onChange(saved);
      const config = saved.providers.find((item) => item.provider === provider)!;
      if (!providerMeta[provider].requiresKey || config.apiKeyConfigured) {
        setLoading(true);
        try { const items = await ai.models(config, projectPath); if (request === catalogRequest.current) setModels(items); }
        catch (cause) { if (request === catalogRequest.current) setError(asDiagnostic(cause).explanation); }
        finally { if (request === catalogRequest.current) setLoading(false); }
      }
    } catch (cause) { setError(asDiagnostic(cause).explanation); }
    finally { setSaving(false); }
  }

  async function chooseModel(model: string) {
    setSaving(true); setError("");
    try {
      const next: AiSettings = {
        activeProvider: selected,
        providers: settings.providers.map((item) => item.provider === selected ? { ...item, model } : item),
      };
      onChange(await ai.saveSettings(projectPath, next));
      setOpen(false);
    } catch (cause) { setError(asDiagnostic(cause).explanation); }
    finally { setSaving(false); }
  }

  async function chooseEffort(reasoningEffort: ReasoningEffort) {
    setSaving(true); setError("");
    try {
      const next: AiSettings = {
        activeProvider: selected,
        providers: settings.providers.map((item) => item.provider === selected ? { ...item, reasoningEffort } : item),
      };
      onChange(await ai.saveSettings(projectPath, next));
    } catch (cause) { setError(asDiagnostic(cause).explanation); }
    finally { setSaving(false); }
  }

  return <div className="chat-model-picker" ref={root}>
    <button className="chat-model-trigger" type="button" onClick={() => void openPicker()} disabled={disabled} title={t("Cambiar proveedor o modelo", "Change provider or model")} aria-expanded={open}>
      {active ? <ProviderLogo provider={active.provider} size="small" /> : <span className="provider-logo provider-logo--small" />}
      <strong>{active ? providerMeta[active.provider].name : t("Modelo", "Model")}</strong>
      <span className="chat-model-trigger__model">{active?.model || t("Seleccionar", "Select")}</span>
      {active && supportsReasoningEffort(active.provider, active.model) && <span className="chat-model-trigger__effort">{active.reasoningEffort === "low" ? t("Bajo", "Low") : active.reasoningEffort === "high" ? t("Alto", "High") : t("Medio", "Medium")}</span>}
      <ChevronDown size={12} />
    </button>
    {open && <section className="chat-model-menu" aria-label={t("Seleccionar modelo", "Select model")}>
      <header><div><strong>{t("Modelo", "Model")}</strong><span>{t("Cambia sin salir del chat", "Switch without leaving the chat")}</span></div><button type="button" onClick={() => setOpen(false)} aria-label={t("Cerrar", "Close")}><X size={14} /></button></header>
      <div className="model-provider-grid">
        {providerOrder.map((provider) => {
          const config = settings.providers.find((item) => item.provider === provider)!;
          return <button type="button" key={provider} className={selected === provider ? "is-active" : ""} onClick={() => void chooseProvider(provider)} disabled={saving}>
            <ProviderLogo provider={provider} size="medium" />
            <span><strong>{providerMeta[provider].name.replace("Google ", "").replace(" API", "")}</strong><small>{providerMeta[provider].type === "local" ? t("Local", "Local") : "API"}</small></span>
            <em>{providerMeta[provider].requiresKey && !config.apiKeyConfigured ? <KeyRound size={11} /> : config.model ? <Check size={11} /> : null}</em>
          </button>;
        })}
      </div>
      {!canLoad ? <div className="model-menu-empty"><KeyRound size={16} /><span>{t("Falta la API key de", "Missing API key for")} {providerMeta[selected].name}.</span><button type="button" onClick={() => { setOpen(false); onConfigure(); }}><Settings2 size={12} />{t("Configurar", "Configure")}</button></div> : <>
        <div className="model-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Buscar modelo…", "Search models…")} autoFocus /><button type="button" onClick={() => void loadModels()} disabled={loading} title={t("Actualizar modelos", "Refresh models")}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}</button></div>
        <div className="model-option-list">
          {loading && !models.length ? <div className="model-menu-status"><LoaderCircle className="spin" size={14} />{t("Consultando modelos…", "Loading models…")}</div> : filtered.map((model) => <button type="button" key={model.id} className={selectedConfig.model === model.id ? "is-active" : ""} onClick={() => void chooseModel(model.id)} disabled={saving || model.loaded === false} title={model.id}>
            <ProviderLogo provider={selected} size="medium" /><span className="model-option-copy"><strong>{model.name}</strong><small>{model.id}</small></span>
            {model.loaded === false ? <em>{t("No cargado", "Not loaded")}</em> : selectedConfig.model === model.id ? <Check size={14} /> : null}
          </button>)}
          {!loading && !filtered.length && <div className="model-menu-status">{selected === "custom" ? t("No se pudo listar modelos. Puedes escribir el identificador exacto en Configuración.", "Models could not be listed. You can enter the exact identifier in Settings.") : t("No hay modelos disponibles.", "No models available.")}</div>}
        </div>
        {effortSupported ? <div className="reasoning-effort"><div><strong>{t("Esfuerzo", "Effort")}</strong><span>{t("Controla cuánto razona antes de responder", "Controls how much the model reasons before responding")}</span></div><div role="group" aria-label={t("Esfuerzo de razonamiento", "Reasoning effort")}>{effortOptions.map((item) => <button type="button" key={item} className={(selectedConfig.reasoningEffort ?? "medium") === item ? "is-active" : ""} onClick={() => void chooseEffort(item)} disabled={saving}>{item === "low" ? t("Bajo", "Low") : item === "high" ? t("Alto", "High") : t("Medio", "Medium")}</button>)}</div></div> : selectedConfig.model && <div className="reasoning-effort reasoning-effort--unavailable"><div><strong>{t("Esfuerzo predeterminado", "Default effort")}</strong><span>{t("Este modelo no permite cambiarlo", "This model does not allow changing it")}</span></div></div>}
      </>}
      {error && <div className="model-menu-error">{error}<button type="button" onClick={() => { setOpen(false); onConfigure(); }}>{t("Revisar configuración", "Review settings")}</button></div>}
    </section>}
  </div>;
}
