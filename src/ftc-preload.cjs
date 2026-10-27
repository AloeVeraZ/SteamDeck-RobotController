'use strict';
// Narrow bridge for the bundled FTC Driver Station page: datagrams to the one robot chosen in Settings.
const {contextBridge,ipcRenderer}=require('electron');
const listen=(name,fn)=>{const cb=(_e,value)=>fn(value);ipcRenderer.on(name,cb);return()=>ipcRenderer.removeListener(name,cb);};
contextBridge.exposeInMainWorld('ftcHost',{
  info:()=>ipcRenderer.invoke('ftc-info'),
  controllerCapture:slot=>ipcRenderer.invoke('ftc-controller-capture',slot),
  send:bytes=>ipcRenderer.send('ftc-send',bytes),
  onPacket:fn=>listen('ftc-packet',bytes=>fn(new Uint8Array(bytes))),
  onActive:fn=>listen('ftc-active',active=>fn(!!active)),
  programAndManage:()=>ipcRenderer.invoke('ftc-manage'),
  openSettings:()=>ipcRenderer.invoke('ftc-settings'),
  devicePhoto:tag=>ipcRenderer.invoke('ftc-device-photo',tag),
  devicePhotos:()=>ipcRenderer.invoke('ftc-device-photos'),
  saveFile:file=>ipcRenderer.invoke('ftc-save-file',file),
  wiringNotes:request=>ipcRenderer.invoke('ftc-wiring-notes',request),
  rcHubs:()=>ipcRenderer.invoke('ftc-rc-hubs')
});
