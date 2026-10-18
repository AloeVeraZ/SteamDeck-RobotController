'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeckControllers=factory();})(typeof self!=='undefined'?self:this,function(){
const signatures={steamdeck:/steam\s*deck|28de[\s\S]*1205/i,ally:/rog\s*(?:xbox\s*)?ally|0b05[\s\S]*(?:1abe|1b4c)/i,legion:/legion\s*go/i};
function connected(pads){return Array.from(pads||[]).filter(p=>p?.connected).sort((a,b)=>a.index-b.index);}
function defaultPad(pads,hardware){
  const all=connected(pads).filter(p=>p.mapping==='standard'),signature=signatures[hardware.controllerFamily||(hardware.steamDeck?'steamdeck':'')];
  // Steam Input and handheld drivers can expose the internal controls as an
  // ordinary Xbox controller. In that case use the OS's first standard gamepad.
  return (signature&&all.find(p=>signature.test(p.id)))||all.find(p=>/built[ -]?in|integrated|internal|handheld/i.test(p.id))||all.find(p=>p.mapping==='standard')||null;
}
function orderedPads(pads,hardware){const all=connected(pads),builtin=defaultPad(all,hardware);return builtin?[builtin,...all.filter(p=>p.index!==builtin.index)]:all;}
// A Gamepad ID is a driver description, not proof of the physical model. Keep
// it intact for routing; this presentation layer uses conservative model names.
function identity(pad,hardware={}){
  if(!pad)return {name:'No controller assigned',art:'generic',known:false,note:'Connect a controller and press a button.'};
  const id=String(pad.id||''),prefix=id.match(/^([\da-f]{4})-([\da-f]{4})-/i),vendor=(id.match(/vendor:\s*([\da-f]{4})/i)?.[1]||prefix?.[1])?.toLowerCase(),product=(id.match(/product:\s*([\da-f]{4})/i)?.[1]||prefix?.[2])?.toLowerCase();
  const result=(name,art='generic',note='Model identified from the controller’s reported product name.')=>({name,art,known:true,note});
  const usbNames={'054c:0ce6':['DualSense controller','playstation'],'054c:0df2':['DualSense Edge controller','playstation'],'054c:05c4':['DualShock 4 controller','playstation'],'054c:09cc':['DualShock 4 controller','playstation'],'054c:0ba0':['DualShock 4 USB receiver','playstation'],'054c:0268':['DualShock 3 / SIXAXIS controller','playstation'],'054c:0e5f':['PlayStation Access controller','playstation'],'057e:2009':['Nintendo Switch Pro controller','nintendo'],'057e:2006':['Nintendo Joy-Con (L)','nintendo'],'057e:2007':['Nintendo Joy-Con (R)','nintendo'],'057e:200e':['Nintendo Joy-Con pair / charging grip','nintendo'],'046d:c21d':['Logitech F310 controller'],'046d:c21e':['Logitech F510 controller'],'046d:c21f':['Logitech F710 controller']};
  const usbName=usbNames[vendor+':'+product];if(usbName)return result(usbName[0],usbName[1]||'generic','Identified from the reported vendor and product IDs. Virtual drivers can hide the physical model.');
  if(/steam\s*deck/i.test(id)||(vendor==='28de'&&product==='1205'))return result(hardware.controllerFamily==='steamdeck'&&hardware.model?hardware.model+' controls':'Steam Deck controls','steamdeck');
  if(/rog\s*(?:xbox\s*)?ally/i.test(id))return result(/ally x\b/i.test(id)?'ROG Ally X controls':'ROG Ally controls');
  if(/legion\s*go/i.test(id))return result(/legion go s\b/i.test(id)?'Lenovo Legion Go S controls':/legion go 2\b/i.test(id)?'Lenovo Legion Go 2 controls':'Lenovo Legion Go controls');
  if(/dualsense/i.test(id))return result(/edge/i.test(id)?'DualSense Edge controller':'DualSense controller','playstation');
  if(/dualshock\s*4|\bps4\b/i.test(id))return result('DualShock 4 controller','playstation');
  if(/xbox.*series|series [xs].*controller/i.test(id))return result('Xbox Series controller','xbox');
  if(/xbox\s*one/i.test(id))return result('Xbox One controller','xbox');
  if(/switch.*pro controller|pro controller.*switch/i.test(id))return result('Nintendo Switch Pro controller','nintendo');
  if(vendor==='046d'&&['c216','c218','c219'].includes(product))return result('Logitech controller','generic','This DirectInput product ID is shared by multiple Logitech models.');
  if(/logitech|8bitdo|gamesir|gulikit|steelseries|razer|powera|\bpdp\b|\bhori\b|nacon|turtle beach|\bscuf\b/i.test(id))return result(id.replace(/\s*\(.*$/,'').replace(/\s*\b(?:vendor|product):.*$/i,'').trim().slice(0,80));
  return {name:'Generic controller',art:'generic',known:false,note:/xinput|x.?box|28de/i.test(id)?'This Xbox-compatible or virtual driver does not reliably identify the physical controller.':'The physical model is not identifiable from this driver description.'};
}
function buttonLabels(pad){
  const labels=['A · South','B · East','X · West','Y · North','LB','RB','LT','RT','Back / View','Start / Menu','Left stick click','Right stick click','D-pad up','D-pad down','D-pad left','D-pad right','Guide / Home'];
  if(pad&&pad.mapping!=='standard')return labels.map((_,i)=>'Raw button '+i);
  const identified=identity(pad),art=identified.art;
  if(art==='nintendo')labels.splice(0,10,'B · South','A · East','Y · West','X · North','L','R','ZL','ZR','Minus','Plus');
  // A single Joy-Con can be presented sideways by the OS. Its orientation and
  // available face/rail buttons cannot be inferred from the product ID alone.
  if(/Joy-Con \([LR]\)/.test(identified.name))labels.splice(0,10,'South','East','West','North','Left shoulder','Right shoulder','Left trigger','Right trigger','Back / View','Start / Menu');
  if(art==='playstation')labels.splice(0,10,'Cross · South','Circle · East','Square · West','Triangle · North','L1','R1','L2','R2','Share / Create','Options');
  return labels;
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
return {defaultPad,orderedPads,Assignments,identity,buttonLabels};
});
