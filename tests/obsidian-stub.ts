export class TFile {
  path = "";
  extension = "json";
}

export class TFolder {
  path = "";
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

let requestHandler: ((params: Record<string, unknown>) => Promise<{ status: number; text: string }>) | null = null;

export function setTestRequestHandler(handler: typeof requestHandler): void {
  requestHandler = handler;
}

export async function requestUrl(params: Record<string, unknown>): Promise<{ status: number; text: string }> {
  if (!requestHandler) throw new Error("requestUrl is not available in unit tests");
  return requestHandler(params);
}

export function getLanguage(): string {
  return "en";
}

export function setIcon(): void {}

export class ItemView { constructor(..._args: unknown[]) {} }
export class Modal {}
export class Setting {}
export class Notice {}
