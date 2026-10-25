'use strict';
// A recorded run for the Video workspace tests, frame by frame at 30 a second like the app records: the robot stands
// still for 1 s, drives forward, strafes left, runs its intake with the ramp down into a flower, turns its turret,
// shoots twice and stops. Field frame: inches from the bottom-left corner; balls are centre-origin like the engine's.
function videoRun(){
  const frames=[],dt=1/30;let x=24,y=30,vx=0,vy=0,turret=0,launched=0,picked=0,ramp=0,flight=null;
  for(let i=0;i<=8*30;i++){
    const t=i*dt;vx=t>=1&&t<3?30:0;vy=t>=3&&t<4.5?20:0;x+=vx*dt;y+=vy*dt;
    const intake=t>=3.5&&t<5.5,shooting=t>=6.2&&t<7;ramp=Math.max(0,Math.min(1,ramp+(intake?dt/.3:-dt/.3)));
    if(t>=5&&t<6)turret=Math.min(120,turret+240*dt);
    if(Math.abs(t-4.6)<dt/2||Math.abs(t-4.9)<dt/2)picked++;
    if(Math.abs(t-6.3)<dt/2||Math.abs(t-6.7)<dt/2){launched++;flight={id:40+launched,t0:t};}
    const balls=[{id:1,color:'yellow',r:1.4,state:{kind:'element',el:'flower:0',slot:0},pos:{x:-68,y:-23},z:0},{id:2,color:'yellow',r:1.4,state:{kind:'ground'},pos:{x:(x+18)-72,y:y-72},z:0}];
    if(flight&&t-flight.t0<1){const k=(t-flight.t0)/1;balls.push({id:flight.id,color:'yellow',r:1.4,state:{kind:'flight',target:'red',by:'red'},pos:{x:x-72+k*30,y:y-72+k*20},z:14+40*k-30*k*k});}
    frames.push({time:10+t,truth:{x,y,heading:0,vx,vy,omega:0,z:0},
      mechanisms:{flywheel:t>=5.6?1:0,turret,turrets:[turret],aligned:true,ready:t>=6,held:4-launched+picked,ramps:[ramp],kickers:[],launched,pickedUp:picked,score:launched*5,
        command:{intake,spin:t>=5.6&&t<7,aim:t>=5&&t<7,feed:shooting}},fieldState:{game:'biobuzz',balls},acting:intake?'Intake':shooting?'Shoot':null});
  }
  return frames;
}
const context=()=>({footprint:{front:8.5,rear:8.5,half:8},bounds:{x0:1.326,y0:1.326,x1:142.674,y1:142.674},robot:{length:17,width:16,heightIn:14},
  aim:{shooters:[{type:'turret',mount:'center',facing:'front',pieces:'pollen'}],dims:{length:17,width:16},targets:[{x:59.25,y:58.56},{x:59.25,y:85.44}]},
  mechanisms:{enabled:true,intakes:[{kind:'ramp',sides:['front'],height:4}],shooters:[{type:'turret',mount:'center',facing:'front',indexerKind:'motor'}]}});
module.exports={videoRun,context};
