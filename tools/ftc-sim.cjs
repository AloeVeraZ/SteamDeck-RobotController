'use strict';
// Simulated FTC Robot Controller for tests and previews. Behaves like a Control Hub on Robocol:
// answers discovery, echoes heartbeats, acknowledges commands, and runs pretend op modes.
const dgram=require('node:dgram');const R=require('../ui/ftc/robocol.js');
const OP_MODES=[
  {flavor:'AUTONOMOUS',group:'$$$$$$$',name:'Blue Auto',autoTransition:'Field Centric TeleOp',source:'ANDROID_STUDIO'},
  {flavor:'AUTONOMOUS',group:'Test',name:'Red Auto',source:'BLOCKLY'},
  {flavor:'TELEOP',group:'$$$$$$$',name:'Field Centric TeleOp',source:'ANDROID_STUDIO'},
  {flavor:'TELEOP',group:'Test',name:'Servo Tuner',source:'ONBOTJAVA'},
  {flavor:'SYSTEM',group:'$$$$$$$',name:'$Stop$Robot$',systemOpModeBaseDisplayName:'Stop Robot'}
];
class SimController {
  constructor({send,version=R.VERSION,reject=false,opModes=OP_MODES,battery='12.84'}={}){
    this.send=send;this.version=version;this.reject=reject;this.opModes=opModes;this.battery=battery;this.seq=0;this.stamp=1n;
    this.peer=false;this.lastPacket=0;this.opMode=R.STOP_OP_MODE;this.opState='stopped';this.gamepads={};this.commands=[];this.pending=[];this.timers=[];this.robotState=0;this.heartbeats=0;
  }
  start(){this.timers.push(setInterval(()=>this.loop(),50),setInterval(()=>this.telemetry(),250));return this;}
  stop(){for(const t of this.timers)clearInterval(t);this.timers=[];}
  next(){this.seq=(this.seq+1)&0xffff;return this.seq;}
  command(name,extra=''){const c={name,extra,timestamp:this.stamp++,seq:this.next(),sent:0,tries:0};this.pending.push(c);this.flush();}
  flush(){const now=Date.now();this.pending=this.pending.filter(c=>{if(c.tries>10)return false;if(now-c.sent>200){c.tries++;c.sent=now;this.send(R.encodeCommand(c));}return true;});}
  loop(){if(this.peer&&Date.now()-this.lastPacket>2000){this.peer=false;if(this.opMode!==R.STOP_OP_MODE)this.setOpMode(R.STOP_OP_MODE,'stopped',true);}this.flush();}
  setOpMode(name,state,quiet=false){const streaming=state!=='stopped';if(streaming!==(this.opState!=='stopped')&&!quiet)this.command('CMD_STREAM_CHANGE',String(streaming));this.opMode=name;this.opState=state;this.robotState=state==='running'?2:state==='init'?1:0;if(!quiet)this.command(state==='running'?'CMD_NOTIFY_RUN_OP_MODE':'CMD_NOTIFY_INIT_OP_MODE',name);}
  telemetry(){
    if(!this.peer)return;
    this.send(R.encodeTelemetry({tag:R.Tags.BATTERY,robotState:this.robotState,strings:[[R.Tags.BATTERY,this.battery]]}));
    if(this.opState==='stopped')return;
    const g=this.gamepads[1];
    this.send(R.encodeTelemetry({robotState:this.robotState,strings:[['\0ƀ',`Op mode : ${this.opMode}`],['\0Ɓ',`State : ${this.opState}`],['\0Ƃ',`Gamepad 1 left_stick_y : ${(g?.left_stick_y??0).toFixed(2)}`],['\0ƃ',`Gamepad 1 a : ${!!g?.a}`]]}));
  }
  receive(bytes){
    let p;try{p=R.decode(bytes);}catch{return;}this.lastPacket=Date.now();
    if(p.type===R.Msg.PEER_DISCOVERY){
      const accepted=!this.reject&&p.version===this.version;this.send(R.encodePeerDiscovery({seq:this.next(),version:this.version,peerType:this.reject?R.PeerType.REJECTED:R.PeerType.PEER,month:9,year:2025,major:11,minor:0}));
      if(accepted&&!this.peer){this.peer=true;if(this.opMode!==R.STOP_OP_MODE)this.command(this.opState==='running'?'CMD_NOTIFY_RUN_OP_MODE':'CMD_NOTIFY_INIT_OP_MODE',this.opMode);}return;
    }
    if(!this.peer)return;
    if(p.type===R.Msg.HEARTBEAT){this.heartbeats++;this.send(R.encodeHeartbeat({...p,seq:p.seq,robotState:this.robotState,t1:Date.now(),t2:Date.now()}));}
    else if(p.type===R.Msg.GAMEPAD){if(p.user===1||p.user===2)this.gamepads[p.user]=p;}
    else if(p.type===R.Msg.COMMAND){
      if(p.acknowledged){this.pending=this.pending.filter(c=>!(c.name===p.name&&c.timestamp===p.timestamp));return;}
      this.send(R.encodeCommand({...p,acknowledged:true}));
      if(this.commands.some(c=>c.name===p.name&&c.timestamp===p.timestamp))return;this.commands.push(p);this.handle(p.name,p.extra);
    }
  }
  handle(name,extra){
    if(name==='CMD_REQUEST_OP_MODE_LIST'){this.command('CMD_NOTIFY_OP_MODE_LIST',JSON.stringify(this.opModes));this.send(R.encodeTelemetry({tag:R.Tags.NONE,strings:[[R.Tags.NONE,'']]}));}
    else if(name==='CMD_REQUEST_ACTIVE_CONFIG')this.command('CMD_NOTIFY_ACTIVE_CONFIGURATION',JSON.stringify({name:'competition',isDirty:false,location:'LOCAL_STORAGE',resourceId:0}));
    else if(name==='CMD_INIT_OP_MODE')this.setOpMode(extra,extra===R.STOP_OP_MODE?'stopped':'init');
    else if(name==='CMD_RUN_OP_MODE'){if(this.opMode!==extra)this.setOpMode(extra,'init');this.setOpMode(extra,'running');}
    else if(name==='CMD_RESTART_ROBOT'){this.setOpMode(R.STOP_OP_MODE,'stopped');this.command('CMD_SHOW_TOAST',JSON.stringify({message:'Restarting Robot',duration:1}));}
    else if(name==='CMD_REQUEST_FRAME'){const jpeg=Buffer.from(SAMPLE_JPEG,'base64');this.command('CMD_RECEIVE_FRAME_BEGIN',JSON.stringify({frameNum:1,length:jpeg.length}));this.command('CMD_RECEIVE_FRAME_CHUNK',JSON.stringify({frameNum:1,chunkNum:0,encodedData:jpeg.toString('base64')}));}
    else if(name==='CMD_REQUEST_ABOUT_INFO')this.command('CMD_REQUEST_ABOUT_INFO_RESP',JSON.stringify({appVersion:'11.0',libVersion:'11.0',networkProtocolVersion:String(this.version),buildTime:'2025-09-01',networkConnectionInfo:'Simulated Control Hub',osVersion:'7.1.2'}));
  }
}
// 160x120 colour-bar JPEG used as the simulated camera frame.
const SAMPLE_JPEG='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAB4AKADASIAAhEBAxEB/8QAGgABAAMBAQEAAAAAAAAAAAAAAAMFBwYEAv/EAC4QAQAAAwUHAgYDAAAAAAAAAAABAgMEBQYzNjI0coGCsbJUkxEUFTFV0RJRkv/EABoBAAIDAQEAAAAAAAAAAAAAAAAFAwQGAgH/xAAqEQEAAQEECgMAAwAAAAAAAAAAAQUCAwQ0ETEyM0JxcoGxwRJBUSEiYf/aAAwDAQACEQMRAD8A5QBrkAubm3Sbjj2gplzc26Tcce0Cqs5WecK2K3awAZEtR1sqZ5XqrZUzypbGprqBlrXVPiAB0eO1AZ4kEtPZ5oktPZ5r1N3/AGR3uy+gGhVlLjDTFs6POVmLTsYaYtnR5ysxAAAFiA1yAXNzbpNxx7QUy5ubdJuOPaBVWcrPOFbFbtYAMiWo62VM8r1VsqZ5UtjU11Ay1rqnxAA6PHagM8SCWns80SWns816m7/sjvdl9ANCrKXGGmLZ0ecrMWnYw0xbOjzlZiAAALEBrkAubm3Sbjj2gplzc26Tcce0Cqs5WecK2K3awAZEtR1sqZ5XqrZUzypbGprqBlrXVPiAB0eO1AZ4kEtPZ5oktPZ5r1N3/ZHe7L6AaFWUuMNMWzo85WYtOxhpi2dHnKzEAAAWIDXIBc3Nuk3HHtBTLm5t0m449oFVZys84VsVu1gAyJajrZUzyvVWypnlS2NTXUDLWuqfEADo8dqAzxIJaezzRJaezzXqbv8Asjvdl9ANCrKXGGmLZ0ecrMWnYw0xbOjzlZiAAALEBrkAubm3Sbjj2gplzc26Tcce0Cqs5WecK2K3awAZEtR1sqZ5XqrZUzypbGprqBlrXVPiAB0eO1AZ4kEtPZ5oktPZ5r1N3/ZHe7L6AaFWUuMNMWzo85WYtOxhpi2dHnKzEAAAWIDXIBc3Nuk3HHtBTLm5t0m449oFVZys84VsVu1gAyJajrZUzyvVWypnlS2NTXUDLWuqfEADo8dqAzxIJaezzRJaezzXqbv+yO92X0A0KspcYaYtnR5ysxadjDTFs6POVmIAAAsWmfS7u9BZfZl/TM2rnFTtTHw0T++kdhlDUJLDY6cPhTslCWH3+EtOEGXtXeVXVZjn6FiInW5F1Hylm9PS/wAQcu65ncNETp0qOAiJ+Wn/AD242tlTOr+RsfpaHtwcpWypnZPcNH8St4G1MYaNE8U+LLg3a/I2P0tD24OKd47uY1nlRtTHx0T++kCb+MP6ghTltLsxa+emPz2o306kCeEIQ+yBO9pUR/eeXsX30AHCBS4w0xbOjzle36Pdf42x+xL+nixhpi2dHnKugGLtb+j3X+NsfsS/pkjaAGUNXA3qvB39I7DKGrgKrwd/QsORdcDPYb7Uqfxdvbja2VM7IHuG1Ss4LLR1T4suDd4Dq5+zypcPf0gTgXUrj7e1K++kCcBSuPt7F99ABwgUuMNMWzo85V0ADF20AA//2Q==';
// UDP robot bound to its own loopback address so a station on 127.0.0.1 can use the same port.
async function startUdpRobot({address='127.0.0.2',...options}={}){
  const socket=dgram.createSocket('udp4');await new Promise((ok,fail)=>{socket.once('error',fail);socket.bind(R.PORT,address,ok);});
  let station=null;const sim=new SimController({...options,send:bytes=>{if(station)socket.send(bytes,R.PORT,station);}});
  socket.on('message',(msg,from)=>{if(from.port!==R.PORT)return;station=from.address;sim.receive(new Uint8Array(msg.buffer,msg.byteOffset,msg.length));});
  sim.start();return {sim,address,close:()=>{sim.stop();return new Promise(r=>socket.close(r));}};
}
module.exports={SimController,startUdpRobot,OP_MODES};
if(require.main===module){const address=process.argv[2]||'127.0.0.2';startUdpRobot({address}).then(()=>console.log(`Simulated FTC Robot Controller on ${address}:${R.PORT}`)).catch(e=>{console.error(e.message);process.exit(1);});}
