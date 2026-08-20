import { Check, CircleAlert, Cloud, HardDrive, KeyRound, LibraryBig, LoaderCircle, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ai, asDiagnostic, providerMeta } from "../services/ai";
import { supportsReasoningEffort } from "../services/reasoningEffort";
import { usePreferences } from "../services/preferences";
import { LocalModelCatalog } from "./LocalModelCatalog";
import type { AiSettings, Diagnostic, ModelInfo, ProviderConfig, ProviderId, ProviderTestResult, ReasoningEffort } from "../types";
import { ProviderLogo } from "./ProviderLogo";

type Props = { projectPath: string | null; settings: AiSettings; onChange: (settings: AiSettings) => void; onClose: () => void };

// Keep the visual order stable even when an older saved configuration receives
// a newly added provider during migration.
const providerOrder: ProviderId[] = ["ollama", "lm_studio", "open_ai", "anthropic", "gemini", "nvidia", "zai", "kimi", "custom"];
const orderProviders = (items: ProviderConfig[]) => [...items].sort((left, right) => providerOrder.indexOf(left.provider) - providerOrder.indexOf(right.provider));

export function ProviderPanel({ projectPath, settings, onChange, onClose }: Props) {
  const { t } = usePreferences();
  const [selected, setSelected] = useState<ProviderId>(settings.activeProvider ?? "ollama");
  const initial = settings.providers.find((item) => item.provider === selected)!;
  const [draft, setDraft] = useState<ProviderConfig>(initial);
  const [key, setKey] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ProviderTestResult | null>(null);
  const [error, setError] = useState<Diagnostic | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const meta = providerMeta[selected];
  const groups = useMemo(() => ({
    local: orderProviders(settings.providers.filter((item) => providerMeta[item.provider].type === "local")),
    cloud: orderProviders(settings.providers.filter((item) => providerMeta[item.provider].type === "cloud")),
  }), [settings.providers]);

  useEffect(() => {
    const next = settings.providers.find((item) => item.provider === selected)!;
    let cancelled = false;
    setDraft(next);
    setModels([]);
    setResult(null);
    setError(null);
    setKey("");

    if (!providerMeta[selected].requiresKey || next.apiKeyConfigured) {
      setModelsLoading(true);
      ai.models(next, projectPath)
        .then((items) => { if (!cancelled) setModels(items); })
        .catch((cause) => { if (!cancelled) setError(asDiagnostic(cause)); })
        .finally(() => { if (!cancelled) setModelsLoading(false); });
    }
    return () => { cancelled = true; };
    // The panel is remounted when project settings change. Avoid clearing the model list after each save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, projectPath]);

  async function loadModels(config = draft) {
    setModelsLoading(true);
    setError(null);
    try {
      const items = await ai.models(config, projectPath);
      setModels(items);
      return items;
    } catch (cause) {
      setError(asDiagnostic(cause));
      return [];
    } finally {
      setModelsLoading(false);
    }
  }

  async function persist(nextDraft = draft, savePendingKey = true) {
    setSaving(true);
    setError(null);
    try {
      if (savePendingKey && key.trim()) {
        await ai.setKey(selected, projectPath, key);
        nextDraft = { ...nextDraft, apiKeyConfigured: true };
      }
      const next: AiSettings = {
        activeProvider: selected,
        providers: settings.providers.map((item) => item.provider === selected ? nextDraft : item),
      };
      const saved = await ai.saveSettings(projectPath, next);
      const savedDraft = saved.providers.find((item) => item.provider === selected)!;
      onChange(saved);
      setDraft(savedDraft);
      if (savePendingKey && key.trim()) setKey("");
      return saved;
    } catch (cause) {
      setError(asDiagnostic(cause));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveKey() {
    if (!key.trim()) return;
    const saved = await persist(draft, true);
    if (saved) await loadModels(saved.providers.find((item) => item.provider === selected)!);
  }

  async function test() {
    setTesting(true);
    setError(null);
    setResult(null);
    try {
      const saved = await persist();
      if (!saved) return;
      const active = saved.providers.find((item) => item.provider === selected)!;
      const tested = await ai.test(active, projectPath);
      setResult(tested);
      setModels(tested.models);
      if (tested.models.length && !active.model) {
        const updated = { ...active, model: tested.models.find((model) => model.loaded !== false)?.id ?? tested.models[0].id };
        setDraft(updated);
        await persist(updated, false);
      }
    } catch (cause) {
      setError(asDiagnostic(cause));
    } finally {
      setTesting(false);
    }
  }

  async function selectModel(model: string) {
    const next = { ...draft, model };
    setDraft(next);
    await persist(next);
  }

  async function selectEffort(reasoningEffort: ReasoningEffort) {
    const next = { ...draft, reasoningEffort };
    setDraft(next);
    await persist(next, false);
  }

  async function removeKey() {
    try {
      await ai.deleteKey(selected, projectPath);
      const next = { ...draft, apiKeyConfigured: false };
      setDraft(next);
      setModels([]);
      const updated = { ...settings, providers: settings.providers.map((item) => item.provider === selected ? next : item) };
      onChange(await ai.saveSettings(projectPath, updated));
    } catch (cause) {
      setError(asDiagnostic(cause));
    }
  }

  async function closePanel() {
    if (key.trim() && !await persist()) return;
    onClose();
  }

  const update = <K extends keyof ProviderConfig>(field: K, value: ProviderConfig[K]) => setDraft((current) => ({ ...current, [field]: value }));
  const currentOutsideCatalog = draft.model && !models.some((model) => model.id === draft.model);

  return <div className="provider-overlay" role="dialog" aria-modal="true" aria-label={t("Proveedores de IA", "AI providers")}>
    <div className="provider-panel">
      <header><div><strong>{t("Proveedores", "Providers")}</strong><span>{projectPath ? t("Configuración del proyecto", "Project settings") : t("Configuración global", "Global settings")}</span></div><button className="icon-button" onClick={() => void closePanel()} aria-label={t("Cerrar", "Close")}><X size={17} /></button></header>
      <div className="provider-panel__body">
        <nav className="provider-list" aria-label={t("Lista de proveedores", "Provider list")}>
          <ProviderGroup title={t("Locales", "Local")} icon={<HardDrive size={14} />} items={groups.local} selected={selected} onSelect={setSelected} />
          <ProviderGroup title="API" icon={<Cloud size={14} />} items={groups.cloud} selected={selected} onSelect={setSelected} />
        </nav>
        <section className="provider-form">
          <div className="provider-form__scroll">
          <div className="provider-form__heading"><div className="provider-heading-brand"><ProviderLogo provider={selected} size="large" /><div><h2>{meta.name}</h2><span>{meta.type === "local" ? t("En este equipo", "On this computer") : t("Proveedor externo", "External provider")}</span></div></div>{result && <span className={`connection-badge ${result.connected ? "is-connected" : "is-error"}`}>{result.connected ? <Check size={13} /> : <CircleAlert size={13} />}{result.connected ? `${t("Conectado", "Connected")} · ${result.durationMs} ms` : t("Error", "Error")}</span>}</div>
          {selected === "custom" && <div className="custom-provider-note"><strong>{t("API compatible con OpenAI", "OpenAI-compatible API")}</strong><span>{t("Usa una URL base que termine en /v1. Nova consultará /models y enviará el chat a /chat/completions.", "Use a base URL ending in /v1. Nova will query /models and send chat to /chat/completions.")}</span></div>}
          <label>Endpoint<div className="input-with-action"><input value={draft.endpoint} onChange={(event) => update("endpoint", event.target.value)} spellCheck={false} /><button className="icon-button" title={t("Restaurar endpoint", "Restore endpoint")} onClick={() => update("endpoint", meta.defaultEndpoint)}><RotateCcw size={15} /></button></div></label>
          {(meta.requiresKey || selected === "custom") && <label>API key {selected === "custom" && <span className="field-hint">{t("Opcional: déjala vacía si tu servidor no usa autenticación.", "Optional: leave it empty if your server does not use authentication.")}</span>}<div className="key-row"><input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder={draft.apiKeyConfigured ? t("Guardada de forma segura", "Stored securely") : t("Pega tu clave", "Paste your key")} autoComplete="new-password" /><span className={draft.apiKeyConfigured ? "key-state is-set" : "key-state"}><KeyRound size={13} />{draft.apiKeyConfigured ? t("Configurada", "Configured") : selected === "custom" ? t("Opcional", "Optional") : t("Sin clave", "No key")}</span>{key.trim() && <button className="icon-button" onClick={() => void saveKey()} title={t("Guardar clave", "Save key")} disabled={saving}><Check size={15} /></button>}{draft.apiKeyConfigured && <button className="icon-button" onClick={() => void removeKey()} title={t("Eliminar clave", "Delete key")}><Trash2 size={15} /></button>}</div></label>}
          <label>{t("Modelo", "Model")}<div className="input-with-action"><select value={draft.model} onChange={(event) => void selectModel(event.target.value)} disabled={modelsLoading}><option value="">{modelsLoading ? t("Cargando modelos…", "Loading models…") : t("Seleccionar modelo", "Select model")}</option>{currentOutsideCatalog && <option value={draft.model}>{draft.model}</option>}{models.map((model) => <option key={model.id} value={model.id}>{model.name}{model.loaded === false ? ` · ${t("no cargado", "not loaded")}` : ""}</option>)}</select><button className="icon-button" title={t("Actualizar modelos", "Refresh models")} onClick={() => void loadModels()} disabled={modelsLoading || (meta.requiresKey && !draft.apiKeyConfigured && !key.trim())}>{modelsLoading ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />}</button></div><input className="model-manual" value={draft.model} onChange={(event) => update("model", event.target.value)} onBlur={() => { if (draft.model.trim()) void persist(draft, false); }} placeholder={t("O escribe el identificador exacto", "Or enter the exact identifier")} spellCheck={false} />{models.length > 0 && <small>{models.length} {t("modelos disponibles", "models available")}</small>}{meta.type === "local" && <button className="local-library-button" type="button" onClick={() => setCatalogOpen(true)}><LibraryBig size={15} />{t("Explorar y descargar modelos", "Browse and download models")}</button>}</label>
          {draft.model && (supportsReasoningEffort(selected, draft.model) ? <label>{t("Esfuerzo", "Effort")}<span className="field-hint">{t("Controla cuánto razona el modelo antes de responder.", "Controls how much the model reasons before responding.")}</span><div className="provider-effort" role="group" aria-label={t("Esfuerzo de razonamiento", "Reasoning effort")}>{(["low", "medium", "high"] as ReasoningEffort[]).map((effort) => <button type="button" key={effort} className={(draft.reasoningEffort ?? "medium") === effort ? "is-active" : ""} onClick={() => void selectEffort(effort)} disabled={saving}>{effort === "low" ? t("Bajo", "Low") : effort === "medium" ? t("Medio", "Medium") : t("Alto", "High")}</button>)}</div></label> : <div className="provider-effort-unavailable"><strong>{t("Esfuerzo predeterminado", "Default effort")}</strong><span>{t("Este modelo no permite cambiarlo.", "This model does not allow changing it.")}</span></div>)}
          <div className="timeout-grid"><label>{t("Conexión", "Connection")}<input type="number" min="1" max="60" value={draft.connectTimeoutSecs} onChange={(event) => update("connectTimeoutSecs", Number(event.target.value))} /><span>s</span></label><label>{t("Inicio", "Start")}<input type="number" min="1" max="300" value={draft.firstResponseTimeoutSecs} onChange={(event) => update("firstResponseTimeoutSecs", Number(event.target.value))} /><span>s</span></label><label>{t("Inactividad", "Inactivity")}<input type="number" min="1" max="300" value={draft.inactivityTimeoutSecs} onChange={(event) => update("inactivityTimeoutSecs", Number(event.target.value))} /><span>s</span></label><label>{t("Máximo", "Maximum")}<input type="number" min="10" max="3600" value={draft.maxResponseTimeoutSecs} onChange={(event) => update("maxResponseTimeoutSecs", Number(event.target.value))} /><span>s</span></label></div>
          {(error || result?.diagnostic) && <div className="provider-result"><strong>{(error ?? result?.diagnostic)?.title}</strong><p>{(error ?? result?.diagnostic)?.explanation}</p><span>{(error ?? result?.diagnostic)?.action}</span></div>}
          </div>
          <footer><span>{saving ? t("Guardando cambios…", "Saving changes…") : t("Configuración segura del proyecto", "Secure project settings")}</span><button className="secondary-button" disabled={saving || testing} onClick={() => void persist()}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}{t("Guardar", "Save")}</button><button className="primary-button" disabled={saving || testing} onClick={() => void test()}>{testing ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{testing ? t("Probando conexión…", "Testing connection…") : t("Probar conexión", "Test connection")}</button></footer>
        </section>
      </div>
    </div>
    {catalogOpen && (selected === "ollama" || selected === "lm_studio") && <LocalModelCatalog provider={selected} config={draft} onClose={() => setCatalogOpen(false)} onInstalled={() => void loadModels()} />}
  </div>;
}

function ProviderGroup({ title, icon, items, selected, onSelect }: { title: string; icon: React.ReactNode; items: ProviderConfig[]; selected: ProviderId; onSelect: (id: ProviderId) => void }) {
  const { t } = usePreferences();
  return <div className="provider-group"><span>{icon}{title}</span>{items.map((item) => <button key={item.provider} className={selected === item.provider ? "is-active" : ""} onClick={() => onSelect(item.provider)}><ProviderLogo provider={item.provider} size="medium" /><span><strong>{providerMeta[item.provider].name}</strong><small>{item.model || (providerMeta[item.provider].type === "local" ? t("Local", "Local") : t("Sin modelo", "No model"))}</small></span><em className={item.apiKeyConfigured || providerMeta[item.provider].type === "local" ? "is-ready" : ""}>{item.apiKeyConfigured ? <KeyRound size={12} /> : <i />}</em></button>)}</div>;
}
