'use strict';
const {execFile}=require('node:child_process');const {promisify}=require('node:util');const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const {randomUUID}=require('node:crypto');const {cleanSsid}=require('./library.cjs');
const nativeRun=promisify(execFile);
function splitEscaped(line){const out=[];let value='',escaped=false;for(const c of line){if(escaped){value+=c;escaped=false;}else if(c==='\\')escaped=true;else if(c===':'){out.push(value);value='';}else value+=c;}out.push(value);return out;}
const xml=s=>String(s).replace(/[<>&'\"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
function wifiError(message,code='NETWORK_ERROR'){const e=Error(message);e.code=code;return e;}
class Network {
  constructor({platform=process.platform,runner=nativeRun,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){this.platform=platform;this.runner=runner;this.sleep=sleep;this.busy=false;}
  async run(file,args,timeout=5000){return (await this.runner(file,args,{timeout,maxBuffer:500000,windowsHide:true,env:{...process.env,LC_ALL:'C',LANG:'C'}})).stdout.trim();}
  async status(){
    try{
      if(this.platform==='linux'){
        const rows=(await this.run('nmcli',['-t','--escape','yes','-f','DEVICE,TYPE,STATE,CONNECTION','device','status'])).split('\n').map(splitEscaped);
        const device=rows.find(r=>r[1]==='wifi'&&r[2]==='connected')||rows.find(r=>r[1]==='wifi');
        let ssid='';if(device?.[2]==='connected'){const uuid=await this.run('nmcli',['-g','GENERAL.CON-UUID','device','show',device[0]]);ssid=splitEscaped(await this.run('nmcli',['-g','802-11-wireless.ssid','connection','show','uuid',uuid])).join(':');}
        return {available:!!device,connected:!!ssid,ssid,device:device?.[0]||'',native:true};
      }
      if(this.platform==='win32'){
        const s=await this.run('netsh',['wlan','show','interfaces']);const ssid=s.match(/^\s*SSID\s*:\s*(.+)$/m)?.[1]?.trim()||'';return {available:!s.includes('no wireless interface'),connected:!!ssid,ssid,native:true};
      }
      if(this.platform==='darwin'){
        const ports=await this.run('/usr/sbin/networksetup',['-listallhardwareports']);const device=ports.match(/Hardware Port: (?:Wi-Fi|AirPort)\r?\nDevice: (\S+)/)?.[1]||'en0';
        const raw=await this.run('/usr/sbin/networksetup',['-getairportnetwork',device]);const ssid=raw.match(/Current Wi-Fi Network: (.+)/)?.[1]||'';return {available:true,connected:!!ssid,ssid,device,native:true};
      }
    }catch{}
    return {available:false,connected:false,ssid:'',native:false,message:'Wi-Fi details are unavailable. Open system Wi-Fi settings, or use Ethernet.'};
  }
  async scan(){
    if(this.platform==='linux'){
      const raw=await this.run('nmcli',['-t','--escape','yes','-f','IN-USE,SSID,SIGNAL,SECURITY','device','wifi','list','--rescan','yes'],18000);
      const entries=raw.split('\n').filter(Boolean).map(splitEscaped).filter(r=>r[1]).map(r=>({ssid:r[1],signal:Number(r[2]),security:r[3],active:r[0]==='*'}));
      const unique=new Map();for(const e of entries.sort((a,b)=>b.signal-a.signal))if(!unique.has(e.ssid))unique.set(e.ssid,e);return [...unique.values()];
    }
    if(this.platform==='win32'){
      // netsh only reports Windows' cached scan, which often holds just the connected network; request a fresh scan first.
      const fresh=await this.run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'wifi-scan.ps1')],15000).then(out=>Number(out)>0).catch(()=>false);
      let list=await this.windowsNetworks();
      for(let i=0,stable=0;fresh&&i<6&&stable<2;i++){await this.sleep(800);const next=await this.windowsNetworks();stable=i>=2&&next.length===list.length?stable+1:0;list=next;}
      return list;
    }
    if(this.platform==='darwin'){
      const script=`ObjC.import('CoreWLAN'); const iface=$.CWWiFiClient.sharedWiFiClient.interface; if(!iface)throw Error('No Wi-Fi interface'); const error=Ref(); const result=iface.scanForNetworksWithSSIDError(null,error); if(!result)throw Error('macOS could not scan Wi-Fi. Use system Wi-Fi settings and allow location access if requested.'); const list=result.allObjects.js.map(n=>({ssid:ObjC.unwrap(n.ssid)||'',signal:Number(n.rssiValue),security:n.supportsSecurity(0)?'':'Secured'})).filter(n=>n.ssid); JSON.stringify(list);`;
      const entries=JSON.parse(await this.run('/usr/bin/osascript',['-l','JavaScript','-e',script],25000));const unique=new Map();for(const e of entries.sort((a,b)=>b.signal-a.signal))if(!unique.has(e.ssid))unique.set(e.ssid,e);return [...unique.values()];
    }
    return [];
  }
  async windowsNetworks(){
    const raw=await this.run('netsh',['wlan','show','networks','mode=bssid']);const entries=[];let item;
    for(const line of raw.split('\n')){const m=line.match(/^SSID \d+\s*:\s*(.*)/);if(m){item={ssid:m[1].trim(),signal:0,security:'',active:false};if(item.ssid)entries.push(item);}else if(item){const n=line.match(/Signal\s*:\s*(\d+)/);if(n)item.signal=Number(n[1]);const a=line.match(/Authentication\s*:\s*(.*)/);if(a)item.security=a[1].trim();}}
    if(!entries.length&&/location/i.test(raw))throw wifiError('Windows needs Location access to list Wi-Fi networks. Turn on Settings › Privacy & security › Location and “Let desktop apps access your location”.','SYSTEM_WIFI');
    const unique=new Map();for(const e of entries.sort((a,b)=>b.signal-a.signal))if(!unique.has(e.ssid))unique.set(e.ssid,e);return [...unique.values()];
  }
  async join(ssid,password=''){
    ssid=cleanSsid(ssid);if(!ssid)throw wifiError('Choose a Wi-Fi network.');if(typeof password!=='string'||/[\r\n\0]/.test(password)||password.length>128)throw wifiError('Invalid Wi-Fi password.');
    if(this.busy)throw wifiError('A Wi-Fi connection is already in progress.');this.busy=true;
    try{
      const current=await this.status();if(current.ssid===ssid)return current;
      if(this.platform==='linux')await this.joinLinux(ssid,password,current);
      else if(this.platform==='win32')await this.joinWindows(ssid,password);
      else if(this.platform==='darwin'){
        if(!password)throw wifiError('Enter this network’s password, or connect using system Wi-Fi settings.','NEEDS_PASSWORD');
        await this.run('/usr/sbin/networksetup',['-setairportnetwork',current.device||'en0',ssid,password],35000);
      }else throw wifiError('Use system Wi-Fi settings on this device.','SYSTEM_WIFI');
      const result=await this.status();if(result.ssid!==ssid)throw wifiError('The network switch has not completed. Check system Wi-Fi settings and try again.');return result;
    }catch(e){if(e.code==='NEEDS_PASSWORD'||e.code==='SYSTEM_WIFI')throw e;throw wifiError('Could not join Wi-Fi. Check the password, signal, and system network permissions.','NEEDS_PASSWORD');}finally{this.busy=false;}
  }
  async joinLinux(ssid,password,current){
    if(!current.device)throw wifiError('No Wi-Fi adapter was found.','SYSTEM_WIFI');
    const rows=(await this.run('nmcli',['-t','--escape','yes','-f','UUID,TYPE,NAME','connection','show'])).split('\n').map(splitEscaped).filter(r=>['wifi','802-11-wireless'].includes(r[1]));let uuid='';
    for(const r of rows){if(splitEscaped(await this.run('nmcli',['-g','802-11-wireless.ssid','connection','show','uuid',r[0]])).join(':')===ssid){uuid=r[0];break;}}
    if(!uuid){
      const networks=await this.scan(),ap=networks.find(n=>n.ssid===ssid);const secured=ap?!!ap.security&&ap.security!=='--':true;
      if(secured&&!password)throw wifiError('Enter the Wi-Fi password for this robot network.','NEEDS_PASSWORD');
      if(ap?.security?.includes('802.1X'))throw wifiError('Set up this enterprise network in system Wi-Fi settings.','SYSTEM_WIFI');
      uuid=randomUUID();await this.run('nmcli',['connection','add','type','wifi','ifname',current.device,'con-name',`Deck Robot ${ssid}`,'ssid',ssid,'connection.uuid',uuid,'connection.autoconnect','no','connection.permissions',`user:${os.userInfo().username}`]);
      if(secured)await this.run('nmcli',['connection','modify','uuid',uuid,'wifi-sec.key-mgmt',ap?.security==='WPA3'?'sae':'wpa-psk','wifi-sec.psk-flags','0']);
    }
    if(password){
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deck-wifi-'));const secret=path.join(dir,'secret');
      try{await fs.chmod(dir,0o700);await fs.writeFile(secret,`802-11-wireless-security.psk:${password}\n`,{mode:0o600});await this.run('nmcli',['--wait','30','connection','up','uuid',uuid,'ifname',current.device,'passwd-file',secret],35000);}finally{await fs.unlink(secret).catch(()=>{});await fs.rmdir(dir).catch(()=>{});}
    }else{try{await this.run('nmcli',['--wait','30','connection','up','uuid',uuid,'ifname',current.device],35000);}catch{throw wifiError('This saved network needs its Wi-Fi password.','NEEDS_PASSWORD');}}
  }
  async joinWindows(ssid,password){
    const ap=(await this.windowsNetworks().catch(()=>[])).find(n=>n.ssid===ssid),open=ap?.security==='Open';
    if(password||open){
      if(password&&/enterprise|802\.1x/i.test(ap?.security||''))throw wifiError('Set up this enterprise network in system Wi-Fi settings.','SYSTEM_WIFI');
      const dir=await fs.mkdtemp(path.join(os.tmpdir(),'deck-wifi-')),file=path.join(dir,'network.xml');
      const authentication=open?'open':/WPA3/i.test(ap?.security||'')?'WPA3SAE':'WPA2PSK';
      const key=open?'':`<sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>${xml(password)}</keyMaterial></sharedKey>`;
      const body=`<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>${xml(ssid)}</name><SSIDConfig><SSID><name>${xml(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>${authentication}</authentication><encryption>${open?'none':'AES'}</encryption><useOneX>false</useOneX></authEncryption>${key}</security></MSM></WLANProfile>`;
      try{await fs.writeFile(file,body,{mode:0o600});await this.run('netsh',['wlan','add','profile',`filename=${file}`,'user=current']);}finally{await fs.unlink(file).catch(()=>{});await fs.rmdir(dir).catch(()=>{});}
    }
    const out=await this.run('netsh',['wlan','connect',`name=${ssid}`,`ssid=${ssid}`],10000);if(/not found|failed|error|not available/i.test(out))throw wifiError('Join this network in system Wi-Fi settings or enter its password.','NEEDS_PASSWORD');
    for(let i=0;i<12;i++){if((await this.status()).ssid===ssid)return;await new Promise(r=>setTimeout(r,500));}
  }
}
module.exports={Network,splitEscaped,xml};
