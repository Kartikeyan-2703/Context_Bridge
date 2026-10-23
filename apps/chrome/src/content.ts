chrome.runtime.onMessage.addListener((message: unknown, _sender, respond) => {
  if ((message as { type?: string }).type !== "context-bridge-capture") return;
  const selected = window.getSelection()?.toString().trim();
  const visible = (document.querySelector("main")?.innerText || document.body.innerText).trim();
  const content = selected || visible.slice(0, 100_000);
  respond({ content, incomplete: !selected, url: location.href });
  return true;
});
