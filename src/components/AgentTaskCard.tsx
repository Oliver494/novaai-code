import { Check, ChevronDown, CircleAlert, Clock3, LoaderCircle, Play, ShieldCheck, Square, Terminal } from "lucide-react";
import type { AgentTask, DetectedCommand } from "../types";
import { usePreferences } from "../services/preferences";

type Props = { task: AgentTask; pending?: DetectedCommand | null; busy: boolean; onApprove?: () => void; onApproveTask?: () => void; onReject?: () => void; onStop?: () => void; onResume?: () => void };
export function AgentTaskCard({ task, pending, busy, onApprove, onApproveTask, onReject, onStop, onResume }: Props) {
  const { t } = usePreferences();
  const active = ["analyzing","planning","executing","testing","correcting"].includes(task.state);
  return <section className={`agent-task-card agent-task-card--${task.state}`}>
    <header><span>{active ? <LoaderCircle className="spin" size={14} /> : task.state === "completed" ? <Check size={14} /> : ["failed","interrupted"].includes(task.state) ? <CircleAlert size={14} /> : <Terminal size={14} />}</span><div><strong>{pending ? t("Permiso para ejecutar", "Permission to run") : task.state === "completed" ? t("Tarea completada", "Task completed") : task.state === "failed" ? t("La verificación falló", "Verification failed") : task.state === "interrupted" ? t("Tarea interrumpida", "Task interrupted") : task.state === "cancelled" ? t("Tarea detenida", "Task stopped") : t("Agente trabajando", "Agent working")}</strong><small>{task.state === "interrupted" ? t("Nova se cerró antes de terminar. Puedes continuar sin perder el chat.", "Nova closed before finishing. You can continue without losing the chat.") : task.command || t("Preparando la tarea", "Preparing task")}</small></div>{task.durationMs !== undefined && <em><Clock3 size={11} />{(task.durationMs / 1000).toFixed(1)} s</em>}</header>
    <div className="agent-steps">{task.steps.map((step) => <span key={step.id} className={`is-${step.status}`}>{step.status === "in_progress" ? <LoaderCircle className="spin" size={11} /> : step.status === "completed" ? <Check size={11} /> : step.status === "failed" ? <CircleAlert size={11} /> : <i />}{step.label}</span>)}</div>
    {pending && <div className="agent-approval"><p><ShieldCheck size={13} />{t("Se ejecutará dentro del proyecto. No usa una shell ni puede salir de la carpeta asignada.", "It will run inside the project. It does not use a shell and cannot leave the assigned folder.")}</p><div><button onClick={onReject} disabled={busy}>{t("Rechazar", "Reject")}</button><button onClick={onApproveTask} disabled={busy}>{t("Aprobar para esta tarea", "Approve for this task")}</button><button className="is-primary" onClick={onApprove} disabled={busy}><Play size={12} />{t("Aprobar", "Approve")}</button></div></div>}
    {task.output && <details><summary><ChevronDown size={12} />{t("Salida del comando", "Command output")}{task.truncated ? t(" · truncada", " · truncated") : ""}</summary><pre>{task.output}</pre></details>}
    {active && onStop && <footer><button onClick={onStop}><Square size={11} fill="currentColor" />{t("Detener proceso", "Stop process")}</button></footer>}
    {task.state === "interrupted" && onResume && <footer><button className="is-primary" onClick={onResume}><Play size={11} />{t("Continuar tarea", "Resume task")}</button></footer>}
  </section>;
}
