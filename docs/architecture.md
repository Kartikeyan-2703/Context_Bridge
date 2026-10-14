# Context Bridge Architecture

## Purpose

Context Bridge transfers coding and conversation context between AI tools, preserving implementation history, debugging attempts, successful fixes, decisions, and unfinished work.

## Interfaces

- Chrome extension: Captures and transfers browser-based AI conversations.
- VS Code extension: Provides the coding-agent handoff interface.
- CLI: Collects session records and repository evidence and generates handoff packages.

## Shared Core

The shared TypeScript package owns the common context schema, normalization, deduplication, evidence references, validation, and handoff generation.

## LLM Processing

The backend uses a hosted LLM to transform normalized source records into structured context. The returned output must be validated before it is accepted.

## Storage

SQLite stores local metadata and handoff history. Raw transcripts, diffs, and other artifacts are stored separately with appropriate access controls.

## Handoff Artifacts

- HANDOFF.md
- handoff.json
- evidence-index.json
- Relevant, user-approved supporting artifacts

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