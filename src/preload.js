const { contextBridge, ipcRenderer } = require('electron');

// Exponer un API segura al proceso de renderizado
contextBridge.exposeInMainWorld('api', {
  /**
   * Envía un mensaje al proceso principal.
   * @param {string} channel - El canal para enviar el mensaje.
   * @param  {...any} args - Argumentos para enviar.
   */
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },

  /**
   * Se suscribe a un canal para recibir mensajes.
   * @param {string} channel - El canal para escuchar.
   * @param {Function} listener - La función que manejará el mensaje.
   */
  on: (channel, listener) => {
    // Wrapper para seguridad, evitando exponer ipcRenderer directamente
    const newListener = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, newListener);
    
    // Devolvemos una función para cancelar la suscripción
    return () => {
      ipcRenderer.removeListener(channel, newListener);
    };
  },

  /**
   * Invoca un canal y espera una respuesta.
   * @param {string} channel - El canal a invocar.
   * @param  {...any} args - Argumentos.
   * @returns {Promise<any>} - La respuesta del proceso principal.
   */
  invoke: (channel, ...args) => {
    return ipcRenderer.invoke(channel, ...args);
  },

  showOpenDialog: () => ipcRenderer.invoke('show-open-dialog'),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  getImageAsDataUrl: (filePath) => ipcRenderer.invoke('get-image-data-url', filePath)
});
