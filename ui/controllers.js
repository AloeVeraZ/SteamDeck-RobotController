'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeckControllers=factory();})(typeof self!=='undefined'?self:this,function(){
const signatures={steamdeck:/steam\s*deck|28de[\s\S]*1205/i,ally:/rog\s*(?:xbox\s*)?ally|0b05[\s\S]*(?:1abe|1b4c)/i,legion:/legion\s*go/i};
function connected(pads){return Array.from(pads||[]).filter(p=>p?.connected).sort((a,b)=>a.index-b.index);}
function defaultPad(pads,hardware){
  const all=connected(pads),signature=signatures[hardware.controllerFamily||(hardware.steamDeck?'steamdeck':'')];
  // Steam Input and handheld drivers can expose the internal controls as an
  // ordinary Xbox controller. In that case use the OS's first standard gamepad.
  return (signature&&all.find(p=>signature.test(p.id)))||all.find(p=>/built[ -]?in|integrated|internal|handheld/i.test(p.id))||all.find(p=>p.mapping==='standard')||null;
}
function orderedPads(pads,hardware){const all=connected(pads),builtin=defaultPad(all,hardware);return builtin?[builtin,...all.filter(p=>p.index!==builtin.index)]:all;}
class Assignments{
  constructor(){this.users={1:null,2:null};this.identities={1:null,2:null};this.automaticUser1=false;}
  assign(user,pad,{swap=false,automatic=false}={}){
    const other=3-user,released=[];
    if(user===1||this.users[other]===pad.index)this.automaticUser1=user===1&&automatic;
    if(this.users[user]===pad.index&&this.identities[user]===pad.id)return {changed:false,released};
    if(this.users[other]===pad.index){this.users[other]=swap?this.users[user]:null;this.identities[other]=swap?this.identities[user]:null;released.push(other);}
    this.users[user]=pad.index;this.identities[user]=pad.id;return {changed:true,released};
  }
  sync(pads,hardware){
    const all=connected(pads),disconnected=[];
    for(const user of [1,2])if(this.users[user]!==null&&!all.some(p=>p.index===this.users[user]&&p.id===this.identities[user])){this.users[user]=null;this.identities[user]=null;disconnected.push(user);}
    const candidate=this.users[1]===null||this.automaticUser1?defaultPad(all.filter(p=>p.index!==this.users[2]),hardware):null;
    // Manual assignments win, including moving the internal controller to User 2.
    const automatic=candidate&&candidate.index!==this.users[1]?candidate:null;
    if(automatic)this.assign(1,automatic,{automatic:true});
    return {disconnected,automatic};
  }
  snapshot(pads){const all=connected(pads);return [1,2].map(user=>{const p=all.find(p=>p.index===this.users[user]&&p.id===this.identities[user]);return p?{id:p.id,index:p.index,mapping:p.mapping,connected:true}:null;});}
}
return {defaultPad,orderedPads,Assignments};
});
