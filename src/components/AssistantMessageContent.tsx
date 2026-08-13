import { Check, Clipboard } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePreferences } from "../services/preferences";

type Segment =
  | { type: "text"; value: string }
  | { type: "code"; value: string; language: string };

function splitCodeBlocks(content: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = /```([^\r\n`]*)\r?\n([\s\S]*?)```/g;
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ type: "text", value: content.slice(cursor, start) });
    segments.push({
      type: "code",
      language: match[1].trim() || "Código",
      value: match[2].replace(/\r?\n$/, ""),
    });
    cursor = start + match[0].length;
  }
  if (cursor < content.length) segments.push({ type: "text", value: content.slice(cursor) });
  return segments;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const { t } = usePreferences();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <section className="assistant-code-block">
    <header><span>{language}</span><button type="button" onClick={() => void copy()} aria-label={t("Copiar código", "Copy code")} title={t("Copiar código", "Copy code")}>{copied ? <Check size={13} /> : <Clipboard size={13} />}<span>{copied ? t("Copiado", "Copied") : t("Copiar", "Copy")}</span></button></header>
    <pre><code>{code}</code></pre>
  </section>;
}

export function AssistantMessageContent({ content }: { content: string }) {
  return <div className="assistant-message-content">{splitCodeBlocks(content).map((segment, index) => segment.type === "code"
    ? <CodeBlock key={`code-${index}`} code={segment.value} language={segment.language} />
    : segment.value ? <span className="assistant-message-text" key={`text-${index}`}>{segment.value}</span> : null)}</div>;
}
