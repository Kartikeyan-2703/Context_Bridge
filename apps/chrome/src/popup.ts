import { generateBrowserArtifacts } from "./draft.js";

const content = document.querySelector<HTMLTextAreaElement>("#content")!;
const objective = document.querySelector<HTMLInputElement>("#objective")!;
const status = document.querySelector<HTMLElement>("#status")!;
let sourceUrl: string | undefined;

function download(filename: string, text: string): Promise<number> {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  return chrome.downloads.download({ url, filename, saveAs: true }).finally(() => URL.revokeObjectURL(url));
}

document.querySelector("#capture")!.addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab.");
    const captured = await chrome.tabs.sendMessage(tab.id, { type: "context-bridge-capture" }) as { content?: string; incomplete?: boolean; url?: string };
    if (!captured.content) throw new Error("No visible content available. Paste a transcript manually instead.");
    content.value = captured.content; sourceUrl = captured.url; status.textContent = captured.incomplete ? "Captured visible content only; the conversation may be incomplete. Review it below." : "Captured selected content.";
  } catch { status.textContent = "Capture is unavailable on this page. Paste a manually selected transcript instead."; }
});

document.querySelector("#generate")!.addEventListener("click", async () => {
  try {
    if (!content.value.trim() || !objective.value.trim()) throw new Error("Add both an objective and content.");
    const artifacts = generateBrowserArtifacts(content.value, objective.value, sourceUrl);
    await Promise.all([download("HANDOFF.md", artifacts.markdown), download("handoff.json", artifacts.json), download("evidence-index.json", artifacts.evidenceIndex)]);
    status.textContent = "Validated handoff downloaded locally. No content was uploaded.";
  } catch (error) { status.textContent = error instanceof Error ? error.message : "Could not generate the handoff."; }
});
