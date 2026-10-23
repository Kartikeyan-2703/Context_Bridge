# Context Bridge

Context Bridge creates local, reviewable handoff packages for moving coding context between AI tools. A package contains `HANDOFF.md`, validated `handoff.json`, and `evidence-index.json`.

It is free software with no product tiers. Hosted inference, when configured, can require a provider account, API key, quota, and hosting spend; Context Bridge does not claim otherwise.

## Quick start (Windows PowerShell)

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run context-bridge -- inspect
npm.cmd run context-bridge -- handoff --objective "Continue the current task"
```

Node.js 24+ and npm 11+ are the tested runtime in this repository. See [CLI guide](docs/cli.md), [architecture](docs/architecture.md), and [privacy and security](docs/privacy-and-security.md).

## What works now

- Shared strict schema, evidence relationships, normalization, redaction, and deterministic artifacts.
- Local Git inspection/evidence collection and a Windows-safe Node CLI.
- A local Node HTTP backend with an OpenAI-compatible provider adapter, consent gate, limits, and schema validation.
- VS Code command foundation and Chrome MV3 local capture/download foundation.

The browser and session import paths are intentionally conservative. They do not claim complete-history access; review selected content before generating a handoff.
