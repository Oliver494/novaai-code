import { Icon } from "@iconify/react";
import css3 from "@iconify-icons/devicon/css3";
import html5 from "@iconify-icons/devicon/html5";
import javascript from "@iconify-icons/devicon/javascript";
import json from "@iconify-icons/devicon/json";
import markdown from "@iconify-icons/devicon/markdown";
import nodejs from "@iconify-icons/devicon/nodejs";
import python from "@iconify-icons/devicon/python";
import react from "@iconify-icons/devicon/react";
import typescript from "@iconify-icons/devicon/typescript";
import { FileCode2, FileText } from "lucide-react";

type Props = { name: string; size?: number; className?: string };

const fileIcons = {
  html: html5,
  css: css3,
  javascript,
  typescript,
  python,
  react,
  json,
  markdown,
  node: nodejs,
} as const;

function iconFor(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (["html", "htm"].includes(extension)) return fileIcons.html;
  if (["css", "scss", "sass", "less"].includes(extension)) return fileIcons.css;
  if (["js", "mjs", "cjs"].includes(extension)) return fileIcons.javascript;
  if (extension === "ts") return fileIcons.typescript;
  if (["jsx", "tsx"].includes(extension)) return fileIcons.react;
  if (extension === "py") return fileIcons.python;
  if (extension === "json") return fileIcons.json;
  if (["md", "mdx"].includes(extension)) return fileIcons.markdown;
  if (["node", "nodejs"].includes(extension)) return fileIcons.node;
  return null;
}

export function FileTypeIcon({ name, size = 15, className = "" }: Props) {
  const icon = iconFor(name);
  return <span className={`file-type-icon ${className}`.trim()} aria-hidden="true">
    {icon ? <Icon icon={icon} width={size} height={size} /> : name.includes(".") ? <FileCode2 size={size} strokeWidth={1.8} /> : <FileText size={size} strokeWidth={1.8} />}
  </span>;
}
