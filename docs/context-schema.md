# Context Bridge Shared Context Schema

## Purpose

The shared schema defines the versioned data contract used by the
Context Bridge CLI, VS Code extension, Chrome extension, and hosted
LLM integration.

## Schema version

Current version: 1.0.0

Breaking changes to required fields, field meanings, or validation rules
should trigger a deliberate schema-versioning decision.

## Main sections

- project: repository name, branch, and commit
- source: source tool and session information
- task: objective, constraints, and environment
- summary: concise description of the current work
- workDone: completed or attempted work
- decisions: architectural and implementation decisions
- debuggingHistory: problems, actions, and outcomes
- changedFiles: paths and change summaries
- commands: executed commands and recorded outcomes
- tests: test statuses and evidence
- currentState: progress, blockers, and next steps
- warnings: risks and caveats
- evidence: source records supporting the handoff

## Evidence principles

1. Every evidence ID must be unique within a handoff.
2. Every evidence reference must resolve to an existing record.
3. A passed test must have verified supporting evidence.
4. A passed test's supporting evidence must be a verified `test_result` record.
5. A successful command must have exit code zero and verified command/Git output evidence.
6. A blocked handoff must name a blocker. A completed handoff cannot have active blockers and needs verified evidence.
7. Unverified information must remain explicitly unverified.
8. The existence of an evidence record does not independently prove
   that its content is authentic or correct.
9. A receiving agent should inspect the repository before editing.

## Output formats

- handoff.json: structured, machine-readable context
- HANDOFF.md: readable context for developers and AI coding agents

Both outputs are generated from the same validated context object.

`evidence-index.json` contains compact metadata only. Generated text is redacted for common credential patterns, and Markdown limits evidence-content previews to 1,000 characters. Redaction is defense in depth, not permission to include secrets.
