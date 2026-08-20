# NovaAI Code

[Español](README.es.md) · English

NovaAI Code is an open-source, local-first AI coding assistant for Windows. It opens a real project folder, lets you explore and edit files, and connects to local or cloud AI providers without requiring an account with NovaAI Code.

> Early beta: use source control or a backup for important projects. Agent features can modify files and run a restricted set of project commands.

## Why NovaAI Code?

- Local AI first: Ollama and LM Studio are first-class providers.
- Clear failures: connection tests, timeouts, cancellation, and actionable diagnostics.
- Project-aware chat: conversations are isolated and stored per project.
- Reviewable changes: file operations are constrained to the selected project.
- No NovaAI account: provider credentials remain under the user's control.

## Current features

- Open and remember multiple project folders.
- File explorer with `.gitignore` and common build/cache exclusions.
- Multi-tab editor with syntax highlighting and safe atomic saves.
- Create, rename, edit, and delete project files and folders.
- Per-project chat history, pinning, archiving, duplication, and search.
- Manual file/image attachments and clipboard image paste.
- Streaming chat, cancellation, timeouts, and connection diagnostics.
- Ollama, LM Studio, OpenAI, Anthropic, Google Gemini, NVIDIA API, Z.AI, Kimi, and custom OpenAI-compatible endpoints.
- API keys stored through the operating-system credential store.
- Model selection and supported reasoning-effort controls.
- Proposed file operations with review and permission modes.
- Restricted project test/build/check commands with approval.
- Local model catalog for Ollama and LM Studio.
- Light/dark themes and 12 interface languages.
- GitHub Release update notifications.

## Security model

NovaAI Code rejects parent paths, absolute paths, symlink traversal, ignored folders, unsafe Windows names, shell operators, and unrestricted system commands. Cloud providers receive only the messages and context shown or selected for the request.

Read [SECURITY.md](SECURITY.md) before enabling agent permissions and [PRIVACY.md](PRIVACY.md) to understand where project data is sent.

## Install

Download a Windows installer from the repository's Releases page when public releases are available. Windows may show a SmartScreen warning until the project has a trusted code-signing certificate.

End users do not need Node.js or Rust.

## Development

Requirements:

- Node.js 22 or newer
- Rust stable
- Microsoft C++ Build Tools and WebView2 requirements for Tauri 2

```bash
npm install
npm run tauri dev
```

Run checks:

```bash
npm run test:all
```

Build the Windows installer:

```bash
npm run tauri build -- --bundles nsis
```

## Project status

NovaAI Code is under active development. Provider behavior can change upstream, and real-provider smoke tests are documented in [docs/QA.md](docs/QA.md).

See [ROADMAP.md](ROADMAP.md), [CONTRIBUTING.md](CONTRIBUTING.md), and [CHANGELOG.md](CHANGELOG.md).

User and technical documentation: [Getting started](docs/GETTING_STARTED.md), [Troubleshooting](docs/TROUBLESHOOTING.md), [Architecture](docs/ARCHITECTURE.md), and the [local security audit](docs/SECURITY_AUDIT.md).

## Independence and trademarks

NovaAI Code is an independent project and is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, NVIDIA, Ollama, LM Studio, Z.AI, or any other supported provider. All trademarks and logos belong to their respective owners. See [TRADEMARKS.md](TRADEMARKS.md).

## License

Licensed under the [Apache License 2.0](LICENSE).
