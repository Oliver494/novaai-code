# Architecture

NovaAI Code is a Tauri desktop application:

- React and TypeScript provide the UI, conversations, editor, provider configuration, and local preferences.
- Rust owns filesystem boundaries, provider HTTP requests, credential access, timeouts, cancellation, recovery snapshots, safe command execution, Git inspection, and hardware diagnostics.
- The frontend never receives a stored API key.
- Project paths are canonicalized and checked against traversal, symlinks, ignored directories, and Windows-invalid names.
- Provider adapters normalize model listing, streaming, cancellation, and diagnostic errors behind a common configuration shape.

The project intentionally keeps agent mutations separate from provider networking. A model proposes structured operations; Nova validates, previews, approves, snapshots, and applies them locally.
