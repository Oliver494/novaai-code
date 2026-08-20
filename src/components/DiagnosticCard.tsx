import { AlertCircle, ChevronDown, RotateCw } from "lucide-react";
import type { Diagnostic } from "../types";
import { usePreferences } from "../services/preferences";

export function DiagnosticCard({ diagnostic, onRetry }: { diagnostic: Diagnostic; onRetry?: () => void }) {
  const { t } = usePreferences();
  return <div className="diagnostic-card" role="alert">
    <div className="diagnostic-card__title"><AlertCircle size={16} /><strong>{diagnostic.title}</strong><code>{diagnostic.code}</code></div>
    <p>{diagnostic.explanation}</p>
    <span>{diagnostic.action}</span>
    <div className="diagnostic-card__actions">
      {onRetry && diagnostic.retryable && <button className="secondary-button" onClick={onRetry}><RotateCw size={14} />{t("Reintentar", "Retry")}</button>}
      {diagnostic.technicalDetails && <details><summary><ChevronDown size={13} />{t("Detalles", "Details")}</summary><pre>{diagnostic.technicalDetails}</pre></details>}
    </div>
  </div>;
}
