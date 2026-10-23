# Context Bridge Architecture

## Purpose

Context Bridge transfers coding and conversation context between AI tools, preserving implementation history, debugging attempts, successful fixes, decisions, and unfinished work.

## Interfaces

- Chrome extension: Captures and transfers browser-based AI conversations.
- VS Code extension: Provides the coding-agent handoff interface.
- CLI: Collects session records and repository evidence and generates handoff packages.

## Shared Core

The shared TypeScript package owns the common context schema, normalization, redaction, evidence references, validation, and handoff generation. It is the only schema authority; clients do not duplicate validation rules.

## LLM Processing

The backend is a Node HTTP service with a provider adapter. Its included adapter targets an OpenAI-compatible chat-completions endpoint, but the adapter interface is replaceable. Explicitly submitted records are normalized, constrained in a prompt, passed to the provider, then rejected unless the structured output validates against the shared schema. Model output is never treated as independently verified evidence.

## Storage

There is no persistence layer in the current implementation. Generated handoff artifacts are local files. Raw transcripts and selected repository artifacts are only read when a user chooses them.

## Handoff Artifacts

- HANDOFF.md
- handoff.json
- evidence-index.json

Supporting artifacts are not copied by default.

## Safety

- Preserve original session records.
- Never assume a fix succeeded without supporting evidence.
- Never automatically overwrite project files.
- Keep provider credentials on the backend.
- Flag missing context and uncertain claims.
- Exclude secrets and sensitive records from exports unless explicitly approved.

## Primary Workflow

Codex → Context Bridge → Claude Code

The same context format is used by the Chrome extension, VS Code extension, and CLI.
