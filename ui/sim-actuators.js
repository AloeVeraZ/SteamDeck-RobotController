(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckActuators=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // What drives a mechanism on an FTC robot, as the team buys it and as the robot code commands it:
  //   servo     goes to a position: Servo.setPosition(0–1). The hub sends a pulse for each position; the servo turns to
  //             the angle that pulse stands for. Its named positions (claw open, closed) are positions between 0 and 1.
  //   crservo   a continuous rotation servo spins: CRServo.setPower(−1–1).
  //   dcmotor   a DC motor with an encoder: DcMotorEx RUN_TO_POSITION to a count, or a power. Its named positions are
  //             encoder counts, worked out from the counts per turn of its output and the gearing after it.
  //   linear    a linear servo (Actuonix L16-R, Hitec HLS12): pushes a rod out to a position, set like a servo.
  // Each model keeps its maker's numbers (sources in docs/MECHANISM_RESEARCH.md): servos at 6 V (a hub's own servo
  // ports give 5 V, a little slower). A part's settings (DeckKinematics actuators) hold the model, its name in the
  // robot configuration and, for a servo, its positions: min and max (where it may go), center (the position that
  // holds the part where the CAD has it), the degrees it turns across its rated pulses (range, pulse) and the pulses the
  // hub sends for 0 and 1 (pwm). BIOBUZZ (R503) allows 8 motors and 8 servos; pneumatics are not allowed (R801).
  const finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),NM=.0980665;// N·m per kg·cm
  // The FTC SDK sends 600 µs for position 0 and 2400 µs for 1 unless the code sets ServoImplEx.setPwmRange (or the
  // configuration says Full Range Servo); servos are rated over 500–2500 µs, so by default a 300° servo turns 270°.
  const PWM={standard:[600,2400],full:[500,2500]};
  const KINDS={servo:'Servo · goes to set positions',crservo:'Continuous servo · spins',dcmotor:'DC motor with encoder',linear:'Linear servo · pushes to set positions'};
  const kg=v=>+(v*NM).toFixed(3),per60=s=>+(60/s).toFixed(1),rpmOf=s=>Math.round(10/s);
  // Servos in servo mode: degrees across their rated pulses, speed (degrees a second, no load, 6 V) and stall torque.
  const s=(id,name,o)=>({id,name,kind:'servo',pulse:[500,2500],...o});
  const SERVOS=[
    s('gobilda-torque','goBILDA 2000 Dual Mode servo, Torque (2000-0025-0002)',{short:'goBILDA Torque servo',range:300,speed:per60(.2),torque:kg(21.6),cr:'gobilda-torque-cr'}),
    s('gobilda-speed','goBILDA 2000 Dual Mode servo, Speed (2000-0025-0003)',{short:'goBILDA Speed servo',range:300,speed:per60(.09),torque:kg(9.3),cr:'gobilda-speed-cr'}),
    s('gobilda-superspeed','goBILDA 2000 Dual Mode servo, Super Speed (2000-0025-0004)',{short:'goBILDA Super Speed servo',range:300,speed:per60(.043),torque:kg(4.7),cr:'gobilda-superspeed-cr'}),
    s('gobilda-5turn','goBILDA 2000 5-Turn servo (2000-0025-0503)',{short:'goBILDA 5-Turn servo',range:1800,speed:per60(.09),torque:kg(9.3)}),
    s('axon-max','Axon MAX MK2 (or MAX+)',{short:'Axon MAX',range:350,speed:per60(.115),torque:kg(34),cr:'axon-max-cr'}),
    s('axon-mini','Axon MINI MK2 (or MINI+)',{short:'Axon MINI',range:350,speed:per60(.09),torque:kg(25),cr:'axon-mini-cr'}),
    s('axon-micro','Axon MICRO+',{short:'Axon MICRO',range:350,speed:per60(.075),torque:kg(7.8),cr:'axon-micro-cr'}),
    s('rev-smart','REV Smart Robot Servo (REV-41-1097, V2 Balanced)',{short:'REV Smart Robot Servo',range:270,speed:per60(.14),torque:kg(13.5),cr:'rev-smart-cr'}),
    s('rev-smart-ultra','REV Smart Robot Servo V2 UltraSpeed (REV-41-3336)',{short:'REV Smart Robot Servo UltraSpeed',range:270,speed:per60(.043),torque:kg(5.6)}),
    s('studica-multimode','Studica Multi-Mode Smart Servo (75002)',{short:'Studica Multi-Mode servo',range:300,speed:per60(.2),torque:kg(21.6),cr:'studica-multimode-cr'}),
    s('hitec-485','Hitec HS-485HB (older TETRIX kits)',{short:'Hitec HS-485HB',range:190,pulse:[553,2425],speed:per60(.18),torque:kg(6)}),
    s('servo-180','Another servo (180° across 500–2500 µs)',{short:'180° servo',range:180,speed:300,torque:kg(10)})];
  // Continuous rotation servos (or servos switched to continuous mode): turns a minute at full power, no load.
  const c=(id,name,o)=>({id,name,kind:'crservo',...o});
  const CRSERVOS=[
    c('gobilda-torque-cr','goBILDA Torque servo, continuous mode',{short:'goBILDA Torque (continuous)',rpm:rpmOf(.2),torque:kg(21.6)}),
    c('gobilda-speed-cr','goBILDA Speed servo, continuous mode',{short:'goBILDA Speed (continuous)',rpm:rpmOf(.09),torque:kg(9.3)}),
    c('gobilda-superspeed-cr','goBILDA Super Speed servo, continuous mode',{short:'goBILDA Super Speed (continuous)',rpm:rpmOf(.043),torque:kg(4.7)}),
    c('axon-max-cr','Axon MAX, continuous mode',{short:'Axon MAX (continuous)',rpm:rpmOf(.115),torque:kg(34)}),
    c('axon-mini-cr','Axon MINI, continuous mode',{short:'Axon MINI (continuous)',rpm:rpmOf(.09),torque:kg(25)}),
    c('axon-micro-cr','Axon MICRO+, continuous mode',{short:'Axon MICRO (continuous)',rpm:rpmOf(.075),torque:kg(7.8)}),
    c('rev-smart-cr','REV Smart Robot Servo, continuous mode',{short:'REV Smart Robot Servo (continuous)',rpm:rpmOf(.14),torque:kg(13.5)}),
    c('studica-multimode-cr','Studica Multi-Mode Smart Servo, continuous mode',{short:'Studica Multi-Mode (continuous)',rpm:rpmOf(.2),torque:kg(21.6)})];
  // Linear servos: stroke (inches across their rated pulses: retracted at the first, out at the second), speed (inches
  // a second, no load) and force (N).
  const l=(id,name,o)=>({id,name,kind:'linear',pulse:[1000,2000],...o});
  const LINEARS=[
    l('actuonix-l16-50','Actuonix L16-R, 50 mm stroke, 63:1',{short:'Actuonix L16-R 50 mm',range:+(50/25.4).toFixed(3),speed:+(20/25.4).toFixed(3),force:100}),
    l('actuonix-l16-100','Actuonix L16-R, 100 mm stroke, 63:1',{short:'Actuonix L16-R 100 mm',range:+(100/25.4).toFixed(3),speed:+(20/25.4).toFixed(3),force:100}),
    l('actuonix-l16-140','Actuonix L16-R, 140 mm stroke, 63:1',{short:'Actuonix L16-R 140 mm',range:+(140/25.4).toFixed(3),speed:+(20/25.4).toFixed(3),force:100}),
    l('hitec-hls12','Hitec HLS12-3050 linear servo, 30 mm stroke',{short:'Hitec HLS12',range:+(30/25.4).toFixed(3),pulse:[1050,1950],speed:+(25/25.4).toFixed(3),force:49})];
  // DC motors: output speed (rpm, no load, 12 V), encoder counts per turn of the output and stall torque at the output.
  const m=(id,name,o)=>({id,name,kind:'dcmotor',...o});
  const yj=(ratio,rpm,cpr,torque,part)=>m(`gobilda-5203-${rpm}`,`goBILDA 5203 Yellow Jacket, ${ratio}:1 (${rpm} rpm)`,{short:`goBILDA ${rpm} rpm (${ratio}:1)`,family:'goBILDA 5203 Yellow Jacket',ratio,rpm,cpr,stall:torque,part});
  const MOTORS=[
    yj(1,6000,28,.144,'5203-2402-0001'),yj(3.7,1620,103.8,.53,'5203-2402-0003'),yj(5.2,1150,145.1,.77,'5203-2402-0005'),yj(13.7,435,384.5,1.83,'5203-2402-0014'),
    yj(19.2,312,537.7,2.38,'5203-2402-0019'),yj(26.9,223,751.8,3.73,'5203-2402-0027'),yj(50.9,117,1425.1,6.71,'5203-2402-0051'),yj(71.2,84,1993.6,9.18,'5203-2402-0071'),
    yj(99.5,60,2786.2,13.06,'5203-2402-0100'),yj(139,43,3895.9,18.14,'5203-2402-0139'),yj(188,30,5281.1,24.5,'5203-2402-0188'),
    m('rev-hd-hex','REV HD Hex motor, no gearbox (6000 rpm)',{short:'REV HD Hex (bare)',family:'REV HD Hex',ratio:1,rpm:6000,cpr:28,stall:.105}),
    m('rev-ultra-3','REV HD Hex with UltraPlanetary 3:1 (2.89:1)',{short:'REV UltraPlanetary 3:1',family:'REV UltraPlanetary',ratio:2.897,rpm:2071,cpr:81.1,stall:.304}),
    m('rev-ultra-4','REV HD Hex with UltraPlanetary 4:1 (3.61:1)',{short:'REV UltraPlanetary 4:1',family:'REV UltraPlanetary',ratio:3.619,rpm:1658,cpr:101.3,stall:.38}),
    m('rev-ultra-5','REV HD Hex with UltraPlanetary 5:1 (5.23:1)',{short:'REV UltraPlanetary 5:1',family:'REV UltraPlanetary',ratio:5.231,rpm:1147,cpr:146.4,stall:.55}),
    m('rev-ultra-12','REV HD Hex with UltraPlanetary 3:1 + 4:1 (10.5:1)',{short:'REV UltraPlanetary 12:1',family:'REV UltraPlanetary',ratio:10.48,rpm:572,cpr:293.6,stall:1.1}),
    m('rev-ultra-15','REV HD Hex with UltraPlanetary 3:1 + 5:1 (15.2:1)',{short:'REV UltraPlanetary 15:1',family:'REV UltraPlanetary',ratio:15.15,rpm:396,cpr:424.3,stall:1.59}),
    m('rev-ultra-20','REV HD Hex with UltraPlanetary 4:1 + 5:1 (18.9:1)',{short:'REV UltraPlanetary 20:1',family:'REV UltraPlanetary',ratio:18.93,rpm:317,cpr:530,stall:1.98}),
    m('rev-ultra-60','REV HD Hex with UltraPlanetary 3:1 + 4:1 + 5:1 (54.8:1)',{short:'REV UltraPlanetary 60:1',family:'REV UltraPlanetary',ratio:54.84,rpm:109.5,cpr:1535.3,stall:5.75}),
    m('rev-hd-hex-20','REV HD Hex with 20:1 spur gearbox (older)',{short:'REV HD Hex 20:1 spur',family:'REV HD Hex',ratio:20,rpm:300,cpr:560,stall:2.1}),
    m('rev-hd-hex-40','REV HD Hex with 40:1 spur gearbox (older)',{short:'REV HD Hex 40:1 spur',family:'REV HD Hex',ratio:40,rpm:150,cpr:1120,stall:4.2}),
    m('rev-core-hex','REV Core Hex motor',{short:'REV Core Hex',family:'REV Core Hex',ratio:72,rpm:125,cpr:288,stall:3.2}),
    m('torquenado','TETRIX TorqueNADO motor',{short:'TorqueNADO',family:'TETRIX',ratio:60,rpm:100,cpr:1440,stall:4.94}),
    m('studica-maverick','Studica Maverick motor (61:1)',{short:'Studica Maverick',family:'Studica',ratio:61,rpm:100,cpr:1464,stall:5}),
    m('neverest-20','AndyMark NeveRest Orbital 20 (older kits)',{short:'NeveRest Orbital 20',family:'AndyMark NeveRest',ratio:19.2,rpm:340,cpr:537.6,stall:1.24}),
    m('neverest-40','AndyMark NeveRest Classic 40 (older kits)',{short:'NeveRest Classic 40',family:'AndyMark NeveRest',ratio:40,rpm:160,cpr:1120,stall:2.47})];
  const ALL=[...SERVOS,...CRSERVOS,...LINEARS,...MOTORS],MODELS=Object.fromEntries(ALL.map(x=>[x.id,x]));
  const of=kind=>ALL.filter(x=>x.kind===kind);
  const isLinear=a=>a?.kind==='linear';
  // A servo's settings, its model's numbers filling what it does not set.
  function servo(a){const md=MODELS[a?.model],sv=a?.servo||{},lo=finite(sv.min)?sv.min:0,hi=finite(sv.max)?sv.max:1;
    return {min:Math.min(lo,hi),max:Math.max(lo,hi),center:finite(sv.center)?sv.center:.5,range:finite(sv.range)?sv.range:md?.range??(isLinear(a)?2:300),
      pulse:sv.pulse||md?.pulse||(isLinear(a)?[1000,2000]:[500,2500]),pwm:sv.pwm||PWM.standard};}
  // Degrees (inches) the servo turns per unit of position, with the pulses the hub sends.
  function perUnit(a){const v=servo(a);return v.range*(v.pwm[1]-v.pwm[0])/(v.pulse[1]-v.pulse[0]);}
  // The position (0–1) at which the hub sends a pulse.
  const at=(a,us)=>{const v=servo(a);return clamp((us-v.pwm[0])/(v.pwm[1]-v.pwm[0]),0,1);};
  const sign=a=>a?.reversed?-1:1,ratioOf=a=>finite(a?.ratio)&&a.ratio?a.ratio:1;
  // The servo position (0–1) that puts the part at a value (its degrees or inches from where the CAD has it), held
  // between min and max; and the value a position puts it at. ratio: actuator degrees per part degree (gearing).
  function position(a,value){const v=servo(a);return clamp(v.center+sign(a)*ratioOf(a)*value/perUnit(a),v.min,v.max);}
  function valueAt(a,pos){const v=servo(a);return (pos-v.center)*perUnit(a)/(sign(a)*ratioOf(a));}
  // How far the part can go between the servo's min and max.
  function limits(a){const v=servo(a),x=valueAt(a,v.min),y=valueAt(a,v.max);return [Math.min(x,y),Math.max(x,y)];}
  // Encoder counts per unit of the part's motion (per degree, or per inch through a spool or rack) and at a value.
  // (A motor that turns the other way is set to REVERSE in the code, so its counts keep their sign.)
  const countsPer=a=>(finite(a?.cpr)?a.cpr:MODELS[a?.model]?.cpr??28)*ratioOf(a)/360;
  const ticks=(a,value)=>Math.round(value*countsPer(a));
  // How fast the part moves at full power, in its units a second (null when the model says nothing).
  function speedOf(a){const md=MODELS[a?.model];if(!md)return null;const r=Math.abs(ratioOf(a));
    return md.kind==='servo'||md.kind==='linear'?md.speed/r:md.rpm*6/r;}
  // An actuator set to a model: its kind, how fast it moves the part, a DC motor's torque line (the simulator slows it
  // under load and it stalls past its torque) and encoder counts, a servo's range. The positions the team set stay; a
  // linear servo new to its model starts retracted where the CAD has it and may go out to its full stroke.
  function withModel(a,id){
    const md=MODELS[id],out={...a};if(!md){delete out.model;return out;}out.model=id;const was=out.kind;out.kind=md.kind;
    const sp=speedOf(out);if(sp)out.speed=+sp.toPrecision(4);
    if(md.kind==='dcmotor'){out.cpr=md.cpr;out.response='motor';out.motor={...(a.motor||{}),free:md.rpm*6,stall:md.stall};delete out.servo;}
    else{delete out.cpr;if(out.response==='motor'){delete out.response;delete out.motor;}}
    if(md.kind==='servo'||md.kind==='linear'){out.servo={...servo(a),range:md.range,pulse:md.pulse};
      if(md.kind==='linear'&&(was!=='linear'||!a.servo)){const lo=at(out,md.pulse[0]),hi=at(out,md.pulse[1]);Object.assign(out.servo,{min:+lo.toFixed(4),max:+hi.toFixed(4),center:+lo.toFixed(4)});}}
    else delete out.servo;
    return out;}
  // The model each kind starts with, and a fresh actuator for a part (spec: DeckMechanismTypes' usual motor).
  const DEFAULT={servo:'gobilda-torque',crservo:'gobilda-speed-cr',dcmotor:'gobilda-5203-312',linear:'actuonix-l16-50'};
  const camel=name=>{const w=String(name||'').replace(/[^A-Za-z0-9]+/g,' ').trim().split(' ').filter(Boolean);const s=w.map((x,i)=>i?x[0].toUpperCase()+x.slice(1).toLowerCase():x.toLowerCase()).join('');return /^[A-Za-z]/.test(s)?s.slice(0,40):'part'+s.slice(0,36);};
  // travel: inches a slide moves end to end. A turning servo or motor that drives a slide through a linkage (no spool,
  // rack or screw between them) is taken to cover that travel in its whole sweep (a servo from 0 to 1) or half a turn.
  // states: the part's named positions; a servo's center is set so they sit in the middle of its sweep (a virtual
  // four-bar's 0° to 180° fits a 315° servo from 0.21 to 0.79).
  function create({id,joint,name,spec={},speed=90,travel=null,states=null}={}){
    const kind=spec.kind||'servo',model=spec.model||DEFAULT[kind]||null;
    const a={id,name:name||id,joint,kind,mode:'position',speed,device:camel(name),...(spec.transmission?{transmission:spec.transmission.map(st=>({...st}))}:{}),...(spec.response?{response:spec.response}:{})};
    if(spec.transmission){const K=globalThis.DeckKinematics||(typeof require==='function'?require('./sim-kinematics.js'):null);if(K)a.ratio=K.stagesRatio(spec.transmission);}
    let out=model&&MODELS[model]?withModel(a,model):a;
    if(finite(travel)&&travel>0&&!spec.transmission&&(kind==='servo'||kind==='dcmotor'||kind==='crservo')){out={...out,ratio:+((kind==='servo'?perUnit(out):180)/travel).toPrecision(6)};const sp=speedOf(out);if(sp)out.speed=+sp.toPrecision(4);}
    const v=Object.values(states||{}).filter(finite);
    if(kind==='servo'&&v.length){const mid=(Math.min(...v)+Math.max(...v))/2;out={...out,servo:{...servo(out),center:+clamp(.5-sign(out)*ratioOf(out)*mid/perUnit(out),0,1).toFixed(4)}};}
    return out;}
  // How far a slide moves end to end: its limits, else its named positions.
  const travelOf=j=>{if(j?.type!=='prismatic')return null;if(finite(j.lower)&&finite(j.upper)&&j.upper>j.lower)return j.upper-j.lower;const v=Object.values(j.states||{}).filter(finite);return v.length>1?Math.max(...v)-Math.min(...v):null;};
  // What the robot code needs for one actuator: its class, configuration name, direction and each named position the
  // way the code sends it (a servo's position, a motor's encoder count). states: the part's named positions.
  function device(a,states={}){
    const kind=a?.kind,name=a?.device||camel(a?.name);
    if(kind==='servo'||kind==='linear')return {type:'Servo',name,positions:Object.fromEntries(Object.entries(states).map(([k,v])=>[k,+position(a,v).toFixed(4)])),...(a.servo?.pwm&&a.servo.pwm.join()!==PWM.standard.join()?{pwm:a.servo.pwm}:{})};
    if(kind==='crservo')return {type:'CRServo',name,reversed:!!a.reversed,power:a.power??1};
    if(kind==='dcmotor')return {type:'DcMotorEx',name,reversed:!!a.reversed,countsPerTurn:finite(a.cpr)?a.cpr:MODELS[a.model]?.cpr??28,ticks:Object.fromEntries(Object.entries(states).map(([k,v])=>[k,ticks(a,v)])),power:a.power??1};
    return null;}
  // One line on what it is and how fast it moves the part.
  function describe(a,unit='°'){const md=MODELS[a?.model],sp=speedOf(a);if(!md)return '';
    if(md.kind==='servo'||md.kind==='linear'){const per=perUnit(a);return `${md.short}: ${+per.toFixed(md.kind==='linear'?2:1)}${md.kind==='linear'?' in':'°'} from position 0 to 1 with these pulses${sp?`, about ${+sp.toFixed(1)} ${unit}/s at the part`:''}.`;}
    if(md.kind==='crservo')return `${md.short}: about ${md.rpm} rpm at full power${sp&&Math.abs(ratioOf(a))!==1?`, ${+sp.toFixed(1)} ${unit}/s at the part`:''}.`;
    return `${md.short}: ${md.cpr} counts a turn, ${+(countsPer(a)).toFixed(2)} counts per ${unit==='in'?'inch':'degree'} of the part, up to about ${+sp.toFixed(1)} ${unit}/s with no load.`;}
  return {PWM,KINDS,SERVOS,CRSERVOS,LINEARS,MOTORS,MODELS,ALL,DEFAULT,of,servo,perUnit,position,valueAt,limits,countsPer,ticks,speedOf,withModel,create,travelOf,device,describe,camel};
});
