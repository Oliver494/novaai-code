import { Channel, invoke } from "@tauri-apps/api/core";
import type { AgentCommandEvent, AgentToolSpec, DetectedCommand } from "../types";

export const agent = {
  tools: () => invoke<AgentToolSpec[]>("list_agent_tools"),
  detectCommands: (root: string) => invoke<DetectedCommand[]>("detect_project_commands", { root }),
  runCommand: (request: { requestId: string; root: string; cwd: string; program: string; args: string[]; timeoutSecs: number }, onEvent: (event: AgentCommandEvent) => void) => {
    const channel = new Channel<AgentCommandEvent>(); channel.onmessage = onEvent;
    return invoke<void>("run_agent_command", { request, onEvent: channel });
  },
  cancel: (requestId: string) => invoke<boolean>("cancel_agent_command", { requestId }),
};
