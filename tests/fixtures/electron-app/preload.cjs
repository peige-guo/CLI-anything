const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('documents', {
  export: (options) => ipcRenderer.invoke('document.export', options),
});
