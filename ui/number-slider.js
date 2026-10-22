'use strict';
// Pairs every numeric field with a touch slider so values can be set without a keyboard. The number
// box keeps exact entry; the slider updates it live and commits with a 'change' event on release.
// Range comes from data-slider-min/max/step, falling back to the field's own min/max/step.
window.DeckNumberSliders=(()=>{
 const pairs=new Map();
 const read=(input,key,fallback)=>{const v=parseFloat(input.dataset['slider'+key]??input.getAttribute(key.toLowerCase()));return Number.isFinite(v)?v:fallback;};
 const nice=x=>{const p=10**Math.floor(Math.log10(x)),m=x/p;return (m<1.5?1:m<3.5?2:m<7.5?5:10)*p;};
 const decimals=step=>{const text=String(step);return text.includes('e-')?+text.split('e-')[1]:(text.split('.')[1]||'').length;};
 function sync(input){
  const range=pairs.get(input);if(!range)return;
  const min=read(input,'Min',0),max=Math.max(min+1e-6,read(input,'Max',min+100)),own=input.dataset.sliderStep??input.getAttribute('step'),step=own&&own!=='any'&&+own>0?+own:nice((max-min)/200);
  range.min=String(min);range.max=String(max);range.step=String(step);range.disabled=input.disabled||input.readOnly;range.hidden=input.hidden;
  const value=input.valueAsNumber;if(Number.isFinite(value))range.value=String(Math.min(max,Math.max(min,value)));
 }
 function pair(input){
  if(pairs.has(input)||input.dataset.slider==='off')return;
  const range=document.createElement('input');range.type='range';range.className='num-slider';if(input.id)range.id=input.id+'-slider';
  const label=(input.labels?.[0]?.textContent||input.getAttribute('aria-label')||input.title||'Value').trim();range.setAttribute('aria-label',label+' slider');
  range.addEventListener('input',()=>{const v=+range.value;input.value=String(+v.toFixed(Math.min(6,decimals(range.step))));input.dispatchEvent(new Event('input',{bubbles:true}));});
  range.addEventListener('change',()=>{input.dispatchEvent(new Event('change',{bubbles:true}));if(input.dataset.sliderSubmit!==undefined)input.form?.requestSubmit();});
  range.addEventListener('pointerdown',()=>sync(input));
  input.addEventListener('input',()=>sync(input));input.addEventListener('change',()=>sync(input));
  input.after(range);pairs.set(input,range);sync(input);
 }
 const scan=root=>{for(const input of root.querySelectorAll('input[type=number]'))pair(input);};
 function refresh(){for(const input of pairs.keys())if(input.isConnected)sync(input);else pairs.delete(input);}
 function attach(root=document.body){
  // Explicit commit works with a physical keyboard as well as the optional touch keyboard.
  const done=document.createElement('button');done.type='button';done.className='number-entry-done primary';done.textContent='Done';done.hidden=true;document.body.append(done);
  let editing=null;
  root.addEventListener('focusin',event=>{if(event.target.matches('input[type=number]')&&!event.target.closest('#sim-effects')){editing=event.target;done.hidden=false;}});
  root.addEventListener('focusout',()=>queueMicrotask(()=>{if(document.activeElement!==done){done.hidden=true;editing=null;}}));
  done.addEventListener('pointerdown',event=>event.preventDefault());
  done.addEventListener('click',()=>{const target=editing;target?.blur();if(target?.dataset.sliderSubmit!==undefined)target.form?.requestSubmit();done.hidden=true;});
  root.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input[type=number]')&&!event.target.form){event.preventDefault();event.target.blur();}});
  scan(root);
  new MutationObserver(records=>{let removed=false;
   for(const record of records){
    if(record.type==='attributes'){if(pairs.has(record.target))sync(record.target);continue;}
    if(record.removedNodes.length)removed=true;
    for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches('input[type=number]'))pair(node);else scan(node);}
   }
   if(removed)for(const input of pairs.keys())if(!input.isConnected)pairs.delete(input);
  }).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly','hidden','min','max','step','data-slider-min','data-slider-max','data-slider-step']});
 }
 return {attach,refresh,sync};
})();
