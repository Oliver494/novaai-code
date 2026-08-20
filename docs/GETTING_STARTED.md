# Getting started

1. Install NovaAI Code with the Windows installer.
2. Add a project folder. Nova restricts file operations to this folder and ignores generated or protected directories.
3. Open **Settings → Providers** and choose Ollama, LM Studio, or a cloud API.
4. Use **Test connection** before opening a chat.
5. Start with **Ask for approval** until you are comfortable with the proposed diffs and recovery workflow.

Nova stores conversations per project. Provider keys are stored through the Windows credential store, not in project files or browser local storage.

## Local providers

- Ollama default endpoint: `http://127.0.0.1:11434`
- LM Studio default endpoint: `http://127.0.0.1:1234/v1`

Open **Settings → Hardware** for approximate quantized-model recommendations based on RAM and detected VRAM. Driver limitations can prevent exact VRAM detection.

## Safety and recovery

- Review the proposed before/after diff before applying changes.
- Nova creates a recovery snapshot before agent file operations.
- Restore a snapshot from **Settings → Recovery**.
- **Settings → Git** shows status and diff, can create a confirmed local commit, and can discard pending changes. Discard always creates a local recovery snapshot first and requires an existing base commit.
- Interrupted chats preserve the last question and offer a retry after restart.
