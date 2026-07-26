import type { GuestStore } from "../domain/models";

const LOCAL_STORAGE_KEY = "formula-studio:local-data:v1";
const LEGACY_STORAGE_KEY = "scent-formula-studio:guest-data:v1";

export const emptyGuestStore = (): GuestStore => ({ formulas: [], materials: [], groups: [], settings: [] });

export function readGuestStore(): GuestStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "null") as Partial<GuestStore> | null;
    return {
      formulas: Array.isArray(parsed?.formulas) ? parsed.formulas : [],
      materials: Array.isArray(parsed?.materials) ? parsed.materials : [],
      groups: Array.isArray(parsed?.groups) ? parsed.groups : [],
      settings: Array.isArray(parsed?.settings) ? parsed.settings : [],
    };
  } catch {
    return emptyGuestStore();
  }
}

export function writeGuestStore(store: GuestStore) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
}

export async function syncLocalStore(action: string, payload: unknown = {}): Promise<any> {
  const store = readGuestStore();
  const body = payload as { kind?: keyof GuestStore; id?: string; record?: { id: string } };
  if (action === "list") return store;
  const kind = body.kind;
  const mutable = store as unknown as Record<string, Array<{ id: string }>>;
  if (action === "save" && kind && body.record && Array.isArray(mutable[kind])) {
    const records = mutable[kind];
    const index = records.findIndex(item => item.id === body.record!.id);
    if (index >= 0) records[index] = body.record;
    else records.unshift(body.record);
    writeGuestStore(store);
    return { ok: true };
  }
  if (action === "delete" && kind && body.id && Array.isArray(mutable[kind])) {
    mutable[kind] = mutable[kind].filter(item => item.id !== body.id);
    writeGuestStore(store);
    return { ok: true };
  }
  throw new Error("Bad local storage request");
}
