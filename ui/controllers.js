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
// A Gamepad ID is a driver description, not proof of the physical model. Keep
// it intact for routing; this presentation layer uses conservative model names.
function identity(pad,hardware={}){
  if(!pad)return {name:'No controller assigned',art:'generic',known:false,note:'Connect a controller and press a button.'};
  const id=String(pad.id||''),vendor=id.match(/vendor:\s*([\da-f]{4})/i)?.[1]?.toLowerCase(),product=id.match(/product:\s*([\da-f]{4})/i)?.[1]?.toLowerCase();
  const result=(name,art='generic',note='Model identified from the controller’s reported product name.')=>({name,art,known:true,note});
  if(/steam\s*deck/i.test(id)||(vendor==='28de'&&product==='1205'))return result(hardware.controllerFamily==='steamdeck'&&hardware.model?hardware.model+' controls':'Steam Deck controls','steamdeck');
  if(/rog\s*(?:xbox\s*)?ally/i.test(id))return result(/ally x\b/i.test(id)?'ROG Ally X controls':'ROG Ally controls');
  if(/legion\s*go/i.test(id))return result(/legion go s\b/i.test(id)?'Lenovo Legion Go S controls':/legion go 2\b/i.test(id)?'Lenovo Legion Go 2 controls':'Lenovo Legion Go controls');
  if(/dualsense/i.test(id))return result(/edge/i.test(id)?'DualSense Edge controller':'DualSense controller','playstation');
  if(/dualshock\s*4|\bps4\b/i.test(id))return result('DualShock 4 controller','playstation');
  if(/xbox.*series|series [xs].*controller/i.test(id))return result('Xbox Series controller','xbox');
  if(/xbox\s*one/i.test(id))return result('Xbox One controller','xbox');
  if(/switch.*pro controller|pro controller.*switch/i.test(id))return result('Nintendo Switch Pro controller');
  if(/8bitdo/i.test(id))return result(id.replace(/\s*\(.*$/,'').replace(/\s*\b(?:vendor|product):.*$/i,'').trim().slice(0,80));
  return {name:'Generic controller',art:'generic',known:false,note:/xinput|x.?box|28de/i.test(id)?'This Xbox-compatible or virtual driver does not reliably identify the physical controller.':'The physical model is not identifiable from this driver description.'};
}
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
return {defaultPad,orderedPads,Assignments,identity};
});
