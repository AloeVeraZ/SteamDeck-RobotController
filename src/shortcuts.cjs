'use strict';
// Station keyboard shortcuts, shared by the shell and every robot view. Only F-keys and
// modifier chords are claimed so plain keys always reach the robot's own web page.
function shortcut(input,platform=process.platform){
  if(input.type!=='keyDown')return null;const mod=platform==='darwin'?input.meta:input.control,key=String(input.key).toLowerCase();
  if(input.key==='F5'||mod&&!input.shift&&!input.alt&&key==='r')return 'reload';
  if(input.key==='F11')return 'fullscreen';
  if(platform==='darwin'?mod&&key==='[':input.alt&&!mod&&input.key==='ArrowLeft')return 'back';
  if(!mod||input.alt)return null;
  return {'=':'zoom-in','+':'zoom-in','-':'zoom-out','_':'zoom-out','0':'zoom-reset','1':'drive','2':'settings',',':'settings'}[key]||null;
}
module.exports={shortcut};
