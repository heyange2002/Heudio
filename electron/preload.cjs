const { contextBridge } = require('electron');
// Read-only layout information; renderer code receives no Node or IPC access.
contextBridge.exposeInMainWorld('soundisleWindow', Object.freeze({ platform: process.platform }));
