import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { EditorView } from "@codemirror/view";
import { FileCode2, Save, SaveAll, X } from "lucide-react";
import { useMemo } from "react";
import type { OpenFile } from "../types";
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

function languageFor(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (["js", "jsx", "mjs", "cjs"].includes(extension ?? "")) return javascript({ jsx: true });
  if (["ts", "tsx"].includes(extension ?? "")) return javascript({ jsx: extension === "tsx", typescript: true });
  if (extension === "html") return html();
  if (extension === "css") return css();
  if (extension === "json") return json();
  if (extension === "py") return python();
  if (extension === "rs") return rust();
  if (["md", "mdx"].includes(extension ?? "")) return markdown();
  return [];
}

export function EditorPane({ files, activePath, saving, onActivate, onChange, onClose, onSave, onSaveAll }: Props) {
  const active = files.find((file) => file.relativePath === activePath) ?? null;
  const extensions = useMemo(() => active ? [languageFor(active.name), EditorView.lineWrapping] : [], [active?.name]);

  if (!active) {
    return <div className="editor-empty"><div className="editor-empty__mark"><FileCode2 size={20} strokeWidth={1.7} /></div><h1>Selecciona un archivo</h1><p>Ábrelo desde el explorador.</p></div>;
  }

  return (
    <section className="editor-area" aria-label="Editor de código">
      <div className="editor-tabs" role="tablist">
        <div className="editor-tabs__scroll">
          {files.map((file) => {
            const dirty = file.content !== file.savedContent;
            return <div key={file.relativePath} className={`editor-tab ${file.relativePath === activePath ? "editor-tab--active" : ""}`} role="tab" aria-selected={file.relativePath === activePath}>
              <button className="editor-tab__main" onClick={() => onActivate(file.relativePath)} title={file.relativePath}><FileTypeIcon name={file.name} size={14} /><span className="editor-tab__name">{file.name}</span>{dirty && <i aria-label="Cambios sin guardar" title="Cambios sin guardar" />}</button>
              <button className="tab-close" aria-label={`Cerrar ${file.name}`} title={`Cerrar ${file.name}`} onClick={() => onClose(file.relativePath)}><X size={13} strokeWidth={1.8} /></button>
            </div>;
          })}
        </div>
        <div className="editor-actions">
          <button onClick={() => onSave(active.relativePath)} disabled={saving || active.content === active.savedContent} title="Guardar · Ctrl+S" aria-label="Guardar archivo"><Save size={16} strokeWidth={1.8} /></button>
          <button onClick={onSaveAll} disabled={saving || !files.some((file) => file.content !== file.savedContent)} title="Guardar todo · Ctrl+Shift+S" aria-label="Guardar todos los archivos"><SaveAll size={16} strokeWidth={1.8} /></button>
        </div>
      </div>
      <div className="editor-breadcrumb" title={active.relativePath}><FileTypeIcon name={active.name} size={13} /><span>{active.relativePath}</span></div>
      <CodeMirror value={active.content} height="100%" extensions={extensions} onChange={(value) => onChange(active.relativePath, value)} basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: true, highlightActiveLineGutter: true, autocompletion: false }} className="code-editor" />
      <footer className="editor-status"><span>UTF-8</span><span>{active.content.split("\n").length} líneas</span></footer>
    </section>
  );
}
