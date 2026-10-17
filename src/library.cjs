'use strict';
const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
function normalizeUrl(value){
  if(typeof value!=='string'||!value.trim()||value.length>2048)throw Error('Enter the robot IP address or URL.');
  const raw=value.trim(),u=new URL(raw.includes('://')?raw:`http://${raw}`);
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw Error('Use an HTTP or HTTPS address. Enter passwords in the sign-in prompt.');
  return u.href;
}
function cleanSsid(value){const s=String(value||'').trim();if(Buffer.byteLength(s)>32||/[\r\n\0]/.test(s))throw Error('Wi-Fi names must be at most 32 bytes.');return s;}
class Library {
  constructor(file){
    this.file=file;this.data={version:2,robots:[],lastId:null};
    if(fs.existsSync(file)){
      const old=JSON.parse(fs.readFileSync(file,'utf8'));
      if(old.version===2&&Array.isArray(old.robots)){this.data=old;}
      else if(old.addresses||old.custom){
        const defaults={pushbot:['PushBot','Pushbot'], '3dbu':['3DBU / Big Zippy','3DBU-Robot'],motionmodule:['MotionModule','MotionModule'],'3tsahur':['3TSahur','3TSahur-Swarm'],omnibot:['OmniBot','OmniBot']};
        for(const [id,addresses] of Object.entries(old.addresses||{})){if(defaults[id]&&addresses[0])this.upsert({name:defaults[id][0],ssid:defaults[id][1],url:addresses[0]});}
        for(const p of old.custom||[]){if(p.addresses?.[0])this.upsert({name:p.name,ssid:p.ssid,url:p.addresses[0]});}
        this.save();
      }
    }
  }
  list(ssid=''){return [...this.data.robots].sort((a,b)=>Number(b.ssid===ssid&&!!ssid)-Number(a.ssid===ssid&&!!ssid)||(b.lastOpened||0)-(a.lastOpened||0)||a.name.localeCompare(b.name));}
  get(id){const p=this.data.robots.find(p=>p.id===id);if(!p)throw Error('Saved robot was not found.');return p;}
  upsert(input,{opened=false,title=''}={}){
    const url=normalizeUrl(input.url),ssid=cleanSsid(input.ssid),name=String(input.name||'').trim().slice(0,90);
    const old=input.id?this.get(input.id):this.data.robots.find(p=>p.url===url&&p.ssid===ssid);
    const p={id:old?.id||randomUUID(),name:name||old?.name||title.slice(0,90)||ssid||new URL(url).hostname,url,ssid,autoName:name?false:old?.autoName??true,createdAt:old?.createdAt||Date.now(),lastOpened:opened?Date.now():old?.lastOpened||0};
    this.data.robots=this.data.robots.filter(p2=>p2.id!==p.id);this.data.robots.push(p);if(opened)this.data.lastId=p.id;this.save();return p;
  }
  updateTitle(id,title){const p=this.get(id);if(p.autoName&&title&&title!=='about:blank'){p.name=String(title).slice(0,90);this.save();}return p;}
  remove(id){this.get(id);this.data.robots=this.data.robots.filter(p=>p.id!==id);if(this.data.lastId===id)this.data.lastId=null;this.save();}
  save(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data,null,2),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
}
module.exports={Library,normalizeUrl,cleanSsid};
