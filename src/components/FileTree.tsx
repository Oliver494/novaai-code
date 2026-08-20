import {
  ChevronRight,
  Copy,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { MouseEvent, useEffect, useRef, useState } from "react";
import type { FileNode } from "../types";
import { usePreferences } from "../services/preferences";
import { FileTypeIcon } from "./FileTypeIcon";

type ContextState = { node: FileNode; x: number; y: number } | null;

type Props = {
  projectName: string;
  nodes: FileNode[];
  selectedPath: string | null;
  loading: boolean;
  onSelect: (node: FileNode) => void;
  onOpen: (node: FileNode) => void;
  onRefresh: () => void;
  onCreate: (kind: "new-file" | "new-folder", target?: FileNode) => void;
  onRename: (node: FileNode) => void;
  onDelete: (node: FileNode) => void;
  onReveal: (node: FileNode) => void;
  onCopy: (value: string, label: string) => void;
};

function NodeIcon({ node, expanded }: { node: FileNode; expanded: boolean }) {
  if (node.isDirectory) return expanded ? <FolderOpen size={15} strokeWidth={1.8} /> : <Folder size={15} strokeWidth={1.8} />;
  return <FileTypeIcon name={node.name} />;
}

function TreeNode({ node, depth, ...props }: { node: FileNode; depth: number } & Omit<Props, "nodes" | "loading" | "onRefresh">) {
  const [expanded, setExpanded] = useState(depth === 0);
  const openNode = () => {
    props.onSelect(node);
    if (node.isDirectory) setExpanded((current) => !current);
    else props.onOpen(node);
  };
  return (
    <li>
      <button
        className={`tree-row ${props.selectedPath === node.relativePath ? "tree-row--selected" : ""}`}
        style={{ paddingLeft: 7 + depth * 12 }}
        onClick={openNode}
        onContextMenu={(event) => {
          event.preventDefault();
          props.onSelect(node);
          window.dispatchEvent(new CustomEvent("nova-context", { detail: { node, x: event.clientX, y: event.clientY } }));
        }}
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const bounds = event.currentTarget.getBoundingClientRect();
            props.onSelect(node);
            window.dispatchEvent(new CustomEvent("nova-context", { detail: { node, x: bounds.left + 28, y: bounds.bottom } }));
          }
        }}
        title={node.relativePath}
      >
        <ChevronRight className={`tree-chevron ${expanded ? "tree-chevron--open" : ""} ${node.isDirectory ? "" : "tree-chevron--hidden"}`} size={12} strokeWidth={1.8} />
        <NodeIcon node={node} expanded={expanded} />
        <span>{node.name}</span>
      </button>
      {node.isDirectory && expanded && node.children.length > 0 && (
        <ul>{node.children.map((child) => <TreeNode key={child.relativePath} node={child} depth={depth + 1} {...props} />)}</ul>
      )}
    </li>
  );
}

export function FileTree(props: Props) {
  const { t } = usePreferences();
  const [context, setContext] = useState<ContextState>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const show = (event: Event) => setContext((event as CustomEvent<ContextState>).detail);
    const hide = () => setContext(null);
    window.addEventListener("nova-context", show);
    window.addEventListener("pointerdown", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("nova-context", show);
      window.removeEventListener("pointerdown", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  const action = (callback: (node: FileNode) => void) => (event: MouseEvent) => {
    event.stopPropagation();
    if (context) callback(context.node);
    setContext(null);
  };

  return (
    <div className="file-tree">
      <div className="explorer-toolbar">
        <div className="explorer-toolbar__title"><span>{t("Archivos", "Files")}</span><small title={props.projectName}>{props.projectName}</small></div>
        <div>
          <button onClick={() => props.onCreate("new-file")} title={t("Nuevo archivo", "New file")} aria-label={t("Nuevo archivo", "New file")}><FilePlus2 size={16} strokeWidth={1.8} /></button>
          <button onClick={() => props.onCreate("new-folder")} title={t("Nueva carpeta", "New folder")} aria-label={t("Nueva carpeta", "New folder")}><FolderPlus size={16} strokeWidth={1.8} /></button>
          <button onClick={props.onRefresh} title={t("Actualizar archivos", "Refresh files")} aria-label={t("Actualizar archivos", "Refresh files")} disabled={props.loading}><RefreshCw className={props.loading ? "spin" : ""} size={16} strokeWidth={1.8} /></button>
        </div>
      </div>
      <div className="tree-scroll">
        {props.loading && props.nodes.length === 0 ? <div className="tree-status">{t("Leyendo proyecto…", "Reading project…")}</div> : (
          <ul className="tree-root">{props.nodes.map((node) => <TreeNode key={node.relativePath} node={node} depth={0} {...props} />)}</ul>
        )}
      </div>
      {context && (
        <div ref={menuRef} className="context-menu" style={{ left: Math.min(context.x, window.innerWidth - 220), top: Math.min(context.y, window.innerHeight - 300) }} onPointerDown={(event) => event.stopPropagation()} role="menu">
          {context.node.isDirectory && <><button role="menuitem" onClick={action((node) => props.onCreate("new-file", node))}><FilePlus2 size={16} strokeWidth={1.8} />{t("Nuevo archivo", "New file")}</button><button role="menuitem" onClick={action((node) => props.onCreate("new-folder", node))}><FolderPlus size={16} strokeWidth={1.8} />{t("Nueva carpeta", "New folder")}</button><span className="context-separator" /></>}
          <button role="menuitem" onClick={action(props.onRename)}><Pencil size={16} strokeWidth={1.8} />{t("Renombrar", "Rename")}</button>
          <button role="menuitem" onClick={action(props.onReveal)}><FolderSearch size={16} strokeWidth={1.8} />{t("Mostrar en el Explorador", "Show in File Explorer")}</button>
          <button role="menuitem" onClick={action((node) => props.onCopy(node.path, t("Ruta copiada", "Path copied")))}><Copy size={16} strokeWidth={1.8} />{t("Copiar ruta", "Copy path")}</button>
          <button role="menuitem" onClick={action((node) => props.onCopy(node.relativePath, t("Ruta relativa copiada", "Relative path copied")))}><Copy size={16} strokeWidth={1.8} />{t("Copiar ruta relativa", "Copy relative path")}</button>
          <span className="context-separator" />
          <button role="menuitem" className="context-danger" onClick={action(props.onDelete)}><Trash2 size={16} strokeWidth={1.8} />{t("Eliminar", "Delete")}</button>
        </div>
      )}
    </div>
  );
}
