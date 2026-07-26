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
    hasPassword: boolean;
    lastSyncAt: string;
    lastSyncError: string;
  };
};

declare global {
  interface Window {
    formulaStudio?: {
      storage: {
        list(): Promise<GuestStore>;
        mutate(action: string, payload: unknown): Promise<GuestStore>;
        replace(store: GuestStore): Promise<GuestStore>;
      };
      preferences: {
        get(): Promise<DesktopPreferences>;
        chooseDirectory(): Promise<string | null>;
        save(preferences: unknown): Promise<DesktopPreferences>;
      };
      nutstore: {
        test(settings: unknown): Promise<{ ok: boolean }>;
        sync(): Promise<{ direction: "upload" | "download"; store: GuestStore }>;
      };
    };
  }
}

export {};
