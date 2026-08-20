# Manual QA matrix

Record the application version, Windows version, provider version, model, result, and diagnostic shown.

## Installation and projects

- Install and uninstall on a clean Windows 11 virtual machine.
- Open paths containing spaces, accents, long names, and read-only files.
- Open a large repository and confirm the UI remains responsive.
- Open Hardware and verify CPU, RAM, storage, optional GPU/VRAM, and model-fit ratings.
- Confirm `.git`, `node_modules`, build output, symlinks, and `.gitignore` entries are excluded.
- Attempt `..`, absolute paths, reserved Windows names, and symlink escapes.

## Providers

For every provider: valid configuration, invalid key, invalid endpoint, unavailable model, timeout, interrupted stream, oversized context, cancellation, and model refresh.

For Ollama and LM Studio: application missing, server stopped, no model loaded, model download interrupted, and offline operation.

Paid API smoke tests must use a small prompt and a dedicated low-limit key. Never use production credentials in automated tests.

## Chat and agent

- Run simultaneous activity across two chats and verify state isolation.
- Switch project, view, model, and chat during streaming without accidental cancellation.
- Force-close Nova during a response and confirm the chat offers a retry after restart.
- Verify automatic context lists `file:start-end` references and final applied changes retain a diff.
- Paste supported and unsupported images.
- Review, reject, and apply create/write/rename/delete actions.
- Verify destructive actions require approval and cannot leave the project.
- Restore an agent recovery point and verify changed, created, renamed, and deleted files return to their earlier state.
- Open Doctor with and without a project/provider, then test a valid and an invalid connection.
- Stop tests/builds and confirm child processes terminate.
- Verify Git status/diff works outside a repository without hanging; verify commit and discard require confirmation, and that discarded changes appear in Recovery.

## Release

- Verify version, icon, installer, uninstall entry, first launch, update check, links, license, and acknowledgements.
- Scan the repository and installer with trusted security tools.
- Confirm no API key, local path, private project content, or credential appears in source, logs, screenshots, or release assets.
