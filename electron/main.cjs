const { app, BrowserWindow, dialog, ipcMain, net, safeStorage, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = !app.isPackaged;
const EMPTY_STORE = { formulas: [], materials: [], groups: [], settings: [] };
const DATA_FILE = "formula-studio-data.json";
const PREFERENCES_FILE = "preferences.json";
const NUTSTORE_URL = "https://dav.jianguoyun.com/dav/";
let writeQueue = Promise.resolve();
let saveSyncTimer;
let autoSyncTimer;
let cloudSyncPromise;

const defaultPreferences = () => ({
  theme: process.platform === "darwin" ? "macos" : "windows",
  dataDirectory: path.join(app.getPath("documents"), "Formula Studio"),
  nutstore: { enabled: false, username: "", remoteFile: "/FormulaStudio/FormulaStudio-backup.json", autoSync: true, intervalMinutes: 10, syncOnSave: true },
});

const preferencesPath = () => path.join(app.getPath("userData"), PREFERENCES_FILE);

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), "utf8");
  try { await fs.rename(temporary, file); }
  catch (error) {
    if (!["EEXIST", "EPERM"].includes(error.code)) throw error;
    await fs.rm(file, { force: true });
    await fs.rename(temporary, file);
  }
}

function normalizeStore(value) {
  const source = value && typeof value === "object" && value.data ? value.data : value;
  return {
    formulas: Array.isArray(source?.formulas) ? source.formulas : [],
    materials: Array.isArray(source?.materials) ? source.materials : [],
    groups: Array.isArray(source?.groups) ? source.groups : [],
    settings: Array.isArray(source?.settings) ? source.settings : [],
  };
}

async function readPreferencesInternal() {
  const saved = await readJson(preferencesPath(), {});
  const defaults = defaultPreferences();
  const preferences = { ...defaults, ...saved, nutstore: { ...defaults.nutstore, ...saved.nutstore } };
  if (preferences.nutstore.remoteFile === "/FormulaStudio-backup.json") preferences.nutstore.remoteFile = defaults.nutstore.remoteFile;
  return preferences;
}

async function readStore() {
  const preferences = await readPreferencesInternal();
  return normalizeStore(await readJson(path.join(preferences.dataDirectory, DATA_FILE), EMPTY_STORE));
}

async function writeStore(store, { sync = true, revision } = {}) {
  writeQueue = writeQueue.then(async () => {
    const preferences = await readPreferencesInternal();
    const file = path.join(preferences.dataDirectory, DATA_FILE);
    const current = await readJson(file, null);
    const syncRevision = revision ?? ((Number(current?.syncRevision) || 0) + 1);
    const envelope = { app: "调香手记", version: 1, syncRevision, exportedAt: new Date().toISOString(), data: normalizeStore(store) };
    await writeJsonAtomic(file, envelope);
    if (sync && preferences.nutstore.enabled && preferences.nutstore.syncOnSave) scheduleSaveSync();
    return envelope.data;
  });
  return writeQueue;
}

function publicPreferences(preferences) {
  return {
    theme: preferences.theme === "macos" ? "macos" : "windows",
    dataDirectory: preferences.dataDirectory,
    dataFile: path.join(preferences.dataDirectory, DATA_FILE),
    nutstore: {
      enabled: Boolean(preferences.nutstore.enabled),
      username: preferences.nutstore.username || "",
      remoteFile: preferences.nutstore.remoteFile || "/FormulaStudio/FormulaStudio-backup.json",
      autoSync: preferences.nutstore.autoSync !== false,
      intervalMinutes: Math.max(1, Number(preferences.nutstore.intervalMinutes) || 10),
      syncOnSave: preferences.nutstore.syncOnSave !== false,
      hasPassword: Boolean(preferences.nutstore.password),
      lastSyncAt: preferences.nutstore.lastSyncAt || "",
      lastSyncError: preferences.nutstore.lastSyncError || "",
    },
  };
}

function encryptPassword(password) {
  if (!password) return "";
  if (!safeStorage.isEncryptionAvailable()) throw new Error("当前系统无法安全保存密码。");
  return safeStorage.encryptString(password).toString("base64");
}

function decryptPassword(value) {
  if (!value) return "";
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}

function remoteUrl(remoteFile = "") {
  return `${NUTSTORE_URL}${String(remoteFile).replace(/^\/+/, "").split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}

async function nutstoreRequest(method, preferences, body, remoteFile = preferences.nutstore.remoteFile, extraHeaders = {}) {
  const password = decryptPassword(preferences.nutstore.password);
  if (!preferences.nutstore.username || !password) throw new Error("请填写坚果云账号和应用密码。");
  const response = await net.fetch(remoteUrl(remoteFile), {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${preferences.nutstore.username}:${password}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json;charset=utf-8" } : {}),
      ...extraHeaders,
    },
    ...(body ? { body } : {}),
  });
  if (!response.ok && !(method === "GET" && response.status === 404) && !(method === "MKCOL" && response.status === 405)) {
    throw new Error(`坚果云请求失败（HTTP ${response.status}）。`);
  }
  return response;
}

async function ensureNutstoreFolders(preferences) {
  const parts = String(preferences.nutstore.remoteFile || "").replace(/^\/+/, "").split("/").filter(Boolean).slice(0, -1);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    const response = await nutstoreRequest("MKCOL", preferences, undefined, current);
    if (![201, 405].includes(response.status)) throw new Error(`无法创建坚果云同步文件夹（HTTP ${response.status}）。`);
  }
}

async function updateSyncStatus(error = "") {
  const preferences = await readPreferencesInternal();
  preferences.nutstore.lastSyncAt = error ? preferences.nutstore.lastSyncAt || "" : new Date().toISOString();
  preferences.nutstore.lastSyncError = error;
  await writeJsonAtomic(preferencesPath(), preferences);
  return publicPreferences(preferences);
}

async function uploadToNutstore(minimumRevision = 0) {
  const preferences = await readPreferencesInternal();
  const localFile = path.join(preferences.dataDirectory, DATA_FILE);
  let localEnvelope = await readJson(localFile, null);
  const store = normalizeStore(localEnvelope);
  let syncRevision = Number(localEnvelope?.syncRevision) || 0;
  if (syncRevision <= minimumRevision) {
    syncRevision = minimumRevision + 1;
    localEnvelope = { app: "调香手记", version: 1, syncRevision, exportedAt: new Date().toISOString(), data: store };
    await writeJsonAtomic(localFile, localEnvelope);
  }
  const envelope = { app: "调香手记", version: 1, syncRevision, exportedAt: new Date().toISOString(), data: store };
  await ensureNutstoreFolders(preferences);
  await nutstoreRequest("PUT", preferences, JSON.stringify(envelope, null, 2));
  await updateSyncStatus();
  return { direction: "upload", store, syncRevision };
}

async function performNutstoreSync() {
  const preferences = await readPreferencesInternal();
  if (!preferences.nutstore.enabled) throw new Error("请先启用坚果云同步。");
  try {
    const response = await nutstoreRequest("GET", preferences);
    if (response.status === 404) return await uploadToNutstore();
    const remoteEnvelope = JSON.parse(await response.text());
    const remoteStore = normalizeStore(remoteEnvelope);
    const localFile = path.join(preferences.dataDirectory, DATA_FILE);
    const localEnvelope = await readJson(localFile, null);
    const remoteRevision = Number(remoteEnvelope.syncRevision) || 0;
    const localRevision = Number(localEnvelope?.syncRevision) || 0;
    const recordCount = store => store.formulas.length + store.materials.length + store.groups.length + store.settings.length;
    const remoteCount = recordCount(remoteStore);
    const localStore = normalizeStore(localEnvelope);
    const localCount = recordCount(localStore);
    if (remoteRevision > localRevision) {
      const conflictOptions = {
        type: "warning",
        title: "发现较新的坚果云版本",
        message: `本地版本 ID 为 ${localRevision}，坚果云版本 ID 为 ${remoteRevision}。`,
        detail: "请选择要保留的版本。另一个版本将被覆盖，此操作无法自动撤销。",
        buttons: ["保留本地版本", "使用坚果云版本", "取消同步"],
        defaultId: 1,
        cancelId: 2,
        noLink: true,
      };
      const owner = BrowserWindow.getFocusedWindow();
      const choice = owner ? await dialog.showMessageBox(owner, conflictOptions) : await dialog.showMessageBox(conflictOptions);
      if (choice.response === 2) return { direction: "cancel", store: localStore, syncRevision: localRevision };
      if (choice.response === 0) return await uploadToNutstore(remoteRevision);
      await writeStore(remoteStore, { sync: false, revision: remoteRevision });
      notifyStorageChanged();
      await updateSyncStatus();
      return { direction: "download", store: remoteStore, syncRevision: remoteRevision };
    }
    if (remoteCount > 0 && localCount === 0) {
      await writeStore(remoteStore, { sync: false, revision: remoteRevision });
      notifyStorageChanged();
      await updateSyncStatus();
      return { direction: "download", store: remoteStore, syncRevision: remoteRevision };
    }
    return await uploadToNutstore();
  } catch (error) {
    await updateSyncStatus(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function syncWithNutstore() {
  if (!cloudSyncPromise) cloudSyncPromise = performNutstoreSync().finally(() => { cloudSyncPromise = null; });
  return cloudSyncPromise;
}

function scheduleSaveSync() {
  clearTimeout(saveSyncTimer);
  saveSyncTimer = setTimeout(() => { syncWithNutstore().catch(() => {}); }, 1500);
}

function configureAutoSync(preferences) {
  clearInterval(autoSyncTimer);
  autoSyncTimer = undefined;
  if (!preferences.nutstore.enabled || !preferences.nutstore.autoSync) return;
  const interval = Math.max(1, Number(preferences.nutstore.intervalMinutes) || 10) * 60 * 1000;
  autoSyncTimer = setInterval(() => { syncWithNutstore().catch(() => {}); }, interval);
}

function notifyStorageChanged() {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("storage:changed");
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1050, minHeight: 680, title: "调香手记",
    icon: path.join(__dirname, isMac ? "../public/app-icon-macos.png" : "../public/app-icon.png"),
    backgroundColor: isMac ? "#00000000" : "#f5f6f8", autoHideMenuBar: true,
    ...(isMac ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 18, y: 18 }, vibrancy: "sidebar", visualEffectState: "active" } : {}),
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  if (isDev) window.loadURL("http://127.0.0.1:5173"); else window.loadFile(path.join(__dirname, "../dist/index.html"));
}

app.whenReady().then(async () => {
  ipcMain.handle("storage:list", () => readStore());
  ipcMain.handle("storage:backup", async () => {
    const preferences = await readPreferencesInternal();
    const saved = await readJson(path.join(preferences.dataDirectory, DATA_FILE), null);
    return { app: "调香手记", version: 1, syncRevision: Number(saved?.syncRevision) || 0, exportedAt: new Date().toISOString(), data: normalizeStore(saved) };
  });
  ipcMain.handle("storage:mutate", (_event, action, payload = {}) => {
    writeQueue = writeQueue.then(async () => {
      const store = await readStore();
      const keys = { formula: "formulas", material: "materials", group: "groups", settings: "settings" };
      const key = keys[payload.kind];
      if (!key) throw new Error("无效的数据类型。");
      if (action === "save" && payload.record?.id) {
        const index = store[key].findIndex(item => item.id === payload.record.id);
        if (index >= 0) store[key][index] = payload.record; else store[key].unshift(payload.record);
      } else if (action === "delete" && payload.id) store[key] = store[key].filter(item => item.id !== payload.id);
      else throw new Error("无效的存储请求。");
      const preferences = await readPreferencesInternal();
      const localFile = path.join(preferences.dataDirectory, DATA_FILE);
      const current = await readJson(localFile, null);
      await writeJsonAtomic(localFile, { app: "调香手记", version: 1, syncRevision: (Number(current?.syncRevision) || 0) + 1, exportedAt: new Date().toISOString(), data: store });
      if (preferences.nutstore.enabled && preferences.nutstore.syncOnSave) scheduleSaveSync();
      return store;
    });
    return writeQueue;
  });
  ipcMain.handle("storage:replace", (_event, store) => writeStore(normalizeStore(store)));
  ipcMain.handle("preferences:get", async () => publicPreferences(await readPreferencesInternal()));
  ipcMain.handle("preferences:choose-directory", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"], title: "选择调香手记数据文件夹" });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("preferences:save", async (_event, next) => {
    const current = await readPreferencesInternal();
    const currentStore = await readStore();
    const dataDirectory = path.resolve(next.dataDirectory || current.dataDirectory);
    const nutstore = { ...current.nutstore, ...next.nutstore };
    if (typeof next.nutstore?.password === "string" && next.nutstore.password) nutstore.password = encryptPassword(next.nutstore.password);
    delete nutstore.hasPassword;
    const theme = next.theme === "macos" ? "macos" : next.theme === "windows" ? "windows" : current.theme;
    const saved = { theme, dataDirectory, nutstore };
    await fs.mkdir(dataDirectory, { recursive: true });
    await writeJsonAtomic(preferencesPath(), saved);
    if (dataDirectory !== current.dataDirectory) await writeStore(currentStore, { sync: false });
    const latest = await readPreferencesInternal();
    configureAutoSync(latest);
    return publicPreferences(latest);
  });
  ipcMain.handle("nutstore:sync", () => syncWithNutstore());
  ipcMain.handle("nutstore:test", async (_event, draft) => {
    const current = await readPreferencesInternal();
    const test = { ...current, nutstore: { ...current.nutstore, ...draft } };
    if (draft.password) test.nutstore.password = encryptPassword(draft.password);
    const response = await nutstoreRequest("PROPFIND", test, undefined, "", { Depth: "0" });
    return { ok: response.ok || response.status === 207 };
  });
  createWindow();
  const preferences = await readPreferencesInternal();
  configureAutoSync(preferences);
  if (preferences.nutstore.enabled && preferences.nutstore.autoSync) syncWithNutstore().catch(() => {});
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
