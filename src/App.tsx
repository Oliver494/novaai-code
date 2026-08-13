import {
  CircleHelp,
  CircleCheck,
  FileCode2,
  FolderOpen,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import novaLogo from "./assets/nova.png";
import { ActionDialog, type DialogRequest } from "./components/ActionDialog";
import { ChatPane } from "./components/ChatPane";
import { FileTree } from "./components/FileTree";
import { ProviderPanel } from "./components/ProviderPanel";
import { PreferencesPanel } from "./components/PreferencesPanel";
import { ai } from "./services/ai";
import { chooseProjectFolder, errorMessage, projectFiles } from "./services/fileSystem";
import { usePreferences } from "./services/preferences";
import type { AiSettings, FileNode, Notice, OpenFile, ProjectInfo } from "./types";

const LAST_PROJECT_KEY = "novaai-code:last-project";
const EditorPane = lazy(() => import("./components/EditorPane").then((module) => ({ default: module.EditorPane })));

function BrandMark() {
  return <div className="brand-mark" aria-hidden="true"><img src={novaLogo} alt="" draggable={false} /></div>;
}

function joinRelative(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

function parentPath(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

function hasDirtyFiles(files: OpenFile[]) {
  return files.some((file) => file.content !== file.savedContent);
}

function App() {
  const { t } = usePreferences();
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [workspaceView, setWorkspaceView] = useState<"files" | "chat">("files");
  const [providerOpen, setProviderOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const scanRunning = useRef(false);
  const noticeId = useRef(1);

  const notify = useCallback((tone: Notice["tone"], message: string) => {
    const id = noticeId.current++;
    setNotices((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setNotices((current) => current.filter((notice) => notice.id !== id)), 4500);
  }, []);

  useEffect(() => {
    let active = true;
    ai.settings(project?.path ?? null)
      .then((value) => { if (active) setAiSettings(value); })
      .catch((error) => notify("error", errorMessage(error)));
    return () => { active = false; };
  }, [project?.path, notify]);

  const refreshTree = useCallback(async (quiet = false) => {
    if (!project || scanRunning.current) return;
    scanRunning.current = true;
    if (!quiet) setLoading(true);
    try {
      setNodes(await projectFiles.scan(project.path));
    } catch (error) {
      if (!quiet) notify("error", errorMessage(error));
    } finally {
      scanRunning.current = false;
      if (!quiet) setLoading(false);
    }
  }, [notify, project]);

  const loadProject = useCallback(async (path: string, restoring = false) => {
    if (hasDirtyFiles(openFiles) && !window.confirm("Hay archivos sin guardar. ¿Quieres cerrar el proyecto y descartar esos cambios?")) return;
    setLoading(true);
    try {
      const info = await projectFiles.openProject(path);
      const tree = await projectFiles.scan(info.path);
      setProject(info);
      setNodes(tree);
      setOpenFiles([]);
      setActivePath(null);
      setSelectedNode(null);
      localStorage.setItem(LAST_PROJECT_KEY, info.path);
      if (!restoring) notify("success", "Proyecto abierto");
    } catch (error) {
      if (restoring) localStorage.removeItem(LAST_PROJECT_KEY);
      notify("error", errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [notify, openFiles]);

  useEffect(() => {
    const saved = localStorage.getItem(LAST_PROJECT_KEY);
    if (saved) void loadProject(saved, true);
    // Restore only once on startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!project) return;
    const timer = window.setInterval(() => void refreshTree(true), 4000);
    return () => window.clearInterval(timer);
  }, [project, refreshTree]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (hasDirtyFiles(openFiles)) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [openFiles]);

  async function chooseFolder() {
    try {
      const path = await chooseProjectFolder();
      if (path) await loadProject(path);
    } catch (error) {
      notify("error", errorMessage(error));
    }
  }

  function closeProject() {
    if (hasDirtyFiles(openFiles) && !window.confirm("Hay archivos sin guardar. ¿Quieres cerrar el proyecto y descartar esos cambios?")) return;
    setProject(null);
    setNodes([]);
    setOpenFiles([]);
    setActivePath(null);
    setSelectedNode(null);
    localStorage.removeItem(LAST_PROJECT_KEY);
  }

  async function openFile(node: FileNode) {
    const existing = openFiles.find((file) => file.relativePath === node.relativePath);
    if (existing) {
      setActivePath(existing.relativePath);
      return;
    }
    if (!project) return;
    try {
      const file = await projectFiles.read(project.path, node.relativePath);
      const opened: OpenFile = { ...file, name: node.name, savedContent: file.content };
      setOpenFiles((current) => [...current, opened]);
      setActivePath(opened.relativePath);
    } catch (error) {
      notify("error", errorMessage(error));
    }
  }

  function updateContent(path: string, content: string) {
    setOpenFiles((current) => current.map((file) => file.relativePath === path ? { ...file, content } : file));
  }

  async function saveFile(path: string, quiet = false) {
    const file = openFiles.find((item) => item.relativePath === path);
    if (!project || !file || file.content === file.savedContent) return true;
    setSaving(true);
    try {
      await projectFiles.write(project.path, file.relativePath, file.content);
      setOpenFiles((current) => current.map((item) => item.relativePath === path ? { ...item, savedContent: item.content } : item));
      if (!quiet) notify("success", "Archivo guardado");
      return true;
    } catch (error) {
      notify("error", errorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    const dirty = openFiles.filter((file) => file.content !== file.savedContent);
    if (!dirty.length) return;
    let saved = 0;
    for (const file of dirty) if (await saveFile(file.relativePath, true)) saved += 1;
    if (saved === dirty.length) notify("success", saved === 1 ? "Archivo guardado" : "Archivos guardados");
  }

  const reloadChangedFiles = useCallback(async (paths: string[]) => {
    if (!project) return;
    const changed = new Set(paths);
    const replacements = new Map<string, OpenFile>();
    for (const file of openFiles.filter((item) => changed.has(item.relativePath))) {
      try {
        const loaded = await projectFiles.read(project.path, file.relativePath);
        replacements.set(file.relativePath, { ...file, ...loaded, content: loaded.content, savedContent: loaded.content });
      } catch { /* A newly deleted or unavailable file will be reflected by the tree refresh. */ }
    }
    if (replacements.size) setOpenFiles((items) => items.map((item) => replacements.get(item.relativePath) ?? item));
    notify("success", `${paths.length} archivo${paths.length === 1 ? "" : "s"} actualizado${paths.length === 1 ? "" : "s"} por Nova`);
    // The write has already completed. Refreshing a large tree can take much
    // longer than creating the file, so keep it out of the critical path.
    void refreshTree(true);
  }, [notify, openFiles, project, refreshTree]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (event.shiftKey) void saveAll();
      else if (activePath) void saveFile(activePath);
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });

  function closeFile(path: string) {
    const file = openFiles.find((item) => item.relativePath === path);
    if (!file) return;
    if (file.content !== file.savedContent && !window.confirm(`“${file.name}” tiene cambios sin guardar. ¿Quieres descartarlos?`)) return;
    const index = openFiles.findIndex((item) => item.relativePath === path);
    const remaining = openFiles.filter((item) => item.relativePath !== path);
    setOpenFiles(remaining);
    if (activePath === path) setActivePath(remaining[Math.min(index, remaining.length - 1)]?.relativePath ?? null);
  }

  function createRequest(kind: "new-file" | "new-folder", target = selectedNode ?? undefined) {
    const targetPath = target?.isDirectory ? target.relativePath : target ? parentPath(target.relativePath) : "";
    setDialog({ kind, targetPath });
    setDialogError(null);
  }

  async function confirmDialog(value: string) {
    if (!project || !dialog) return;
    setDialogBusy(true);
    setDialogError(null);
    try {
      if (dialog.kind === "new-file" || dialog.kind === "new-folder") {
        const relative = joinRelative(dialog.targetPath, value);
        await projectFiles.create(project.path, relative, dialog.kind === "new-folder");
        notify("success", dialog.kind === "new-folder" ? "Carpeta creada" : "Archivo creado");
      } else if (dialog.kind === "rename") {
        const oldPath = dialog.targetPath;
        const newPath = joinRelative(parentPath(oldPath), value);
        await projectFiles.rename(project.path, oldPath, value);
        setOpenFiles((current) => current.map((file) => {
          if (file.relativePath !== oldPath && !file.relativePath.startsWith(`${oldPath}/`)) return file;
          const relativePath = `${newPath}${file.relativePath.slice(oldPath.length)}`;
          return { ...file, relativePath, name: relativePath.split("/").pop() ?? file.name };
        }));
        if (activePath === oldPath || activePath?.startsWith(`${oldPath}/`)) setActivePath(`${newPath}${activePath.slice(oldPath.length)}`);
        notify("success", "Nombre actualizado");
      } else {
        await projectFiles.remove(project.path, dialog.targetPath);
        setOpenFiles((current) => current.filter((file) => file.relativePath !== dialog.targetPath && !file.relativePath.startsWith(`${dialog.targetPath}/`)));
        if (activePath === dialog.targetPath || activePath?.startsWith(`${dialog.targetPath}/`)) setActivePath(null);
        notify("success", dialog.isDirectory ? "Carpeta eliminada" : "Archivo eliminado");
      }
      setDialog(null);
      setSelectedNode(null);
      await refreshTree();
    } catch (error) {
      setDialogError(errorMessage(error));
    } finally {
      setDialogBusy(false);
    }
  }

  const dirtyCount = useMemo(() => openFiles.filter((file) => file.content !== file.savedContent).length, [openFiles]);

  return (
    <div className="app-shell">
      <aside className="activity-rail" aria-label={t("Navegación principal", "Main navigation")}>
        <div className="activity-rail__top">
          <BrandMark />
          <button className={`rail-button ${workspaceView === "files" ? "rail-button--active" : ""}`} onClick={() => setWorkspaceView("files")} aria-label={t("Explorador de archivos", "File explorer")} title={t("Explorador de archivos", "File explorer")}><FileCode2 size={18} strokeWidth={1.8} /></button>
          <button className={`rail-button ${workspaceView === "chat" ? "rail-button--active" : ""}`} onClick={() => setWorkspaceView("chat")} aria-label={t("Chat con IA", "AI chat")} title={t("Chat con IA", "AI chat")}><MessageSquare size={18} strokeWidth={1.8} /></button>
        </div>
        <div className="activity-rail__bottom"><button className="rail-button" onClick={() => setPreferencesOpen(true)} aria-label={t("Configuración", "Settings")} title={t("Configuración", "Settings")}><Settings2 size={18} strokeWidth={1.8} /></button></div>
      </aside>

      <aside className={`project-sidebar ${sidebarOpen && workspaceView === "files" ? "" : "project-sidebar--closed"}`}>
        <div className="sidebar-brand"><span>{t("Archivos", "Files")}</span></div>
        {project ? <>
          <div className="project-heading">
            <button className="project-heading__folder" onClick={chooseFolder} title={`${t("Abrir otro proyecto", "Open another project")}\n${project.path}`}><FolderOpen size={16} strokeWidth={1.8} /><span><strong>{project.name}</strong><small>{project.path}</small></span></button>
            <button className="icon-button" onClick={closeProject} title={t("Cerrar proyecto", "Close project")} aria-label={t("Cerrar proyecto", "Close project")}><X size={16} strokeWidth={1.8} /></button>
          </div>
          <FileTree nodes={nodes} selectedPath={selectedNode?.relativePath ?? null} loading={loading} onSelect={setSelectedNode} onOpen={openFile} onRefresh={() => void refreshTree()} onCreate={createRequest} onRename={(node) => { setDialog({ kind: "rename", targetPath: node.relativePath, targetName: node.name, isDirectory: node.isDirectory }); setDialogError(null); }} onDelete={(node) => { setDialog({ kind: "delete", targetPath: node.relativePath, targetName: node.name, isDirectory: node.isDirectory }); setDialogError(null); }} onReveal={(node) => projectFiles.reveal(node.path).catch((error) => notify("error", errorMessage(error)))} onCopy={(value, label) => navigator.clipboard.writeText(value).then(() => notify("success", label)).catch(() => notify("error", "No se pudo copiar la ruta."))} />
        </> : <div className="sidebar-empty"><CircleHelp size={16} /><span>{t("Abre un proyecto para ver sus archivos.", "Open a project to view its files.")}</span></div>}
      </aside>

      <main className="workspace" id="main-content">
        <header className="topbar">
          <div className="topbar__left"><button className="icon-button" onClick={() => setSidebarOpen((value) => !value)} title={sidebarOpen ? t("Ocultar explorador", "Hide explorer") : t("Mostrar explorador", "Show explorer")} aria-label={sidebarOpen ? t("Ocultar explorador", "Hide explorer") : t("Mostrar explorador", "Show explorer")}>{sidebarOpen ? <PanelLeftClose size={17} strokeWidth={1.8} /> : <PanelLeftOpen size={17} strokeWidth={1.8} />}</button><div className="topbar__title"><strong>{project?.name ?? "NovaAI Code"}</strong>{project && <span title={project.path}>{project.path}</span>}</div></div>
          {project && <div className={`topbar__status ${dirtyCount ? "topbar__status--dirty" : ""}`}>{dirtyCount ? <span className="unsaved-mark" /> : <CircleCheck size={14} strokeWidth={1.8} />}{dirtyCount ? `${dirtyCount} ${t("sin guardar", "unsaved")}` : t("Guardado", "Saved")}</div>}
        </header>
        <div className={`workspace-view ${workspaceView === "chat" ? "" : "workspace-view--hidden"}`}>
          <ChatPane project={project} openFiles={openFiles} settings={aiSettings} sidebarOpen={sidebarOpen} onConfigure={() => setProviderOpen(true)} onSettingsChange={setAiSettings} onFilesChanged={reloadChangedFiles} />
        </div>
        <div className={`workspace-view ${workspaceView === "files" ? "" : "workspace-view--hidden"}`}>
          {project ? <Suspense fallback={<div className="editor-loading">{t("Preparando editor…", "Preparing editor…")}</div>}><EditorPane files={openFiles} activePath={activePath} saving={saving} onActivate={setActivePath} onChange={updateContent} onClose={closeFile} onSave={(path) => void saveFile(path)} onSaveAll={() => void saveAll()} /></Suspense> : <section className="welcome-state"><div className="welcome-state__icon"><FolderOpen size={22} strokeWidth={1.7} /></div><h1>{t("Abre un proyecto", "Open a project")}</h1><p>{t("Selecciona una carpeta para comenzar.", "Select a folder to get started.")}</p><button className="primary-button primary-button--large" onClick={chooseFolder}><FolderOpen size={16} strokeWidth={1.8} />{t("Abrir carpeta", "Open folder")}</button><small>{t("Tus archivos permanecen en tu equipo.", "Your files stay on your computer.")}</small></section>}
        </div>
      </main>

      <div className="notice-stack" aria-live="polite">{notices.map((notice) => <div key={notice.id} className={`notice notice--${notice.tone}`}>{notice.message}<button onClick={() => setNotices((current) => current.filter((item) => item.id !== notice.id))} aria-label="Cerrar aviso"><X size={14} /></button></div>)}</div>
      {dialog && <ActionDialog request={dialog} busy={dialogBusy} error={dialogError} onCancel={() => !dialogBusy && setDialog(null)} onConfirm={(value) => void confirmDialog(value)} />}
      {providerOpen && aiSettings && <ProviderPanel projectPath={project?.path ?? null} settings={aiSettings} onChange={setAiSettings} onClose={() => setProviderOpen(false)} />}
      {preferencesOpen && <PreferencesPanel onClose={() => setPreferencesOpen(false)} onOpenProviders={() => { setPreferencesOpen(false); setProviderOpen(true); }} />}
    </div>
  );
}

export default App;
