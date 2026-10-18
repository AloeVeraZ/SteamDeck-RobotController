'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const call=(name,...args)=>ipcRenderer.invoke(name,...args).then(r=>{if(!r.ok){const e=Error(r.error);e.code=r.code;throw e;}return r.value;});
const listen=(name,fn)=>{const cb=(_e,value)=>fn(value);ipcRenderer.on(name,cb);return()=>ipcRenderer.removeListener(name,cb);};
contextBridge.exposeInMainWorld('deck',{
  controllerInfo:()=>call('controller-info'),controllerCapture:slot=>call('controller-capture',slot),controllerCancel:()=>call('controller-cancel'),controllerAutomatic:()=>call('controller-automatic'),onControllerState:fn=>listen('controller-state',fn),onControllerCapture:fn=>listen('controller-capture',fn),
  updateInfo:()=>call('update-info'),updateChannel:(channel,confirmed)=>call('update-channel',channel,confirmed),updateCheck:repo=>call('update-check',repo),updateDownload:()=>call('update-download'),updateInstall:()=>call('update-install'),updateFolder:()=>call('update-folder'),onUpdateProgress:fn=>listen('update-progress',fn),
  bootstrap:()=>call('bootstrap'),open:p=>call('open',p),close:()=>call('close'),page:p=>call('page',p),save:p=>call('save',p),remove:id=>call('remove',id),network:()=>call('network'),scan:()=>call('scan'),join:(ssid,pw)=>call('join',ssid,pw),systemWifi:()=>call('system-wifi'),bounds:r=>call('bounds',r),overlay:v=>call('overlay',v),reload:()=>call('reload'),back:()=>call('back'),controllers:()=>call('controllers'),auth:p=>call('auth',p),fullscreen:()=>call('fullscreen'),quit:()=>call('quit'),managerClose:()=>call('manager-close'),onNotice:fn=>listen('notice',fn),onState:fn=>listen('state',fn),onNetwork:fn=>listen('network',fn),onAuth:fn=>listen('auth',fn)
});
