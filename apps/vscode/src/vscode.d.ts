declare module "vscode" {
  export const commands: { registerCommand(command: string, callback: (...args: any[]) => unknown): { dispose(): unknown } };
  export const window: { showInformationMessage(message: string): unknown; showErrorMessage(message: string): unknown; showWarningMessage(message: string, ...items: string[]): Promise<string | undefined>; showOpenDialog(options: unknown): Promise<Uri[] | undefined>; showTextDocument(uri: Uri): Promise<unknown> };
  export const workspace: { workspaceFolders: readonly { uri: Uri }[] | undefined; getConfiguration(section?: string): { get<T>(key: string): T | undefined }; fs: { readFile(uri: Uri): Promise<Uint8Array>; writeFile(uri: Uri, content: Uint8Array): Promise<void>; createDirectory(uri: Uri): Promise<void> } };
  export class Uri { static file(path: string): Uri; static joinPath(base: Uri, ...pathSegments: string[]): Uri; fsPath: string; }
  export interface ExtensionContext { subscriptions: { push(...items: { dispose(): unknown }[]): unknown } }
}
