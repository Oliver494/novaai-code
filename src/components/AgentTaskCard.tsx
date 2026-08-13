import { Check, ChevronDown, CircleAlert, Clock3, LoaderCircle, Play, ShieldCheck, Square, Terminal } from "lucide-react";
import type { AgentTask, DetectedCommand } from "../types";

type Props = { task: AgentTask; pending?: DetectedCommand | null; busy: boolean; onApprove?: () => void; onApproveTask?: () => void; onReject?: () => void; onStop?: () => void };
export function AgentTaskCard({ task, pending, busy, onApprove, onApproveTask, onReject, onStop }: Props) {
  const active = ["analyzing","planning","executing","testing","correcting"].includes(task.state);
  return <section className={`agent-task-card agent-task-card--${task.state}`}>
    <header><span>{active ? <LoaderCircle className="spin" size={14} /> : task.state === "completed" ? <Check size={14} /> : task.state === "failed" ? <CircleAlert size={14} /> : <Terminal size={14} />}</span><div><strong>{pending ? "Permiso para ejecutar" : task.state === "completed" ? "Tarea completada" : task.state === "failed" ? "La verificación falló" : task.state === "cancelled" ? "Tarea detenida" : "Agente trabajando"}</strong><small>{task.command || "Preparando la tarea"}</small></div>{task.durationMs !== undefined && <em><Clock3 size={11} />{(task.durationMs / 1000).toFixed(1)} s</em>}</header>
    <div className="agent-steps">{task.steps.map((step) => <span key={step.id} className={`is-${step.status}`}>{step.status === "in_progress" ? <LoaderCircle className="spin" size={11} /> : step.status === "completed" ? <Check size={11} /> : step.status === "failed" ? <CircleAlert size={11} /> : <i />}{step.label}</span>)}</div>
    {pending && <div className="agent-approval"><p><ShieldCheck size={13} />Se ejecutará dentro del proyecto. No usa una shell ni puede salir de la carpeta asignada.</p><div><button onClick={onReject} disabled={busy}>Rechazar</button><button onClick={onApproveTask} disabled={busy}>Aprobar para esta tarea</button><button className="is-primary" onClick={onApprove} disabled={busy}><Play size={12} />Aprobar</button></div></div>}
    {task.output && <details><summary><ChevronDown size={12} />Salida del comando{task.truncated ? " · truncada" : ""}</summary><pre>{task.output}</pre></details>}
    {active && onStop && <footer><button onClick={onStop}><Square size={11} fill="currentColor" />Detener proceso</button></footer>}
  </section>;
}
