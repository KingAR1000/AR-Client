import { invoke, isTauri } from "@tauri-apps/api/core";
export type Profile = {
  id: string;
  name: string;
  version: string;
  loader: string;
  loaderVersion: string;
  ram: number;
  java: string;
  preset: string;
};
export type Account = {
  id: string;
  name: string;
  skin?: string;
  capes: { id: string; alias: string; url: string }[];
};
export type LauncherState = {
  profiles: Profile[];
  accounts: Account[];
  activeAccount: string | null;
  settings: {
    microsoftClientId: string;
    eulaAccepted: boolean;
    recoveredFromBackup?: boolean;
  };
  running: string[];
  version: string;
  curseforgeConfigured: boolean;
  companions: { minecraft: string; minLoader: string }[];
};
export type Content = {
  source: string;
  projectId: string;
  versionId: string;
  filename: string;
  kind: string;
};
export const desktop = isTauri();
export async function request<T = unknown>(
  action: string,
  args: unknown = {},
): Promise<T> {
  if (!desktop)
    throw new Error(
      "Open the AR Client desktop application to use this feature. This browser only displays the interface.",
    );
  return invoke<T>("request", { action, args });
}
export function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
export function fileData(file: File): Promise<string> {
  if (file.size > 256 * 1024 * 1024)
    return Promise.reject(new Error("Maximum import size is 256 MiB."));
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}
export function loaderChoices(data: unknown): string[] {
  if (!Array.isArray(data)) return [];
  return data
    .map((v) => (typeof v === "string" ? v : v?.loader?.version))
    .filter((v): v is string => typeof v === "string");
}

// Versions are ordered by Mojang, never by numeric comparison: 26.x follows 1.21.x.
export function preferredRelease(latest: string, versions: string[]): string {
  return versions.includes(latest) ? latest : versions[0] || "";
}

export function defaultRuntime(
  version: string,
  companions: { minecraft: string; minLoader: string }[],
) {
  const build = companions.find((candidate) => candidate.minecraft === version);
  return {
    loader: build ? "fabric" : "vanilla",
    loaderVersion: build?.minLoader || "",
  };
}

export type Page =
  | "Home"
  | "Play"
  | "Installations"
  | "Mods"
  | "Resource Packs"
  | "Modpacks"
  | "Skins"
  | "Accounts"
  | "Updates"
  | "Settings"
  | "HUD Editor";
export type Run = <T>(
  label: string,
  fn: () => Promise<T>,
) => Promise<T | undefined>;
export type Widget = {
  id: string;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  color: string;
  enabled: boolean;
};
