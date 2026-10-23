# CLI guide

Run from the repository root after `npm.cmd run build`:

```powershell
npm.cmd run context-bridge -- --help
npm.cmd run context-bridge -- doctor
npm.cmd run context-bridge -- inspect --repo C:\work\project
npm.cmd run context-bridge -- collect --repo C:\work\project --include-diff --max-bytes 50000
npm.cmd run context-bridge -- handoff --repo C:\work\project --transcript C:\selected\codex.txt --objective "Continue authentication fix"
npm.cmd run context-bridge -- validate C:\work\project\.context-bridge\handoff.json
npm.cmd run context-bridge -- generate C:\work\project\.context-bridge\handoff.json --out C:\handoffs\auth
```

`handoff` runs only safe Git diagnostics; it does not run tests or commands recorded in transcripts. `collect` excludes paths resembling `.env`, credentials, private keys, dependency directories, build output, and coverage directories. Diffs are only included when `--include-diff` is explicit and are size-limited.

Generation refuses to overwrite `HANDOFF.md`, `handoff.json`, or `evidence-index.json` unless `--overwrite` is given. `--transcript <file>` adds a manually selected transcript as unverified conversation evidence; `import <file>` prints normalized events for inspection. Neither command claims support for undocumented Codex or Claude local-session formats.
