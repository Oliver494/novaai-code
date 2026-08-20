# Privacy

NovaAI Code does not require a NovaAI account and does not include advertising or analytics telemetry.

## Data stored locally

- Project list and interface preferences.
- Conversation history scoped to each project.
- Provider endpoints, selected models, and timeout settings.
- API keys in the operating-system credential store, not in project files or browser local storage.

## Data sent to providers

When using Ollama or LM Studio, requests are sent to the configured local endpoint. When using a cloud provider, messages, attached files/images, and selected project context are sent directly to that provider under its own terms and privacy policy.

NovaAI Code should show the files attached to a request. Do not attach secrets, private keys, `.env` files, customer data, or source code you are not allowed to share.

## Updates

The application can contact GitHub to check public NovaAI Code releases. The check sends the normal network information required for an HTTPS request; NovaAI Code does not add a user identifier.

## Deleting data

Chats can be deleted from the application. Provider keys can be removed from provider settings. Removing a project from NovaAI Code does not delete the project folder itself.
