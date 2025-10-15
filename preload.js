const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  fetch: async (path, opts) => {
    return await ipcRenderer.invoke('api-fetch', { path, opts });
  }
});