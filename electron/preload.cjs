const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("formulaStudio", {
  storage: {
    list: () => ipcRenderer.invoke("storage:list"),
    mutate: (action, payload) => ipcRenderer.invoke("storage:mutate", action, payload),
    replace: store => ipcRenderer.invoke("storage:replace", store),
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
