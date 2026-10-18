'use strict';
const fs=require('node:fs'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile);
// Product identifiers are based on the devices' DMI data, as used by HHD:
// https://github.com/hhd-dev/hhd/tree/master/src/hhd/device
function identifyHardware({platform=process.platform,product='',vendor='',override=''}={}){
  const name=(override||product).trim(),manufacturer=vendor.trim();
  let model=platform==='win32'?'Windows desktop':platform==='darwin'?'Mac':'Linux desktop',controllerFamily=null;
  if(/^(jupiter|steam deck(?: lcd)?)$/i.test(name)){model='Steam Deck LCD';controllerFamily='steamdeck';}
  else if(/^(galileo|steam deck oled)$/i.test(name)){model='Steam Deck OLED';controllerFamily='steamdeck';}
  else if(/^rog (?:xbox )?ally(?:\s|$)/i.test(name)){model=/ally x(?:\s|$)/i.test(name)?'ROG Ally X':'ROG Ally';controllerFamily='ally';}
  else if(/^lenovo legion go(?:\s|$)/i.test(name)||/^legion go(?:\s|$)/i.test(name)||(/lenovo/i.test(manufacturer)&&/^(83E1|83N0|83N1|83L3|83N6|83Q2|83Q3)/i.test(name))){model=/legion go s|^83(L3|N6|Q2|Q3)/i.test(name)?'Lenovo Legion Go S':/legion go 2|^83N[01]/i.test(name)?'Lenovo Legion Go 2':'Lenovo Legion Go';controllerFamily='legion';}
  return {model:override||model,builtInController:controllerFamily!==null,controllerFamily};
}
async function detectHardware({platform=process.platform,env=process.env,readFile=file=>fs.readFileSync(file,'utf8'),runner=run}={}){
  if(env.DECK_DEVICE_MODEL)return identifyHardware({platform,override:env.DECK_DEVICE_MODEL});
  let product='',vendor='';
  try{
    if(platform==='linux'){
      product=readFile('/sys/class/dmi/id/product_name');
      try{vendor=readFile('/sys/class/dmi/id/sys_vendor');}catch{}
    }else if(platform==='win32'){
      const result=await runner('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model | ConvertTo-Json -Compress'],{windowsHide:true,timeout:5000,maxBuffer:65536});
      const data=JSON.parse(result.stdout.replace(/^\uFEFF/,''));product=data.Model||'';vendor=data.Manufacturer||'';
    }
  }catch{}
  return identifyHardware({platform,product,vendor});
}
module.exports={identifyHardware,detectHardware};
