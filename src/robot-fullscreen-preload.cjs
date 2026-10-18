'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// The small native overlay can only leave robot fullscreen, never access settings.
contextBridge.exposeInMainWorld('robotViewControls',{exit:()=>ipcRenderer.invoke('robot-fullscreen-exit')});
