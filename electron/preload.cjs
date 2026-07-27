const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("formulaStudio", {
  platform: process.platform,
  storage: {
    list: () => ipcRenderer.invoke("storage:list"),
    backup: () => ipcRenderer.invoke("storage:backup"),
    mutate: (action, payload) => ipcRenderer.invoke("storage:mutate", action, payload),
    replace: store => ipcRenderer.invoke("storage:replace", store),
    onChanged: callback => {
      const listener = () => callback();
      ipcRenderer.on("storage:changed", listener);
      return () => ipcRenderer.removeListener("storage:changed", listener);
    },
  },
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    chooseDirectory: () => ipcRenderer.invoke("preferences:choose-directory"),
    save: preferences => ipcRenderer.invoke("preferences:save", preferences),
  },
  nutstore: {
    test: settings => ipcRenderer.invoke("nutstore:test", settings),
    sync: () => ipcRenderer.invoke("nutstore:sync"),
  },
});
