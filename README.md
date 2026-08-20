# NovaAI Code

<p align="center">
  <strong>A local-first AI coding assistant for Windows that explains what is happening.</strong>
</p>

<p align="center">
  <a href="https://github.com/Oliver494/novaai-code/releases/latest"><img src="https://img.shields.io/github/v/release/Oliver494/novaai-code?display_name=tag&sort=semver" alt="Latest release"></a>
  <a href="https://github.com/Oliver494/novaai-code/actions/workflows/ci.yml"><img src="https://github.com/Oliver494/novaai-code/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0 license"></a>
</p>

<p align="center">
  <a href="https://github.com/Oliver494/novaai-code/releases/latest">Download for Windows</a> ·
  <a href="README.es.md">Español</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

NovaAI Code lets you open a real project folder, explore and edit its files, then work with local or cloud AI models. It is designed around a simple rule: **never leave the user staring at a spinner without knowing what failed or what happens next.**

There is no NovaAI Code account, hosted project copy, or required subscription. Bring your own local model or provider API key.

> **Early beta.** Make a backup or use Git before allowing an agent to edit important work. NovaAI Code always asks for approval unless you intentionally choose a broader permission mode.

## Highlights

- **Local AI first** — Ollama and LM Studio are first-class providers.
- **Cloud providers when you need them** — OpenAI, Anthropic, Google Gemini, NVIDIA API, Z.AI, Kimi, and custom OpenAI-compatible endpoints.
- **Real project workspace** — open multiple folders, browse files, edit with syntax highlighting, and save safely.
- **Agent mode with control** — review proposed changes, approve or reject actions, inspect diffs, and restore recent operations.
- **Clear diagnostics** — connection tests, timeouts, cancellation, provider-specific explanations, and recommended next steps.
- **Your data stays under your control** — API keys use the operating-system credential store; NovaAI Code does not put them in the repository or browser storage.
- **Made for everyday development** — chats per project, pinned conversations, search, image/file attachments, themes, and 12 interface languages.

## Download and install

Download the latest Windows installer from [Releases](https://github.com/Oliver494/novaai-code/releases/latest), run it, and open NovaAI Code.

End users do **not** need Node.js, Rust, Git, Ollama, or LM Studio to install the app. You only need Ollama or LM Studio if you want to use local models.

Windows may show a SmartScreen warning while the project does not yet have a trusted code-signing certificate. Always download installers from this repository's official Releases page.

## Quick start

1. Install NovaAI Code from [Releases](https://github.com/Oliver494/novaai-code/releases/latest).
2. Create or open a project folder.
3. Choose **NovaAI** for normal chat or **NovaAI Code** to work on a project.
4. Select a provider and use **Test connection** before chatting.
5. Choose a model and ask a question.
6. When the agent proposes file changes, inspect the diff and approve or reject it.

For local models, start Ollama or LM Studio first. NovaAI Code detects common problems such as an offline server, missing model, invalid endpoint, expired quota, timeout, or invalid API key.

## Providers

| Local | Cloud | Custom |
| --- | --- | --- |
| Ollama | OpenAI | OpenAI-compatible endpoints |
| LM Studio | Anthropic | Your endpoint, model, and API key |
|  | Google Gemini |  |
|  | NVIDIA API |  |
|  | Z.AI |  |
|  | Kimi |  |

Provider availability depends on your own installation, account, billing, model access, and network connection. NovaAI Code never includes provider API keys in source control.

## What NovaAI Code can do today

### Work with projects

- Open, remember, and switch between multiple project folders.
- Browse folder trees while respecting `.gitignore` and common generated/cache directories.
- Create, rename, edit, save, and delete project files and folders.
- Use tabs, syntax highlighting, line numbers, safe atomic saves, and file-type icons.
- Attach open files, uploaded files, and pasted images to a chat.

### Talk to models reliably

- Stream responses with real stop/cancel support.
- Set connection, first-response, inactivity, and maximum request timeouts.
- Test a provider before using it and get actionable diagnostics when it fails.
- Choose models directly from the chat and select reasoning effort when the provider supports it.
- Keep conversations separate by project and mode.

### Use the coding agent safely

- Let the model propose file creation, edits, renames, folders, and deletions.
- Review every proposed change in a diff before applying it.
- Use request-by-request approval, automatic approval for the task, or a deliberate full-access mode.
- Authorize an additional external folder as **read-only** or **editable**; the model cannot access it until you explicitly select it.
- Run a restricted set of project build/test/check commands with approval.
- Recover recent agent file operations from local snapshots.

## Security and privacy

NovaAI Code is intentionally conservative about file access and commands:

- It rejects absolute paths, `..` traversal, unsafe Windows names, symlink traversal, ignored folders, shell operators, and unrestricted system commands.
- Agent changes stay inside the open project or an external folder you explicitly authorize.
- API keys are saved through the operating-system credential store and are not displayed after saving.
- Cloud providers receive only the messages, attachments, and project context included in the request.

Read [SECURITY.md](SECURITY.md) before enabling agent permissions and [PRIVACY.md](PRIVACY.md) for the data-handling details. To report a vulnerability, follow [SECURITY.md](SECURITY.md) rather than opening a public issue.

## Development

### Requirements

- Node.js 22 or newer
- Rust stable
- Microsoft C++ Build Tools and the WebView2 requirements for Tauri 2

### Run locally

```bash
npm install
npm run tauri dev
```

### Run checks

```bash
npm run check
```

### Build the Windows installer

```bash
npm run tauri -- build
```

See [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/QA.md](docs/QA.md), and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more detail.

## Contributing

Issues, design feedback, documentation improvements, provider integrations, and code contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

## Project status

NovaAI Code is actively developed. Check [ROADMAP.md](ROADMAP.md) for planned work and [CHANGELOG.md](CHANGELOG.md) for released changes.

## Independence and trademarks

NovaAI Code is an independent project. It is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, NVIDIA, Ollama, LM Studio, Z.AI, Kimi, or any other supported provider. Provider names and logos belong to their respective owners; see [TRADEMARKS.md](TRADEMARKS.md).

## License

NovaAI Code is licensed under the [Apache License 2.0](LICENSE).
