'use strict';
// UDP transport for the FTC Driver Station page. Robot Controllers always reply to port 20884,
// so the station binds that port on the interface that routes to the robot.
const dgram=require('node:dgram'),dns=require('node:dns/promises'),net=require('node:net');
const Robocol=require('../ui/ftc/robocol.js');
async function resolve(host){if(net.isIP(host)===4)return host;return (await dns.lookup(host,{family:4})).address;}
function localAddressFor(address){
  return new Promise(done=>{const s=dgram.createSocket('udp4');const finish=a=>{try{s.close();}catch{}done(a);};s.once('error',()=>finish('0.0.0.0'));s.connect(Robocol.PORT,address,()=>{let a='0.0.0.0';try{a=s.address().address;}catch{}finish(a);});});
}
class FtcSocket {
  constructor(host){this.host=host;this.listeners=new Set();this.socket=null;}
  async open(){
    this.address=await resolve(this.host).catch(()=>{throw Error(`Could not find the robot address ${this.host}.`);});
    const local=await localAddressFor(this.address),socket=dgram.createSocket('udp4');
    try{await new Promise((ok,fail)=>{socket.once('error',fail);socket.bind(Robocol.PORT,local,()=>{socket.off('error',fail);ok();});});}
    catch(e){try{socket.close();}catch{}if(e.code==='EADDRINUSE')throw Error('UDP port 20884 is in use by another program. Close other FTC Driver Station apps or emulators, then try again.');throw Error(`Could not open the FTC robot connection: ${e.message}`);}
    socket.on('message',(msg,from)=>{if(from.address===this.address&&from.port===Robocol.PORT)for(const fn of this.listeners)fn(new Uint8Array(msg.buffer,msg.byteOffset,msg.length));});
    socket.on('error',()=>{});this.socket=socket;return this;
  }
  onPacket(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  send(bytes){if(!this.socket||!(bytes instanceof Uint8Array)||bytes.length<5||bytes.length>65507)return;this.socket.send(bytes,Robocol.PORT,this.address,()=>{});}
  async close(){const s=this.socket;this.socket=null;this.listeners.clear();if(s)await new Promise(r=>{try{s.close(r);}catch{r();}});}
}
// Detects a Robot Controller by peer discovery; any discovery reply (including "another DS connected") is FTC.
async function probeFtc(host,{timeout=1500}={}){
  let socket;try{socket=await new FtcSocket(host).open();}catch(e){return {ftc:false,error:e.message};}
  return new Promise(done=>{
    let seq=1,finished=false;const finish=result=>{if(finished)return;finished=true;clearInterval(timer);clearTimeout(limit);void socket.close().then(()=>done(result));};
    socket.onPacket(bytes=>{try{const p=Robocol.decode(bytes);if(p.type===Robocol.Msg.PEER_DISCOVERY)finish({ftc:true,robocol:p.version,sdk:`${p.major}.${p.minor}`});}catch{}});
    const ping=()=>socket.send(Robocol.encodePeerDiscovery({seq:seq++}));ping();const timer=setInterval(ping,300),limit=setTimeout(()=>finish({ftc:false}),timeout);
  });
}
module.exports={FtcSocket,probeFtc};
