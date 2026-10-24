'use strict';
const Keyboard=require('../ui/keyboard-layout.js');

// Raw test input is independent of the current page and robot output gating.
// A dialog/focus boundary releases the pad and requires a fresh physical press.
class KeyboardInput {
  down=new Set();
  blocked=new Set();
  key(input){
    input={...input,code:Keyboard.code(input)};
    if(!Keyboard.used.has(input.code))return false;
    const held=this.down.has(input.code);
    if(input.type==='keyUp'){this.down.delete(input.code);this.blocked.delete(input.code);}
    else if(input.type==='keyDown'&&!input.control&&!input.meta&&!input.alt){
      if(this.blocked.has(input.code)&&input.isAutoRepeat===false)this.blocked.delete(input.code);
      if(!this.blocked.has(input.code))this.down.add(input.code);
    }
    return held!==this.down.has(input.code);
  }
  release(){const changed=this.down.size>0;for(const code of this.down)this.blocked.add(code);this.down.clear();return changed;}
  reset(){this.down.clear();this.blocked.clear();}
}
module.exports={KeyboardInput};
