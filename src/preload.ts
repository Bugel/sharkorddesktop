import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sharkordDesktop', {
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  setServerUrl: (url: string) => ipcRenderer.invoke('set-server-url', url),
  closePreferences: () => ipcRenderer.invoke('close-preferences'),
  onNavigate: (callback: (url: string) => void) => {
    ipcRenderer.on('wrapper-navigate', (_event, url: string) => callback(url));
  },
  getServers: () => ipcRenderer.invoke('desktop-get-servers'),
  addServer: (server: { url: string; name: string }) =>
    ipcRenderer.invoke('desktop-add-server', server),
  removeServer: (id: string) => ipcRenderer.invoke('desktop-remove-server', id),
  updateServer: (id: string, updates: { name?: string; icon?: string; keepConnected?: boolean; identity?: string; password?: string }) =>
    ipcRenderer.invoke('desktop-update-server', id, updates),
  getCredentialsForOrigin: (origin: string) =>
    ipcRenderer.invoke('desktop-get-credentials-for-origin', origin),
  setCredentialsForOrigin: (origin: string, identity: string, password: string) =>
    ipcRenderer.invoke('desktop-set-credentials', origin, identity, password),
  navigateToServer: (url: string) => ipcRenderer.invoke('desktop-navigate-to-server', url)
});
