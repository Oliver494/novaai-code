import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { AiFileChange, AiProjectAction, ChatUpload, ContextReference, FileNode, ProjectInfo, RecoverySnapshotInfo } from "../types";

type FileContent = {
  path: string;
  relativePath: string;
  content: string;
  size: number;
};

export async function chooseProjectFolder() {
  const selected = await open({ directory: true, multiple: false, title: "Abrir carpeta en NovaAI Code" });
  return typeof selected === "string" ? selected : null;
}

export async function chooseExternalFolder() {
  const selected = await open({ directory: true, multiple: false, title: "Autorizar carpeta adicional para NovaAI Code" });
  return typeof selected === "string" ? selected : null;
}

export async function chooseChatFiles() {
  const selected = await open({ directory: false, multiple: true, title: "Adjuntar a la conversación" });
  return Array.isArray(selected) ? selected : selected ? [selected] : [];
}

export const projectFiles = {
  openProject: (path: string) => invoke<ProjectInfo>("open_project", { path }),
  scan: (root: string) => invoke<FileNode[]>("scan_project", { root }),
  read: (root: string, relativePath: string) =>
    invoke<FileContent>("read_project_file", { root, relativePath }),
  write: (root: string, relativePath: string, content: string) =>
    invoke<void>("write_project_file", { root, relativePath, content }),
  create: (root: string, relativePath: string, directory: boolean) =>
    invoke<void>("create_project_item", { root, relativePath, directory }),
  rename: (root: string, relativePath: string, newName: string) =>
    invoke<void>("rename_project_item", { root, relativePath, newName }),
  remove: (root: string, relativePath: string) =>
    invoke<void>("delete_project_item", { root, relativePath }),
  reveal: (path: string) => revealItemInDir(path),
  loadAttachment: (path: string) => invoke<Omit<ChatUpload, "id">>("load_chat_attachment", { path }),
  contextPreview: (root: string, prompt: string) => invoke<ContextReference[]>("preview_project_context", { root, prompt }),
  applyAiChanges: (root: string, changes: AiFileChange[]) => invoke<string[]>("apply_ai_changes", { root, changes }),
  applyAiActions: (root: string, actions: AiProjectAction[]) => invoke<string[]>("apply_ai_actions", { root, actions }),
  recoverySnapshots: (root: string) => invoke<RecoverySnapshotInfo[]>("list_recovery_snapshots", { root }),
  restoreRecovery: (root: string, snapshotId: string) => invoke<string[]>("restore_recovery", { root, snapshotId }),
};

export function errorMessage(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}
