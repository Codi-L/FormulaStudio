import type { GuestStore } from "./domain/models";

export type DesktopPreferences = {
  dataDirectory: string;
  dataFile: string;
  nutstore: {
    enabled: boolean;
    username: string;
    remoteFile: string;
    autoSync: boolean;
    intervalMinutes: number;
    syncOnSave: boolean;
    hasPassword: boolean;
    lastSyncAt: string;
    lastSyncError: string;
  };
};

declare global {
  interface Window {
    formulaStudio?: {
      platform: NodeJS.Platform;
      storage: {
        list(): Promise<GuestStore>;
        backup(): Promise<{ app: "调香手记"; version: 1; syncRevision: number; exportedAt: string; data: GuestStore }>;
        mutate(action: string, payload: unknown): Promise<GuestStore>;
        replace(store: GuestStore): Promise<GuestStore>;
        onChanged(callback: () => void): () => void;
      };
      preferences: {
        get(): Promise<DesktopPreferences>;
        chooseDirectory(): Promise<string | null>;
        save(preferences: unknown): Promise<DesktopPreferences>;
      };
      nutstore: {
        test(settings: unknown): Promise<{ ok: boolean }>;
        sync(): Promise<{ direction: "upload" | "download" | "cancel"; store: GuestStore; syncRevision: number }>;
      };
    };
  }
}

export {};
