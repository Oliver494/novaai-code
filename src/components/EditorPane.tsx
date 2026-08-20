import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { FileCode2, Save, SaveAll, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { OpenFile } from "../types";
import { usePreferences } from "../services/preferences";
import { FileTypeIcon } from "./FileTypeIcon";

type Props = {
  files: OpenFile[];
  activePath: string | null;
  saving: boolean;
  onActivate: (path: string) => void;
  onChange: (path: string, content: string) => void;
  onClose: (path: string) => void;
  onSave: (path: string) => void;
  onSaveAll: () => void;
};

async function languageFor(name: string): Promise<Extension> {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["js", "jsx", "mjs", "cjs", "ts", "tsx"].includes(extension ?? "")) { const { javascript } = await import("@codemirror/lang-javascript"); return javascript({ jsx: ["jsx", "tsx"].includes(extension ?? ""), typescript: ["ts", "tsx"].includes(extension ?? "") }); }
  if (extension === "html") return (await import("@codemirror/lang-html")).html();
  if (extension === "css") return (await import("@codemirror/lang-css")).css();
  if (extension === "json") return (await import("@codemirror/lang-json")).json();
  if (extension === "py") return (await import("@codemirror/lang-python")).python();
  if (extension === "rs") return (await import("@codemirror/lang-rust")).rust();
  if (["md", "mdx"].includes(extension ?? "")) return (await import("@codemirror/lang-markdown")).markdown();
  return [];
}

export function EditorPane({ files, activePath, saving, onActivate, onChange, onClose, onSave, onSaveAll }: Props) {
  const { t } = usePreferences();
  const active = files.find((file) => file.relativePath === activePath) ?? null;
  const [language, setLanguage] = useState<Extension>([]);
  useEffect(() => { let current = true; if (!active) { setLanguage([]); return; } void languageFor(active.name).then((value) => { if (current) setLanguage(value); }); return () => { current = false; }; }, [active?.name]);
  const extensions = useMemo(() => active ? [language, EditorView.lineWrapping] : [], [active, language]);

  if (!active) {
    return <div className="editor-empty"><div className="editor-empty__mark"><FileCode2 size={20} strokeWidth={1.7} /></div><h1>{t("Selecciona un archivo", "Select a file")}</h1><p>{t("Ábrelo desde el explorador.", "Open it from the file explorer.")}</p></div>;
  }

  return (
    <section className="editor-area" aria-label={t("Editor de código", "Code editor")}>
      <div className="editor-tabs" role="tablist">
        <div className="editor-tabs__scroll">
          {files.map((file) => {
            const dirty = file.content !== file.savedContent;
            return <div key={file.relativePath} className={`editor-tab ${file.relativePath === activePath ? "editor-tab--active" : ""}`} role="tab" aria-selected={file.relativePath === activePath}>
              <button className="editor-tab__main" onClick={() => onActivate(file.relativePath)} title={file.relativePath}><FileTypeIcon name={file.name} size={14} /><span className="editor-tab__name">{file.name}</span>{dirty && <i aria-label={t("Cambios sin guardar", "Unsaved changes")} title={t("Cambios sin guardar", "Unsaved changes")} />}</button>
              <button className="tab-close" aria-label={`${t("Cerrar", "Close")} ${file.name}`} title={`${t("Cerrar", "Close")} ${file.name}`} onClick={() => onClose(file.relativePath)}><X size={13} strokeWidth={1.8} /></button>
            </div>;
          })}
        </div>
        <div className="editor-actions">
          <button onClick={() => onSave(active.relativePath)} disabled={saving || active.content === active.savedContent} title={`${t("Guardar", "Save")} · Ctrl+S`} aria-label={t("Guardar archivo", "Save file")}><Save size={16} strokeWidth={1.8} /></button>
          <button onClick={onSaveAll} disabled={saving || !files.some((file) => file.content !== file.savedContent)} title={`${t("Guardar todo", "Save all")} · Ctrl+Shift+S`} aria-label={t("Guardar todos los archivos", "Save all files")}><SaveAll size={16} strokeWidth={1.8} /></button>
        </div>
      </div>
      <div className="editor-breadcrumb" title={active.relativePath}><FileTypeIcon name={active.name} size={13} /><span>{active.relativePath}</span></div>
      <CodeMirror value={active.content} height="100%" extensions={extensions} onChange={(value) => onChange(active.relativePath, value)} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, highlightActiveLineGutter: true, autocompletion: false }} className="code-editor" />
      <footer className="editor-status"><span>UTF-8</span><span>{active.content.split("\n").length} {t("líneas", "lines")}</span></footer>
    </section>
  );
}
