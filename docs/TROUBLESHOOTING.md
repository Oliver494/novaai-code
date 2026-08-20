# Troubleshooting

Start with **Settings → Doctor**. It checks the active project, model, credentials, and provider connection without making automatic paid requests.

## Ollama or LM Studio is offline

Confirm the application is running, its local server is enabled, and the configured endpoint uses `127.0.0.1` with the expected port. Refresh the model list after loading or downloading a model.

## API authentication or quota errors

Replace the stored key, test the connection, and check the provider billing dashboard. A ChatGPT, Claude, or Gemini consumer subscription does not automatically include API credit.

## The model cannot modify files

The selected model must follow Nova's structured action format. Small conversational models may return Markdown instead. Use a coding model with stronger instruction following and verify that the chat has project access.

## Recovery

If a file operation fails midway, Nova attempts an automatic rollback. Manual recovery points are in **Settings → Recovery**. Recovery data remains in the application data directory and never enters the project or Git repository.

## Git

Nova uses fixed Git arguments inside the selected project. Commit creation requires confirmation, stages the displayed project changes, disables hooks and signing prompts, and requires `user.name` and `user.email`. Discarding changes also requires exact confirmation and an existing commit; Nova creates a recovery snapshot before restoring tracked files and removing untracked files. If Git is not installed or the folder is not a repository, the settings page explains that state.
