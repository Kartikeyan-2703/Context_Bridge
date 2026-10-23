# Chrome extension

```powershell
npm.cmd run build --workspace context-bridge-chrome
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/chrome/dist`.

The MV3 popup captures selected text or visible content only from `chatgpt.com`, the legacy `chat.openai.com`, and `claude.ai`, offers an editable preview, validates a local unverified handoff, and downloads its artifacts after a user click. It requests only `activeTab` and `downloads` plus narrow host access. It does not read browsing history, silently upload data, or contain an API key. Dynamic pages can expose only part of a conversation; paste a manual transcript when necessary.
