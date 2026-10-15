// Static analysis fixture. The discovery test never launches Electron.
const { ipcMain } = require('electron');
ipcMain.handle('document.export', async (_event, options) => ({
  format: options.format,
  output: options.output,
}));
