'use strict';
window.DeckCalibrationUI={create({api,selection,toast}){
  const $=s=>document.querySelector(s),math=window.DeckCalibration;
  let active=false,key='',sample=null,deadline=0,recommendation=null,travel=new math.DriftSample(),trails=[[],[]],saved=0;
  const plots=['Left stick','Right stick'].map((name,i)=>{const card=document.createElement('article');card.className='calibration-plot';card.innerHTML=`<h3>${name}</h3><svg viewBox="0 0 240 240" role="img" aria-label="${name} raw travel and deadzone"><circle class="calibration-unit" cx="120" cy="120" r="100"/><circle cx="120" cy="120" r="50"/><path d="M10 120h220M120 10v220"/><circle class="calibration-zone" cx="120" cy="120" r="0"/><polyline class="calibration-trail"/><circle class="calibration-dot" cx="120" cy="120" r="4"/></svg><output id="calibration-stick-${i}"></output><p class="hint calibration-travel"></p>`;$('#calibration-plots').append(card);return card;});
  function changeView(value){active=value;$('#controller-dialog').dataset.view=value?'calibration':'inputs';$('#controller-scroll').scrollTop=0;$('#controller-input-view').hidden=value;$('#controller-calibration-view').hidden=!value;$('#controller-input-tab').setAttribute('aria-pressed',String(!value));$('#controller-calibration-tab').setAttribute('aria-pressed',String(value));if(!value)cancel();}
  function cancel(){sample=null;deadline=0;}
  function reset(){cancel();recommendation=null;travel=new math.DriftSample();trails=[[],[]];for(const plot of plots){plot.querySelector('.calibration-dot').setAttribute('transform','translate(0 0)');plot.querySelector('polyline').setAttribute('points','');plot.querySelector('output').textContent='Waiting for stick readings';plot.querySelector('.calibration-travel').textContent='';}$('#calibration-suggest').disabled=true;$('#calibration-status').textContent='Release both sticks, then measure resting drift.';}
  function render(){
    const {pad,reading,zone=0}=selection(),next=pad?pad.index+':'+pad.id:'';
    if(key!==next){key=next;reset();saved=zone;$('#calibration-deadzone').value=String(Math.round(zone*100));}
    if(saved!==zone){saved=zone;$('#calibration-deadzone').value=String(Math.round(zone*100));}
    const usable=!!pad&&pad.mapping==='standard'&&!!reading;
    for(const id of ['calibration-measure','calibration-clear','calibration-deadzone','calibration-apply','calibration-reset'])$('#'+id).disabled=!usable;
    $('#calibration-suggest').disabled=!usable||recommendation===null;
    $('#calibration-saved').textContent=usable?`Saved deadzone: ${Math.round(zone*100)}%. Raw input remains visible here.`:'Connect and assign a mapped controller to calibrate it.';
    const zoneValue=Number($('#calibration-deadzone').value);$('#calibration-zone-value').textContent=zoneValue+'%';
    if(!active||!$('#controller-dialog').open){cancel();return;}
    if(!usable){cancel();return;}
    const axes=math.axes(reading.axes),stats=travel.add(axes);
    for(const [i,offset]of [[0,0],[1,2]]){const x=axes[offset],y=axes[offset+1],radius=Math.hypot(x,y);trails[i].push(`${120+x*100},${120+y*100}`);if(trails[i].length>180)trails[i].shift();const plot=plots[i];plot.querySelector('.calibration-dot').setAttribute('transform',`translate(${x*100} ${y*100})`);plot.querySelector('.calibration-zone').setAttribute('r',String(zoneValue));plot.querySelector('polyline').setAttribute('points',trails[i].join(' '));plot.querySelector('output').textContent=`X ${x.toFixed(2)} · Y ${y.toFixed(2)} · offset ${(radius*100).toFixed(1)}%`;plot.querySelector('.calibration-travel').textContent=`Travel X ${stats.min[offset].toFixed(2)} to ${stats.max[offset].toFixed(2)} · Y ${stats.min[offset+1].toFixed(2)} to ${stats.max[offset+1].toFixed(2)}`;}
    if(sample){sample.add(axes);const left=deadline-performance.now();if(left>0)$('#calibration-status').textContent=`Measuring resting drift… ${(left/1000).toFixed(1)}s. Do not touch the sticks.`;else{const result=sample.result();recommendation=result.recommended;$('#calibration-status').textContent=`Peak resting drift: left ${(result.peak[0]*100).toFixed(1)}%, right ${(result.peak[1]*100).toFixed(1)}%. Suggested app deadzone: ${Math.round(recommendation*100)}%.`+(Math.max(...result.peak)>0.28?' High movement detected; remeasure with sticks released before applying.':'');if(Math.max(...result.peak)>0.28)recommendation=null;cancel();$('#calibration-suggest').disabled=recommendation===null;}}
  }
  const save=zone=>void(async()=>{try{const {slot}=selection();await api.controllerCalibration(slot,zone);saved=-1;render();toast('App deadzone saved. Release sticks before driving.');}catch(e){toast(e.message);}})();
  $('#controller-input-tab').onclick=()=>changeView(false);$('#controller-calibration-tab').onclick=()=>{changeView(true);render();};
  $('#calibration-measure').onclick=()=>{sample=new math.DriftSample();deadline=performance.now()+3000;recommendation=null;$('#calibration-suggest').disabled=true;render();};
  $('#calibration-clear').onclick=()=>{reset();render();};$('#calibration-deadzone').oninput=()=>{$('#calibration-zone-value').textContent=$('#calibration-deadzone').value+'%';};
  $('#calibration-apply').onclick=()=>save(Number($('#calibration-deadzone').value)/100);$('#calibration-suggest').onclick=()=>{if(recommendation!==null)save(recommendation);};$('#calibration-reset').onclick=()=>save(0);
  setInterval(render,50);
  return {reset:()=>{key='';reset();changeView(false);},render};
}};
