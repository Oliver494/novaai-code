import { invoke } from "@tauri-apps/api/core";

export type ModelFit = { size: string; rating: "excellent" | "acceptable" | "not_recommended"; requiredRamGb: number; requiredVramGb: number };
export type HardwareInfo = { cpu: string; physicalCores: number; logicalCores: number; ramBytes: number; availableRamBytes: number; diskAvailableBytes: number | null; gpu: string | null; vramBytes: number | null; recommendations: ModelFit[] };
export type GitStatus = { installed: boolean; repository: boolean; branch: string | null; changes: string[]; diagnostic: string | null };

export const localSystem = {
  hardware: (root: string | null) => invoke<HardwareInfo>("inspect_hardware", { root }),
  gitStatus: (root: string) => invoke<GitStatus>("git_status", { root }),
  gitDiff: (root: string) => invoke<string>("git_diff", { root }),
  gitCommit: (root: string, message: string) => invoke<string>("git_commit", { root, message }),
  gitDiscardChanges: (root: string) => invoke<string[]>("git_discard_changes", { root }),
};
