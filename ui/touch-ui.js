'use strict';
window.DeckTouchUI={create({handheld=()=>false,enabled=()=>true}={}){
 const editable=target=>target instanceof HTMLElement&&!target.closest('.touch-keyboard')&&!target.disabled&&!target.readOnly&&(target.matches('textarea')||target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]):not([type=button]):not([type=submit]):not([type=hidden]):not([type=date]):not([type=time])'));
 const host=document.createElement('div');host.id='touch-keyboard';host.setAttribute('popover','manual');host.hidden=true;
 let field=null,originalMode=null,keyboard;
 function hide(){if(!field)return;if(originalMode===null)field.removeAttribute('inputmode');else field.setAttribute('inputmode',originalMode);field=null;host.hidePopover?.();host.hidden=true;document.body.dataset.touchKeyboard='closed';}
 function show(target){
  if(field!==target){hide();field=target;originalMode=target.getAttribute('inputmode');keyboard.reset();}
  target.setAttribute('inputmode','none');const parent=target.closest('dialog')||document.body;if(host.parentElement!==parent)parent.append(host);host.hidden=false;host.showPopover?.();
  document.body.dataset.touchKeyboard='open';document.documentElement.style.setProperty('--touch-keyboard-height',host.getBoundingClientRect().height+'px');target.focus({preventScroll:true});requestAnimationFrame(()=>target.scrollIntoView({block:'center',behavior:'instant'}));
 }
 function finish(submit=false){const target=field;if(!target)return;target.dispatchEvent(new Event('change',{bubbles:true}));hide();target.blur();if(submit||target.dataset.sliderSubmit!==undefined)target.form?.requestSubmit();}
 function press(action){
  if(!field?.isConnected||!editable(field)){hide();return;}const target=field;target.focus({preventScroll:true});
  if(action.kind==='enter'){finish(true);return;}
  let start=target.selectionStart??target.value.length,end=target.selectionEnd??start;
  if(action.kind==='left'||action.kind==='right'){const cursor=Math.max(0,Math.min(target.value.length,start+(action.kind==='left'?-1:1)));try{target.setSelectionRange(cursor,cursor);}catch{}return;}
  if(action.kind==='backspace'&&start===end)start=Math.max(0,start-1);
  const text=action.kind==='text'?action.value:'';if(text&&target.maxLength>=0&&target.value.length-(end-start)+text.length>target.maxLength)return;
  try{target.setRangeText(text,start,end,'end');}catch{target.value=target.value.slice(0,start)+text+target.value.slice(end);}
  target.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:action.kind==='backspace'?'deleteContentBackward':'insertText',data:text||null}));
 }
 keyboard=window.DeckTouchKeyboard.mount(host,{press,close:()=>finish()});
 // This is an explicit opt-in preference, including on mouse-only desktops.
 const touch=event=>['mouse','touch','pen'].includes(event.pointerType)||event.sourceCapabilities?.firesTouchEvents;
 document.addEventListener('pointerdown',event=>{if(!enabled()){hide();return;}if(event.isTrusted&&touch(event)&&editable(event.target)){const target=event.target;if(field!==target){hide();field=target;originalMode=target.getAttribute('inputmode');keyboard.reset();}target.setAttribute('inputmode','none');}});
 document.addEventListener('click',event=>{if(!event.isTrusted||!touch(event)||event.composedPath().includes(host))return;if(enabled()&&editable(event.target))show(event.target);else hide();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&field){event.stopImmediatePropagation();hide();}},true);
 document.addEventListener('close',hide,true);window.addEventListener('blur',hide);
 return {hide};
}};
