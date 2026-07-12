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

export async function requestUrl(): Promise<never> {
  throw new Error("requestUrl is not available in unit tests");
}

export function getLanguage(): string {
  return "en";
}

export function setIcon(): void {}
