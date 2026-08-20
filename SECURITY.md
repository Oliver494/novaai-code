# Security policy

## Supported versions

Only the newest published release receives security fixes during the early beta.

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Use GitHub's private vulnerability reporting feature when it is enabled for the repository. Until then, contact the repository owner privately through the contact method shown on their GitHub profile.

Include the affected version, reproduction steps, impact, and whether credentials or files outside the selected project can be reached. Never include a real API key.

## Security boundaries

- NovaAI Code may read and modify files inside the project explicitly selected by the user.
- Symlinks and path traversal are rejected.
- Agent commands use an allowlist and do not invoke a shell.
- API keys are stored using the operating-system credential manager and must not appear in logs or project files.
- Cloud providers receive selected project context; local providers keep requests on the configured local endpoint.
- “Full access” does not authorize access outside the project or unrestricted system commands.

## User precautions

Use source control or backups, review proposed changes, start with “Ask for approval,” and only use providers you trust. Revoke any key that has been pasted into a public issue, screenshot, log, or chat.
