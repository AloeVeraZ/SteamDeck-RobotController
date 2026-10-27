'use strict';
// Product photos for Configure Robot and the pinout: each device's photo is the main product image of its listing on
// the maker's store (DeckDeviceArt.PHOTOS), read once while this computer is online and kept in a folder so it is there
// on the robot's Wi-Fi, which has no internet. The renderer names a device type, never a URL; only listed pages are
// read, and only an image of a sensible size is kept.
const fs=require('node:fs'),path=require('node:path');
const Art=require('../ui/ftc/device-art.js');
const TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'},MAX=4*1024*1024,UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 DeckDriverStation';
// A listing's main product image: its og:image (attributes in either order), else its twitter:image.
function productImage(html,page){
  for(const m of String(html).matchAll(/<meta\b[^>]*>/gi)){const tag=m[0],key=/(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase(),value=/content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if(value&&(key==='og:image'||key==='og:image:secure_url'||key==='twitter:image')){try{const u=new URL(value.replace(/&amp;/g,'&'),page);if(u.protocol==='http:')u.protocol='https:';if(u.protocol==='https:')return u.href;}catch{}}}
  return null;
}
class DevicePhotos {
  constructor(dir,{fetch:get=globalThis.fetch,timeout=12000}={}){this.dir=dir;this.get=get;this.timeout=timeout;this.pending=new Map();this.failed=new Map();}
  file(tag){const base=String(tag).replace(/[^\w.-]+/g,'_');for(const ext of Object.values(TYPES)){const f=path.join(this.dir,`${base}.${ext}`);if(fs.existsSync(f))return f;}return null;}
  // The photo as a data: URL, read from the folder or fetched; null when there is none and it cannot be fetched now.
  async photo(tag){
    if(typeof tag!=='string'||!Art.PHOTOS[tag])return null;
    const have=this.file(tag);if(have)return dataUrl(have);
    // After a failure (no internet), wait a minute before trying that photo again.
    if(Date.now()-(this.failed.get(tag)||0)<60000)return null;
    if(!this.pending.has(tag))this.pending.set(tag,this.download(tag).catch(()=>{this.failed.set(tag,Date.now());return null;}).finally(()=>this.pending.delete(tag)));
    const f=await this.pending.get(tag);return f?dataUrl(f):null;
  }
  async fetchWithin(url,accept){const c=new AbortController(),t=setTimeout(()=>c.abort(),this.timeout);try{const r=await this.get(url,{signal:c.signal,redirect:'follow',headers:{'User-Agent':UA,Accept:accept}});if(!r.ok)throw Error(`${url}: HTTP ${r.status}`);return r;}finally{clearTimeout(t);}}
  async download(tag){
    const [page]=Art.PHOTOS[tag];let image=null;
    // Several devices share a listing: reuse its image.
    for(const [other,[p]] of Object.entries(Art.PHOTOS))if(p===page&&other!==tag&&this.file(other)){const f=this.file(other),to=path.join(this.dir,`${String(tag).replace(/[^\w.-]+/g,'_')}${path.extname(f)}`);fs.mkdirSync(this.dir,{recursive:true});fs.copyFileSync(f,to);return to;}
    const html=await (await this.fetchWithin(page,'text/html')).text();image=productImage(html,page);if(!image)throw Error(`${page} has no product image.`);
    const r=await this.fetchWithin(image,'image/avif,image/webp,image/png,image/jpeg,*/*'),type=String(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase(),ext=TYPES[type];
    if(!ext)throw Error(`${image} is not a photo (${type}).`);const bytes=Buffer.from(await r.arrayBuffer());if(!bytes.length||bytes.length>MAX)throw Error(`${image} is ${bytes.length} bytes.`);
    fs.mkdirSync(this.dir,{recursive:true});const to=path.join(this.dir,`${String(tag).replace(/[^\w.-]+/g,'_')}.${ext}`);fs.writeFileSync(to+'.tmp',bytes);fs.renameSync(to+'.tmp',to);
    fs.writeFileSync(path.join(this.dir,'sources.json'),JSON.stringify({...readJson(path.join(this.dir,'sources.json')),[tag]:{page,image,saved:new Date().toISOString()}},null,1));
    return to;
  }
  // Fetches every photo not in the folder yet, a few at a time. Resolves with how many the folder has.
  async prefetch(){const tags=Object.keys(Art.PHOTOS).filter(t=>!this.file(t)),queue=[...tags];
    await Promise.all(Array.from({length:4},async()=>{while(queue.length)await this.photo(queue.shift());}));return Object.keys(Art.PHOTOS).filter(t=>this.file(t)).length;}
}
const readJson=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return {};}};
const MIME={'.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.gif':'image/gif'};
const dataUrl=f=>`data:${MIME[path.extname(f)]||'application/octet-stream'};base64,${fs.readFileSync(f).toString('base64')}`;
module.exports={DevicePhotos,productImage};
