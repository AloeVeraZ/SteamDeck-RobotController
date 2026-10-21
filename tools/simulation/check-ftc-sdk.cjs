'use strict';
// Developer check: the virtual Control Hub's FTC SDK stand-ins and the Control Hub exports against the
// REAL FTC SDK. Downloads RobotCore and Hardware 12.0.0 from Maven Central into a temporary folder,
// verifies their published SHA-1, then:
//   1. compiles Pedro's revhub sources against them;
//   2. compiles a Control Hub export for every supported localizer, and a turning route;
//   3. checks every public member a stand-in declares exists in the real SDK (fields and methods the
//      real SDK inherits from OpModeInternal are listed separately).
// The SDK is only a reference: the temporary folder is deleted afterwards, and nothing is bundled.
// Needs a built simulator (node tools/simulation/build.cjs) and network access.
// Usage: node tools/simulation/check-ftc-sdk.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'../..'),VERSION='12.0.0',ARTIFACTS=['RobotCore','Hardware'];
const jdk=fs.readdirSync(path.join(root,'.cache/simulation-runtime/jdk')).map(d=>path.join(root,'.cache/simulation-runtime/jdk',d))[0];
const tool=name=>path.join(jdk,'bin',process.platform==='win32'?name+'.exe':name);
const get=url=>new Promise((resolve,reject)=>https.get(url,res=>{if(res.statusCode!==200){res.resume();return reject(Error(`${url}: HTTP ${res.statusCode}`));}const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve(Buffer.concat(chunks)));}).on('error',reject));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
// Inherited from OpModeInternal in the real SDK; declared on OpMode by the stand-in. Same for team code.
const INHERITED=new Set(['gamepad1','gamepad2','hardwareMap','telemetry','requestOpModeStop()']);

async function main(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'deck-ftc-sdk-'));
  try{
    const jars=[];
    for(const name of ARTIFACTS){
      const base=`https://repo1.maven.org/maven2/org/firstinspires/ftc/${name}/${VERSION}/${name}-${VERSION}.aar`,aar=await get(base),expected=(await get(base+'.sha1')).toString().trim().slice(0,40);
      const actual=crypto.createHash('sha1').update(aar).digest('hex');if(actual!==expected)throw Error(`${name} SHA-1 ${actual} does not match Maven Central's ${expected}.`);
      const dir=path.join(temp,name);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'lib.aar'),aar);execFileSync(tool('jar'),['xf','lib.aar','classes.jar'],{cwd:dir});jars.push(path.join(dir,'classes.jar'));
      console.log(`Downloaded ${name} ${VERSION} (${(aar.length/1048576).toFixed(1)} MB), SHA-1 verified.`);
    }
    // Pedro core from the built simulator, without the stand-ins or revhub.
    const classes=path.join(root,'sim-runtime/pedro/classes'),core=path.join(temp,'core');
    fs.cpSync(path.join(classes,'com/pedropathing'),path.join(core,'com/pedropathing'),{recursive:true});fs.rmSync(path.join(core,'com/pedropathing/revhub'),{recursive:true,force:true});
    fs.mkdirSync(path.join(core,'deck/sim'),{recursive:true});fs.copyFileSync(path.join(classes,'deck/sim/SimClock.class'),path.join(core,'deck/sim/SimClock.class'));
    const javac=(sources,out,cp)=>{fs.mkdirSync(out,{recursive:true});return execFileSync(tool('javac'),['--release','17','-encoding','UTF-8','-proc:none','-Xlint:all,-classfile','-cp',cp.join(path.delimiter),'-d',out,...sources],{encoding:'utf8',stdio:['ignore','pipe','pipe']});};
    const revhubSources=walk(path.join(root,'.cache/simulation-build/src/com/pedropathing/revhub')).filter(f=>f.endsWith('.java')),revhub=path.join(temp,'revhub');
    javac([...revhubSources,path.join(root,'tools/simulation/java/android/annotation/SuppressLint.java')],revhub,[...jars,core]);
    console.log(`Pedro revhub: ${revhubSources.length} files compile against the real SDK.`);
    // Every Control Hub export, generated exactly as the app does.
    const P=require('../../ui/sim-planner.js'),X=require('../../ui/sim-export.js'),F=require('../../ui/sim-ftc.js'),{SimEngine}=require('../../src/sim-engine.cjs');
    const e=new SimEngine({workDir:fs.mkdtempSync(path.join(temp,'engine-')),now:()=>0});
    const cases=[...Object.keys(F.SUPPORTED).map(localization=>({name:localization,localization,robot:{drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},start:{x:20,y:30,heading:0},zones:[{id:'a',type:'rect',x:70,y:60,width:16,height:40}],pins:[{x:110,y:40,wait:.5,action:'Score'},{x:120,y:120}],clearance:2})),
      {name:'turning route',localization:'odometry',robot:{drivetrain:'mecanum',length:24,width:12,heightIn:5,driveRpm:500,intakeIn:0},start:{x:72,y:30,heading:0},zones:[{id:'l',type:'rect',x:31.5,y:72,width:63,height:4},{id:'r',type:'rect',x:112.5,y:72,width:63,height:4}],pins:[{x:72,y:110},{x:30,y:120}],clearance:1}];
    try{
      for(const c of cases){
        const info=await e.load({field:'empty',start:c.start,robot:c.robot,zones:c.zones,sensors:{localization:c.localization}}),route=P.plan({start:c.start,zones:c.zones,pins:c.pins,clearance:c.clearance,style:'spline'},info.footprint,[],info.bounds);
        const layout={name:'SDK check',field:'empty',width:144,height:144,start:c.start,zones:c.zones},out=F.files({route,layout,tuning:info.tuning,robot:info.robot,localization:c.localization,setupName:'SDK check',routeJava:X.java(route,layout,{polygon:P.polygon,className:'PlannedRoute',packageName:'org.firstinspires.ftc.teamcode'})});
        const dir=path.join(temp,'teamcode',c.name.replace(/\W/g,'-')),files=Object.entries(out.files).map(([rel,text])=>{const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);return f;});
        const warnings=javac(files,dir+'-classes',[...jars,core,revhub]).split('\n').filter(l=>/warning:/.test(l));
        if(warnings.length)throw Error(`${c.name} export compiles with warnings:\n${warnings.join('\n')}`);
        console.log(`Control Hub export (${c.name}${route.turns?', turning':''}): ${files.length} files compile against the real SDK, no warnings.`);
      }
    }finally{e.dispose();}
    // Signatures: nothing a stand-in declares may be missing from the real SDK.
    const members=(cp,type)=>new Set(execFileSync(tool('javap'),['-public','-cp',cp,type],{encoding:'utf8'}).split('\n').filter(l=>/^\s+public/.test(l))
      .map(l=>l.trim().replace(/throws [^;]*;/,';').replace(/ ;$/,';').replace(/ (abstract|default|final|static|synchronized|native|volatile) /g,' ').replace(/\s+/g,' ').trim()));
    const name=l=>(l.match(/ ([\w$]+)(\(|;)/)||[])[1]+(l.includes('(')?'()':'');
    let checked=0,inherited=0;const missing=[];
    for(const file of walk(path.join(root,'tools/simulation/java')).filter(f=>/[\\/](com|org)[\\/].*\.java$/.test(f))){
      const type=path.relative(path.join(root,'tools/simulation/java'),file).replace(/\.java$/,'').split(path.sep).join('.');
      const real=members(jars.join(path.delimiter),type);
      for(const m of members(classes,type)){checked++;if(real.has(m))continue;if(type.endsWith('.OpMode')&&INHERITED.has(name(m))){inherited++;continue;}missing.push(`${type}: ${m}`);}
    }
    if(missing.length)throw Error(`Stand-in members missing from the real SDK:\n${missing.join('\n')}`);
    console.log(`Stand-ins: ${checked} public members match the real SDK (${inherited} inherited from OpModeInternal there).`);
  }finally{fs.rmSync(temp,{recursive:true,force:true});console.log('Deleted the downloaded SDK.');}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
