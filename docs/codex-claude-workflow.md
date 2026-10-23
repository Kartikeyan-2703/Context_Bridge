# Codex to Claude Code workflow

1. In the Codex session, save or copy only the relevant transcript to a user-chosen text file. Do not assume a private session-storage format is stable or complete.
2. Inspect the repository locally with `npm.cmd run context-bridge -- inspect --repo C:\work\project`.
3. Create the local handoff with `npm.cmd run context-bridge -- handoff --repo C:\work\project --transcript C:\selected\codex-transcript.txt --objective "Continue the task"`. This includes the selected transcript as unverified evidence and uploads nothing.
4. Validate with the CLI. Do not mark tests or fixes successful without appropriate verified evidence.
5. Give Claude Code the generated `HANDOFF.md` and `handoff.json`, plus only approved artifacts. Instruct it to inspect the repository and verify untrusted claims before editing.

No automatic Codex or Claude Code session-file parser is advertised because no stable, approved local format has been confirmed in this implementation.
