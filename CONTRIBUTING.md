# Contributing to NovaAI Code

Thank you for helping improve NovaAI Code.

## Before starting

1. Search existing issues and pull requests.
2. For large behavior or architecture changes, open a proposal first.
3. Keep each pull request focused and explain user-visible behavior.

## Local setup

```bash
npm install
npm run tauri dev
```

Before submitting:

```bash
npm run test:all
```

## Requirements

- Do not commit API keys, tokens, credentials, private project data, or generated installers.
- Preserve project-root and symlink protections.
- Add tests for provider parsing, filesystem changes, permissions, timeouts, and cancellation.
- Add every new interface string through the translation system; the translation test must pass.
- Never hide a long operation behind an unexplained spinner.
- Keep provider-specific behavior out of shared UI components.

## Commits and pull requests

- Use a short imperative title.
- Describe the problem, solution, risk, and verification performed.
- Include screenshots for visible UI changes.
- State whether the change sends any new data outside the computer.

By contributing, you agree that your contribution is licensed under Apache-2.0.
