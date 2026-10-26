'use strict';
window.DeckRobotFullscreen={create(api){
  const button=document.querySelector('#robot-fullscreen'),exit=document.querySelector('#robot-fullscreen-exit');
  let local=false,previous=false,changing=false,current={};
  document.body.dataset.nativeRobotView=String(!!api.robotFullscreen);
  function paint(){const active=!!current.robotFullscreen||local;document.body.classList.toggle('robot-fullscreen',active);exit.hidden=!active;button.hidden=!current.url;button.disabled=changing||!!current.loading||!!current.error;button.setAttribute('aria-pressed',String(active));}
  async function change(enabled){
    if(api.robotFullscreen){await api.robotFullscreen(enabled);return;}
    if(enabled){if(!current.url||current.loading||current.error)return;previous=!!document.fullscreenElement;if(!previous&&document.fullscreenEnabled)await document.documentElement.requestFullscreen();local=true;}
    else{local=false;if(!previous&&document.fullscreenElement)await document.exitFullscreen();}
    paint();
  }
  const run=value=>{if(changing)return;changing=true;paint();void change(value).catch(error=>{document.dispatchEvent(new CustomEvent('robot-fullscreen-error',{detail:error.message}));}).finally(()=>{changing=false;paint();});};
  button.onclick=()=>run(true);exit.onclick=()=>run(false);
  document.addEventListener('fullscreenchange',()=>{if(local&&!document.fullscreenElement){local=false;paint();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&(local||current.robotFullscreen))run(false);});
  return {render(state){current=state;if(local&&(!state.url||state.page!=='drive'||state.error))run(false);paint();}};
}};
