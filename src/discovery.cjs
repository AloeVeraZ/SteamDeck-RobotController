'use strict';
const http=require('node:http');
const {probeFtc}=require('./ftc.cjs');
const ipv4=s=>typeof s==='string'&&/^\d+\.\d+\.\d+\.\d+$/.test(s)&&s.split('.').every(n=>Number(n)>=0&&Number(n)<=255);
const integer=s=>s.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0);
function eligibility(c){
  if(!c.connected||!c.ssid||!c.device)return 'Connect to the robot’s Wi-Fi first.';
  if(c.internet==='full'||c.internet==='portal')return 'Automatic finding is off for internet-connected or captive-portal networks. Use a saved or manual robot address.';
  if(!ipv4(c.address)||!ipv4(c.gateway)||!Number.isInteger(c.prefix)||c.prefix<8||c.prefix>30)return 'The Wi-Fi gateway/subnet is unavailable. Enter the robot address manually.';
  const g=integer(c.gateway),a=integer(c.address),mask=(0xffffffff<<(32-c.prefix))>>>0,subnet=(a&mask)>>>0,broadcast=(subnet|(~mask>>>0))>>>0;
  if(!(c.gateway.startsWith('10.')||c.gateway.startsWith('192.168.')||/^172\.(1[6-9]|2\d|3[01])\./.test(c.gateway))||((g&mask)>>>0)!==subnet||g===a||g===subnet||g===broadcast)return 'Automatic finding needs a private gateway on this Wi-Fi’s subnet. Enter the address manually.';
  return '';
}
const same=(a,b)=>['ssid','device','address','prefix','gateway'].every(k=>a[k]===b[k]);
async function probeWeb(url,{address,signal}){
  return new Promise(resolve=>{
    let done=false,req;const finish=result=>{if(done)return;done=true;resolve(result);req?.destroy();};
    req=http.get(url,{localAddress:address,signal,timeout:1800,headers:{'User-Agent':'DeckDriverStation-discovery','Accept':'text/html'}},res=>{let body='';if(res.statusCode===401){finish({url,name:'Robot sign-in',protected:true});return;}if([301,302,303,307,308].includes(res.statusCode)){let sameOrigin=false;try{sameOrigin=new URL(res.headers.location,url).origin===new URL(url).origin;}catch{}finish(sameOrigin?{url,name:'Website on robot hotspot (redirect)'}:null);return;}if(res.statusCode!==200||!/text\/html/i.test(res.headers['content-type']||'')){finish(null);return;}res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;if(body.length>65536)finish(parse(body));});res.on('end',()=>finish(parse(body)));res.on('error',()=>finish(null));});
    function parse(body){const title=body.match(/<title[^>]*>([^<]{1,180})<\/title>/i)?.[1]?.trim();return {url,name:title||'Website on robot hotspot'};}
    req.on('timeout',()=>finish(null));req.on('error',()=>finish(null));
  });
}
async function discover({network,ssid,confirmed,signal,httpProbe=probeWeb,ftcProbe=probeFtc}){
  if(confirmed!==true)throw Error('Confirm that this Wi-Fi is hosted by the robot, not a home/shared network.');
  const context=await network.context();if(context.ssid!==ssid)throw Error('Wi-Fi changed. Confirm the current robot hotspot again.');const reason=eligibility(context);if(reason)throw Error(reason);
  const ensure=async()=>{const next=await network.context();if(signal?.aborted||!same(context,next)||eligibility(next))throw Error('Wi-Fi changed or finding was cancelled. No result was selected.');};
  await ensure();const ftc=await ftcProbe(context.gateway,{timeout:900,localAddress:context.address});await ensure();
  if(ftc.ftc)return {ssid,gateway:context.gateway,internet:context.internet,candidates:[{url:`http://${context.gateway}:8080/`,name:'FTC Robot Controller',kind:'ftc'}]};
  // One host only. Probe sequentially to avoid overloading small ESP web servers.
  const candidates=[];for(const port of [80,5000,8080]){await ensure();const url=`http://${context.gateway}${port===80?'':':'+port}/`,found=await httpProbe(url,{address:context.address,signal});if(found)candidates.push({...found,kind:'web'});}
  await ensure();return {ssid,gateway:context.gateway,internet:context.internet,candidates};
}
module.exports={eligibility,discover,probeWeb};
