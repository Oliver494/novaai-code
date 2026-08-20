import { Check, ChevronDown, FolderOpen, FolderPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectInfo } from "../types";
import { usePreferences } from "../services/preferences";

type Props = {
  active: ProjectInfo | null;
  projects: ProjectInfo[];
  onAdd: () => void;
  onRemove: (path: string) => void;
  onSelect: (path: string) => void;
};

export function ProjectSwitcher({ active, projects, onAdd, onRemove, onSelect }: Props) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);

  return <div className="project-switcher" ref={root}>
    <button type="button" className="project-switcher__trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open} title={active?.path ?? t("Proyectos", "Projects")}><FolderOpen size={16} /><span><strong>{active?.name ?? "NovaAI Code"}</strong>{active && <small>{active.path}</small>}</span><ChevronDown size={14} /></button>
    {open && <div className="project-switcher__menu">
      <header><strong>{t("Proyectos", "Projects")}</strong><span>{projects.length}</span></header>
      <div className="project-switcher__list">{projects.map((item) => <div className={active?.path.toLocaleLowerCase() === item.path.toLocaleLowerCase() ? "is-active" : ""} key={item.path}><button type="button" onClick={() => { setOpen(false); onSelect(item.path); }}><FolderOpen size={16} /><span><strong>{item.name}</strong><small title={item.path}>{item.path}</small></span>{active?.path.toLocaleLowerCase() === item.path.toLocaleLowerCase() && <Check size={15} />}</button><button type="button" className="project-switcher__remove" onClick={() => onRemove(item.path)} title={t("Quitar de la lista", "Remove from list")} aria-label={`${t("Quitar", "Remove")} ${item.name}`}><X size={14} /></button></div>)}</div>
      <footer><button type="button" onClick={() => { setOpen(false); onAdd(); }}><FolderPlus size={16} />{t("Añadir proyecto", "Add project")}</button></footer>
    </div>}
  </div>;
}
