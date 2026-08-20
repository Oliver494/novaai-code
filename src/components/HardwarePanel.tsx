import { Cpu, Database, HardDrive, MemoryStick, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { localSystem, type HardwareInfo } from "../services/localSystem";
import { usePreferences } from "../services/preferences";

type Props = { projectPath: string | null };
const gib = (value: number | null) => value == null ? "—" : `${(value / 1024 ** 3).toFixed(1)} GB`;

export function HardwarePanel({ projectPath }: Props) {
  const { t } = usePreferences();
  const [info, setInfo] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function inspect() { setLoading(true); setError(""); try { setInfo(await localSystem.hardware(projectPath)); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setLoading(false); } }
  useEffect(() => { void inspect(); }, [projectPath]);
  return <section className="hardware-panel">
    <div className="settings-toolbar"><span>{t("Datos locales; no se envían a ningún proveedor", "Local data; nothing is sent to a provider")}</span><button className="secondary-button" onClick={() => void inspect()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={15} />{t("Actualizar", "Refresh")}</button></div>
    {error && <div className="settings-inline-error">{error}</div>}
    {info && <><div className="hardware-grid"><article><Cpu size={17} /><span><small>CPU</small><strong>{info.cpu}</strong><em>{info.physicalCores} / {info.logicalCores} {t("núcleos", "cores")}</em></span></article><article><MemoryStick size={17} /><span><small>RAM</small><strong>{gib(info.ramBytes)}</strong><em>{gib(info.availableRamBytes)} {t("disponibles", "available")}</em></span></article><article><Database size={17} /><span><small>GPU / VRAM</small><strong>{info.gpu ?? t("No detectada", "Not detected")}</strong><em>{gib(info.vramBytes)}</em></span></article><article><HardDrive size={17} /><span><small>{t("Espacio disponible", "Available storage")}</small><strong>{gib(info.diskAvailableBytes)}</strong><em>{projectPath ? t("Disco del proyecto", "Project drive") : t("Disco local", "Local drive")}</em></span></article></div><h3 className="settings-subtitle">{t("Modelos locales recomendados", "Recommended local models")}</h3><div className="model-fit-list">{info.recommendations.map((item) => <article className={`is-${item.rating}`} key={item.size}><strong>{item.size}</strong><span>{item.rating === "excellent" ? t("Excelente", "Excellent") : item.rating === "acceptable" ? t("Aceptable por RAM", "Acceptable with RAM") : t("No recomendado", "Not recommended")}</span><small>{item.requiredRamGb} GB RAM · {item.requiredVramGb} GB VRAM</small></article>)}</div><p className="settings-note">{t("Las recomendaciones son aproximadas y asumen modelos cuantizados. La VRAM puede no estar disponible en algunos controladores.", "Recommendations are approximate and assume quantized models. VRAM may be unavailable with some drivers.")}</p></>}
  </section>;
}
