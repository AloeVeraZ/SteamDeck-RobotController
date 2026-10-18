'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const COMMANDS=new Set(['backspace','left','right','enter','done']);
function validAction(action){return !!action&&typeof action==='object'&&(COMMANDS.has(action.kind)||(action.kind==='text'&&typeof action.value==='string'&&/^[\x20-\x7e]$/.test(action.value)));}
class RobotKeyboard{
 constructor({WebContentsView,ipcMain,window,robot,allowed,changed,released}){
  Object.assign(this,{WebContentsView,window,robot,allowed,changed,released});this.view=null;this.ready=null;this.visible=false;this.target=null;
  ipcMain.on('robot-touch-keyboard',(event,show)=>{const target=this.robot();if(event.sender!==target?.webContents||event.senderFrame!==event.sender.mainFrame)return;if(show===true)void this.show().catch(()=>this.hide());else this.hide();});
  ipcMain.handle('touch-keyboard-key',(event,action)=>{if(event.sender!==this.view?.webContents||event.senderFrame!==event.sender.mainFrame)throw Error('Only the touch keyboard can type here.');return this.press(action);});
 }
 height(){return Math.min(310,Math.floor(this.window().getContentSize()[1]*.55));}
 layout(){if(!this.visible||!this.view)return;const [width,height]=this.window().getContentSize(),keyWidth=Math.min(900,width);this.view.setBounds({x:Math.floor((width-keyWidth)/2),y:height-this.height(),width:keyWidth,height:this.height()});}
 async show(){
  const target=this.robot();if(!target||!this.allowed())return;
  if(!this.view){
   const view=new this.WebContentsView({webPreferences:{preload:path.join(__dirname,'touch-keyboard-preload.cjs'),partition:'touch-keyboard-controls',sandbox:true,contextIsolation:true,nodeIntegration:false}});this.view=view;view.setVisible(false);this.window().contentView.addChildView(view);
   const file=path.join(__dirname,'../ui/touch-keyboard-native.html'),url=pathToFileURL(file).href;view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.on('will-navigate',(event,destination)=>{if(destination!==url)event.preventDefault();});view.webContents.session.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
   view.webContents.on('render-process-gone',()=>{if(this.view===view){this.hide();this.window().contentView.removeChildView(view);this.view=null;}});this.ready=view.webContents.loadFile(file).catch(error=>{if(this.view===view){this.window().contentView.removeChildView(view);this.view=null;}view.webContents.close();throw error;});
  }
  await this.ready;if(target!==this.robot()||!this.allowed())return;this.target=target;this.visible=true;this.window().contentView.removeChildView(this.view);this.window().contentView.addChildView(this.view);this.layout();this.view.setVisible(true);this.changed();
 }
 hide({focus=true}={}){const wasVisible=this.visible;this.visible=false;this.view?.setVisible(false);this.target=null;if(wasVisible){this.released();this.changed();if(focus&&this.allowed()&&this.window().isFocused())this.robot()?.webContents.focus();}}
 async press(action){
  if(!validAction(action))throw Error('Invalid keyboard key.');if(action.kind==='done'){this.hide();return true;}
  if(!this.visible||this.target!==this.robot()||!this.allowed())return false;
  const contents=this.target.webContents;contents.focus();
  if(action.kind==='text')await contents.insertText(action.value);
  else{const keyCode={backspace:'Backspace',left:'Left',right:'Right',enter:'Return'}[action.kind];contents.sendInputEvent({type:'keyDown',keyCode});if(action.kind==='enter')contents.sendInputEvent({type:'char',keyCode:'\r'});contents.sendInputEvent({type:'keyUp',keyCode});if(action.kind==='enter')this.hide();}
  return true;
 }
 close(){this.hide({focus:false});if(this.view){this.window().contentView.removeChildView(this.view);this.view.webContents.close();this.view=null;}}
}
module.exports={RobotKeyboard,validAction};
