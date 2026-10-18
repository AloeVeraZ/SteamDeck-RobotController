'use strict';
const {Assignments}=require('../ui/controllers.js');
const key=p=>p?`${p.index}:${p.id}`:'';
class ControllerHub{
  constructor({hardware={},preferred=[],persist=()=>{}}={}){this.hardware=hardware;this.preferred=preferred;this.persist=persist;this.assignments=new Assignments();this.pads=[];this.count=1;this.capture=null;this.blocked=new Set();this.assignment=null;}
  setCount(count){if(![1,2].includes(count))throw Error('Choose one or two controllers.');this.count=count;if(count===1){this.assignments.users[2]=null;this.assignments.identities[2]=null;if(this.capture?.slot===2)this.capture=null;}}
  begin(slot,now=Date.now()){if(!Number.isInteger(slot)||slot<1||slot>this.count)throw Error('Enable two controllers in this robot’s Settings to assign controller 2.');this.capture={slot,deadline:now+15000,waiting:new Set(this.pads.filter(p=>p.pressed||p.axesActive).map(key))};}
  cancel(){this.capture=null;}
  tick(now=Date.now()){if(this.capture&&now>=this.capture.deadline)this.capture=null;}
  ingest(values){
    const seen=new Set();this.pads=Array.from(Array.isArray(values)?values:[]).slice(0,16).filter(p=>p&&p.connected&&Number.isInteger(p.index)&&p.index>=0&&p.index<16&&typeof p.id==='string'&&p.id.length<=2048&&!seen.has(p.index)&&seen.add(p.index)).map(p=>({id:p.id,index:p.index,mapping:p.mapping==='standard'?'standard':'',connected:true,pressed:!!p.pressed,axesActive:!!p.axesActive}));
    // Clear stale identities before restoring a saved choice, including when a
    // controller reconnects under a different browser index.
    for(const slot of [1,2])if(!this.pads.some(p=>p.index===this.assignments.users[slot]&&p.id===this.assignments.identities[slot])){this.assignments.users[slot]=null;this.assignments.identities[slot]=null;}
    this.tick();for(const p of this.pads)if(!p.pressed&&!p.axesActive)this.blocked.delete(key(p));
    if(this.capture){
      for(const p of this.pads)if(!p.pressed&&!p.axesActive)this.capture.waiting.delete(key(p));
      const selected=this.pads.find(p=>p.pressed&&!this.capture.waiting.has(key(p)));
      if(selected){const slot=this.capture.slot;this.assignments.assign(slot,selected,{swap:true});this.assignment={slot,id:selected.id,serial:(this.assignment?.serial||0)+1};this.capture=null;for(const p of this.assignments.snapshot(this.pads))if(p)this.blocked.add(key(p));this.preferred=this.assignments.snapshot(this.pads);this.persist(this.preferred);}
    }
    for(const slot of [1,2])if(slot<=this.count&&this.assignments.users[slot]===null){const wanted=this.preferred[slot-1],pad=wanted&&this.pads.find(p=>p.id===wanted.id&&p.index===wanted.index)||wanted&&this.pads.find(p=>p.id===wanted.id);if(pad&&this.assignments.users[3-slot]!==pad.index)this.assignments.assign(slot,pad);}
    this.assignments.sync(this.pads,this.hardware);
    if(this.count===2&&this.assignments.users[2]===null){const second=this.pads.find(p=>p.index!==this.assignments.users[1]);if(second)this.assignments.assign(2,second);}
    if(this.count===1){this.assignments.users[2]=null;this.assignments.identities[2]=null;}
    const present=new Set(this.pads.map(key));for(const blocked of this.blocked)if(!present.has(blocked))this.blocked.delete(blocked);
  }
  state(){return {count:this.count,slots:this.assignments.snapshot(this.pads),capture:this.capture?{slot:this.capture.slot,deadline:this.capture.deadline}:null,blocked:[...this.blocked],assignment:this.assignment};}
}
module.exports={ControllerHub};
