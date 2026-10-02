const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('screenPicker', {
  onSources: (callback) => {
    ipcRenderer.on('screen-picker-sources', (_event, sources) => callback(sources));
  },
  select: (id, audioPid) => ipcRenderer.send('screen-picker-selected', id, audioPid),
  cancel: () => ipcRenderer.send('screen-picker-selected', null, 0)
});
