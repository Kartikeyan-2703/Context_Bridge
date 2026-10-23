declare const chrome: {
  tabs: { query(queryInfo: { active: boolean; currentWindow: boolean }): Promise<Array<{ id?: number; url?: string }>>; sendMessage(tabId: number, message: unknown): Promise<unknown> };
  downloads: { download(options: { url: string; filename: string; saveAs: boolean }): Promise<number> };
  runtime: { onMessage: { addListener(callback: (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean | void): void } };
};
