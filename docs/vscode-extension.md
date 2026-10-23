# VS Code extension

Build with `npm.cmd run build --workspace context-bridge-vscode`. In VS Code, open `apps/vscode` and press `F5` to launch an Extension Development Host (install the normal VS Code extension-development tooling first).

The commands inspect the local workspace, validate a selected handoff JSON file, generate local artifacts under `.context-bridge`, import a manually selected transcript artifact, and open `HANDOFF.md`. The setting `contextBridge.backendUrl` is only a stored endpoint setting; this foundation does not upload content. Any future upload flow must display the selected content and request explicit confirmation.
