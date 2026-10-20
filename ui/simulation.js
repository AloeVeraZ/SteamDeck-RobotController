/* Offline field placement. Robot configuration and localization stay on the robot. */
window.DeckSimulation={create(root){
  'use strict';
  const field=window.DeckField,$=selector=>root.querySelector(selector),ns='http://www.w3.org/2000/svg';
  let saved=null;try{saved=field.restore(localStorage.getItem(field.KEY));}catch{}
  let start=saved||field.edgePose(),preview={...start},placing=!saved,active=false,pointer=null;
  root.innerHTML=`<div class="simulation-heading"><div><h1>Simulation</h1><p>Empty FTC field · 144 × 144 inches</p></div><span class="simulation-mode">Offline placement</span></div>
    <div class="simulation-layout"><section class="field-area" aria-label="Starting position graph">
      <svg id="simulation-field" viewBox="-16 -9 168 172" role="group" tabindex="0" aria-label="Robot starting position on a 2D field" aria-describedby="field-help field-coordinates">
        <rect class="field-floor" x="0" y="0" width="144" height="144"/>
        <g class="field-grid"></g><g class="field-labels"></g>
        <g id="field-robot"><rect x="-9" y="-9" width="18" height="18" rx="1"/><path d="M-3 0H5M2-3L5 0 2 3"/><circle r="1"/></g>
      </svg>
      <output id="field-coordinates"></output><p id="field-help" class="hint"></p>
    </section><section class="start-controls" aria-labelledby="start-title"><h2 id="start-title">Starting pose</h2>
      <p>Place the robot along a wall or anywhere inside the field.</p>
      <form id="start-form"><div class="start-xy"><div><label for="start-x">X · inches</label><input id="start-x" type="number" step="any" required inputmode="decimal"></div><div><label for="start-y">Y · inches</label><input id="start-y" type="number" step="any" required inputmode="decimal"></div></div>
      <label for="start-heading">Heading · degrees</label><input id="start-heading" type="number" step="any" required inputmode="decimal">
      <p class="hint">Origin: bottom-left. X goes right; Y goes up. Heading 0° faces right; 90° faces up.</p>
      <button class="primary" type="submit">Set starting pose</button></form>
      <div class="button-row"><button id="start-place" class="secondary" type="button">Place on field</button><button id="start-edge" class="secondary" type="button">Start at edge</button></div>
      <p id="start-status" role="status"></p><p class="hint">18 × 18-inch preview footprint. Saved on this device. Robot configuration and localization stay on the robot.</p>
      <p class="hint">This view currently sets the starting pose. Driving simulation and live robot telemetry are not connected yet.</p>
    </section></div>`;
  const graph=$('#simulation-field'),robot=$('#field-robot');
  function svg(tag,attributes,text){const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
  for(let value=0;value<=144;value+=24){
    if(value>0&&value<144){$('.field-grid').append(svg('path',{d:`M${value} 0V144M0 ${value}H144`}));}
    $('.field-labels').append(svg('text',{x:value,y:151,'text-anchor':'middle'},value),svg('text',{x:-4,y:144-value+1.5,'text-anchor':'end'},value));
  }
  $('.field-labels').append(svg('text',{x:72,y:160,'text-anchor':'middle'},'X · inches'),svg('text',{x:-13,y:72,transform:'rotate(-90 -13 72)','text-anchor':'middle'},'Y · inches'));
  function inputs(){for(const key of ['x','y','heading'])$('#start-'+key).value=String(start[key]);}
  function draw(){
    robot.setAttribute('transform',`translate(${preview.x} ${144-preview.y}) rotate(${-preview.heading})`);
    graph.dataset.placing=String(placing);
    $('#field-coordinates').textContent=`X ${field.round(preview.x)} in · Y ${field.round(preview.y)} in · ${field.round(preview.heading)}°`;
    $('#field-help').textContent=placing?'Move the pointer, then click to place. On touch, drag or tap. Arrow keys move 1 inch; Enter places; Escape cancels.':'Starting pose set. Choose Place on field to move it again.';
    $('#start-place').disabled=placing;
  }
  function commit(pose){
    start=field.validate(pose);preview={...start};placing=false;pointer=null;inputs();draw();
    try{localStorage.setItem(field.KEY,field.serialize(start));$('#start-status').textContent='Starting pose saved.';}catch{$('#start-status').textContent='Starting pose set for this session. Device storage is unavailable.';}
  }
  function atPointer(event){
    const matrix=graph.getScreenCTM();if(!matrix)return;
    const point=graph.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
    const local=point.matrixTransform(matrix.inverse());preview=field.fromGraph(local.x,local.y,preview.heading);draw();
  }
  graph.addEventListener('pointermove',event=>{if(active&&placing&&(event.pointerType!=='touch'||pointer===event.pointerId))atPointer(event);});
  graph.addEventListener('pointerdown',event=>{
    if(!active||!placing||event.button!==0)return;event.preventDefault();graph.focus();pointer=event.pointerId;graph.setPointerCapture(event.pointerId);atPointer(event);
  });
  graph.addEventListener('pointerup',event=>{if(active&&placing&&pointer===event.pointerId){atPointer(event);commit(preview);}});
  graph.addEventListener('pointercancel',()=>{pointer=null;preview={...start};draw();});
  graph.addEventListener('keydown',event=>{
    if(!active||!placing||event.ctrlKey||event.metaKey||event.altKey)return;
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[event.key];
    if(delta){event.preventDefault();preview=field.constrain({...preview,x:preview.x+delta[0],y:preview.y+delta[1]});draw();}
    else if(event.key==='Enter'){event.preventDefault();commit(preview);}
    else if(event.key==='Escape'){event.preventDefault();placing=false;preview={...start};draw();}
  });
  $('#start-form').addEventListener('submit',event=>{event.preventDefault();try{commit(Object.fromEntries(['x','y','heading'].map(key=>[key,$('#start-'+key).valueAsNumber])));}catch(error){$('#start-status').textContent=error.message;}});
  $('#start-place').onclick=()=>{preview={...start};placing=true;$('#start-status').textContent='Choose a starting position.';draw();graph.focus();};
  $('#start-edge').onclick=()=>{preview=field.edgePose(start.heading);placing=true;pointer=null;$('#start-status').textContent='Preview starts against the left wall. Move and click to place, or press Enter to use the edge.';draw();graph.focus();};
  inputs();draw();
  return {activate(value){if(active&&!value){pointer=null;preview={...start};draw();}active=value;}};
}};
