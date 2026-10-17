'use strict';
// A streaming, single-target loopback bridge. The robot serves every byte of UI.
// Loopback is a secure context for Chromium's Gamepad API even for HTTP robots.
const http=require('node:http'),https=require('node:https'),net=require('node:net'),tls=require('node:tls');
const {normalizeUrl}=require('./library.cjs');
const HOP=new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
class RobotProxy {
  constructor(url){this.target=new URL(normalizeUrl(url));this.sockets=new Set();this.upstreams=new Set();this.server=http.createServer((req,res)=>this.forward(req,res));
    this.server.on('connection',s=>{this.sockets.add(s);s.on('close',()=>this.sockets.delete(s));});this.server.on('upgrade',(req,s,head)=>this.upgrade(req,s,head));
  }
  async start(){await new Promise((ok,fail)=>{this.server.once('error',fail);this.server.listen(0,'127.0.0.1',ok);});this.origin=`http://127.0.0.1:${this.server.address().port}`;return this.origin+this.target.pathname+this.target.search+this.target.hash;}
  headers(input){const headers={};for(const [k,v]of Object.entries(input)){if(!HOP.has(k.toLowerCase()))headers[k]=v;}headers.host=this.target.host;
    if(headers.origin===this.origin)headers.origin=this.target.origin;
    if(headers.referer?.startsWith(this.origin+'/'))headers.referer=this.target.origin+headers.referer.slice(this.origin.length);
    return headers;
  }
  allowed(req){return req.headers.host===this.origin.slice(7)&&(!req.headers.origin||req.headers.origin===this.origin)&&req.url.startsWith('/')&&!req.url.startsWith('//');}
  forward(req,res){
    if(!this.allowed(req)){res.writeHead(403);res.end('Robot bridge rejected this request.');return;}
    const client=this.target.protocol==='https:'?https:http;
    const upstream=client.request({protocol:this.target.protocol,hostname:this.target.hostname,port:this.target.port||undefined,path:req.url,method:req.method,headers:this.headers(req.headers)},reply=>{
      const headers={};for(const [k,v]of Object.entries(reply.headers))if(!HOP.has(k.toLowerCase()))headers[k]=v;
      if(headers.location){try{const u=new URL(headers.location,this.target);if(u.origin===this.target.origin)headers.location=this.origin+u.pathname+u.search+u.hash;}catch{}}
      if(headers['set-cookie'])headers['set-cookie']=headers['set-cookie'].map(c=>c.replace(/;\s*Domain=[^;]+/ig,''));
      res.writeHead(reply.statusCode,headers);reply.pipe(res);
    });
    this.upstreams.add(upstream);upstream.on('close',()=>this.upstreams.delete(upstream));
    upstream.setTimeout(15000,()=>upstream.destroy(Error('Robot did not respond.')));
    upstream.on('error',e=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain'});res.end(`Robot connection failed: ${e.message}`);});
    res.on('close',()=>upstream.destroy());req.pipe(upstream);
  }
  upgrade(req,socket,head){
    if(!this.allowed(req)){socket.destroy();return;}
    const secure=this.target.protocol==='https:',port=Number(this.target.port||(secure?443:80));
    const upstream=secure?tls.connect({host:this.target.hostname,port,servername:this.target.hostname}):net.connect({host:this.target.hostname,port});
    this.sockets.add(upstream);upstream.on('close',()=>this.sockets.delete(upstream));
    upstream.once(secure?'secureConnect':'connect',()=>{
      const headers={...this.headers(req.headers),connection:'Upgrade',upgrade:req.headers.upgrade||'websocket'};
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${Object.entries(headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);if(head.length)upstream.write(head);socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());socket.on('close',()=>upstream.destroy());
  }
  async close(){for(const u of this.upstreams)u.destroy();for(const s of this.sockets)s.destroy();if(this.server.listening)await new Promise(r=>this.server.close(r));}
}
module.exports={RobotProxy};
