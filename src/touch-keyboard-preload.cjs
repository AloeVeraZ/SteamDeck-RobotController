'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('touchKeyboardNative',{press:action=>ipcRenderer.invoke('touch-keyboard-key',action)});
