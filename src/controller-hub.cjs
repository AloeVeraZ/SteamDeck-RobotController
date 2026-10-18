'use strict';
const {Assignments,defaultPad}=require('../ui/controllers.js');
const key=p=>p?`${p.index}:${p.id}`:'';
const normalizeValues=(items,max,min=0)=>Array.isArray(items)?items.slice(0,max).map(v=>Number.isFinite(v)?Math.round(Math.max(min,Math.min(1,v))*100)/100:0):[];
class ControllerHub{
  constructor({hardware={},preferred=[],persist=()=>{}}={}){this.hardware=hardware;this.preferred=preferred;this.persist=persist;this.assignments=new Assignments();this.pads=[];this.count=1;this.capture=null;this.blocked=new Set();this.assignment=null;}
  setCount(count){if(![1,2].includes(count))throw Error('Choose one or two controllers.');this.count=count;}
  begin(slot,now=Date.now()){if(![1,2].includes(slot))throw Error('Choose controller 1 or controller 2.');this.capture={slot,deadline:now+15000,waiting:new Set(this.pads.filter(p=>p.pressed||p.axesActive).map(key))};}
  automatic(){this.cancel();const pad=defaultPad(this.pads,this.hardware);if(pad)this.assignments.assign(1,pad,{swap:true,automatic:true});else{this.assignments.users[1]=null;this.assignments.identities[1]=null;this.assignments.automaticUser1=true;}this.preferred=[null,this.assignments.snapshot(this.pads)[1]];this.persist(this.preferred);for(const p of this.assignments.snapshot(this.pads))if(p)this.blocked.add(key(p));}
  cancel(){this.capture=null;}
  tick(now=Date.now()){if(this.capture&&now>=this.capture.deadline)this.capture=null;}
  ingest(values){
    const seen=new Set();this.pads=Array.from(Array.isArray(values)?values:[]).slice(0,16).filter(p=>p&&p.connected&&Number.isInteger(p.index)&&p.index>=0&&p.index<16&&typeof p.id==='string'&&p.id.length<=2048&&!seen.has(p.index)&&seen.add(p.index)).map(p=>({id:p.id,index:p.index,mapping:p.mapping==='standard'?'standard':'',connected:true,pressed:!!p.pressed,axesActive:!!p.axesActive,axes:normalizeValues(p.axes,4,-1),buttons:normalizeValues(p.buttons,24)}));
    // Clear stale identities before restoring a saved choice, including when a
    // controller reconnects under a different browser index.
    for(const slot of [1,2])if(!this.pads.some(p=>p.index===this.assignments.users[slot]&&p.id===this.assignments.identities[slot])){this.assignments.users[slot]=null;this.assignments.identities[slot]=null;}
    this.tick();for(const p of this.pads)if(!p.pressed&&!p.axesActive)this.blocked.delete(key(p));
    if(this.capture){
      for(const p of this.pads)if(!p.pressed&&!p.axesActive)this.capture.waiting.delete(key(p));
      const selected=this.pads.find(p=>p.pressed&&!this.capture.waiting.has(key(p)));
      if(selected){const slot=this.capture.slot;this.assignments.assign(slot,selected,{swap:true});this.assignment={slot,id:selected.id,serial:(this.assignment?.serial||0)+1};this.capture=null;for(const p of this.assignments.snapshot(this.pads))if(p)this.blocked.add(key(p));this.preferred=this.assignments.snapshot(this.pads);this.persist(this.preferred);}
    }
    for(const slot of [1,2])if(this.assignments.users[slot]===null){const wanted=this.preferred[slot-1],pad=wanted&&this.pads.find(p=>p.id===wanted.id&&p.index===wanted.index)||wanted&&this.pads.find(p=>p.id===wanted.id);if(pad&&this.assignments.users[3-slot]!==pad.index)this.assignments.assign(slot,pad);}
    this.assignments.sync(this.pads,this.hardware);
    if(this.assignments.users[2]===null){const second=this.pads.find(p=>p.index!==this.assignments.users[1]);if(second)this.assignments.assign(2,second);}
    const present=new Set(this.pads.map(key));for(const blocked of this.blocked)if(!present.has(blocked))this.blocked.delete(blocked);
  }
  state(){const slots=this.assignments.snapshot(this.pads);return {count:this.count,slots,readings:slots.map(slot=>slot?this.pads.find(p=>key(p)===key(slot)):null),automatic:this.assignments.automaticUser1,capture:this.capture?{slot:this.capture.slot,deadline:this.capture.deadline}:null,blocked:[...this.blocked],assignment:this.assignment};}
}
module.exports={ControllerHub};
