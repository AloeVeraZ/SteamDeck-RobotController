'use strict';
const {axes:calibratedAxes}=require('../ui/controller-calibration.js');
// Robot documents receive only their two logical, gated pads. Raw diagnostics
// and the other physical devices stay in the trusted driver station.
function controllerOutput({count,slots=[],readings=[],paused,capture,blocked=[],deadzones=[]}){
  return [0,1].map(slot=>{
    const selected=slot<count&&slots[slot],reading=readings[slot];if(!selected||!reading||selected.id!==reading.id||selected.index!==reading.index)return null;
    const rest=paused||capture||selected.mapping!=='standard'||blocked.includes(`${selected.index}:${selected.id}`);
    const axes=rest?reading.axes.map(()=>0):calibratedAxes(reading.axes,deadzones[slot]||0);
    const buttons=reading.buttons.map((value,i)=>({value:rest?0:value,pressed:!rest&&!!reading.buttonPressed?.[i],touched:!rest&&!!reading.buttonTouched?.[i]}));
    return {id:selected.id,index:slot,mapping:selected.mapping,connected:true,axes,buttons};
  });
}
module.exports={controllerOutput};
