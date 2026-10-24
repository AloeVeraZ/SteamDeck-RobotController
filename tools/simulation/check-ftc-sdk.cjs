'use strict';
// Developer check: the virtual Control Hub's FTC SDK stand-ins and the Control Hub exports against the
// REAL FTC SDK and Pedro Pathing. Downloads RobotCore and Hardware 12.0.0 and Pedro Pathing core and revhub
// 3.0.2 (what the Pedro Quickstart pins) from Maven Central into a temporary folder, verifies their
// published SHA-1, then:
//   1. compiles single-file OnBot Java and multi-file Control Hub exports for every supported localizer, a turning route, a route with
//      action paths, spins and pin turns, and tank-style robots;
//   2. compiles the Pedro Pathing 3 export for every holonomic case, with the Quickstart's own
//      pedro/Constants.java beside it;
//   3. compiles every export of the example setups in examples/ (BIOBUZZ routes with intakes, shooters,
//      turrets and servos), so the generated mechanism code is checked too;
//   4. checks every public member a stand-in declares exists in the real SDK (fields and methods the
//      real SDK inherits from OpModeInternal are listed separately).
// The libraries are only a reference: the temporary folder is deleted afterwards, and nothing is bundled.
// Needs a built simulator (node tools/simulation/build.cjs) and network access.
// Usage: node tools/simulation/check-ftc-sdk.cjs
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),https=require('node:https'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'../..'),VERSION='12.0.0',ARTIFACTS=['RobotCore','Hardware'],PEDRO='3.0.2';
// The Pedro Quickstart's TeamCode/src/main/java/org/firstinspires/ftc/teamcode/pedro/Constants.java as it ships.
const QUICKSTART_CONSTANTS=`package org.firstinspires.ftc.teamcode.pedro;

import com.pedropathing.follower.Follower;
import com.qualcomm.robotcore.hardware.HardwareMap;

public class Constants {
    public static Follower create(HardwareMap h) {
        // return new Follower(Drivetrain, Localizer, Foresight);
        return null;
    }
}
`;
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
    const pedroJars=[];
    for(const [name,ext] of [['core','jar'],['revhub','aar']]){
      const base=`https://repo1.maven.org/maven2/com/pedropathing/${name}/${PEDRO}/${name}-${PEDRO}.${ext}`,bytes=await get(base),expected=(await get(base+'.sha1')).toString().trim().slice(0,40);
      const actual=crypto.createHash('sha1').update(bytes).digest('hex');if(actual!==expected)throw Error(`Pedro ${name} SHA-1 ${actual} does not match Maven Central's ${expected}.`);
      const dir=path.join(temp,'pedro-'+name);fs.mkdirSync(dir);
      if(ext==='jar'){const jar=path.join(dir,name+'.jar');fs.writeFileSync(jar,bytes);pedroJars.push(jar);}
      else{fs.writeFileSync(path.join(dir,'lib.aar'),bytes);execFileSync(tool('jar'),['xf','lib.aar','classes.jar'],{cwd:dir});pedroJars.push(path.join(dir,'classes.jar'));}
      console.log(`Downloaded Pedro Pathing ${name} ${PEDRO} (${(bytes.length/1048576).toFixed(2)} MB), SHA-1 verified.`);
    }
    const classes=path.join(root,'sim-runtime/driver/classes');
    const javac=(sources,out,cp)=>{fs.mkdirSync(out,{recursive:true});return execFileSync(tool('javac'),['--release','8','-encoding','UTF-8','-proc:none','-Xlint:all,-classfile','-cp',cp.join(path.delimiter),'-d',out,...sources],{encoding:'utf8',stdio:['ignore','pipe','pipe']});};
    // Every Control Hub export, generated exactly as the app does.
    const P=require('../../ui/sim-planner.js'),X=require('../../ui/sim-export.js'),F=require('../../ui/sim-ftc.js'),Pedro=require('../../ui/sim-pedro.js'),Cli=require('../deck-sim.cjs'),{SimEngine}=require('../../src/sim-engine.cjs');
    const write=(dir,files)=>Object.entries(files).map(([rel,text])=>{const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);return f;});
    const noWarnings=(name,output)=>{const warnings=output.split('\n').filter(l=>/warning:/.test(l));if(warnings.length)throw Error(`${name} compiles with warnings:\n${warnings.join('\n')}`);};
    // The Pedro export beside the Quickstart's Constants.java, against the SDK and Pedro 3.
    const pedro=(name,out)=>{const dir=path.join(temp,'pedro',name.replace(/\W/g,'-')),files=write(dir,{...out.files,'org/firstinspires/ftc/teamcode/pedro/Constants.java':QUICKSTART_CONSTANTS});
      noWarnings(`Pedro export (${name})`,javac(files,dir+'-classes',[...jars,...pedroJars]));console.log(`Pedro Pathing ${PEDRO} export (${name}): ${files.length-1} files compile against the real SDK and Pedro, no warnings.`);};
    const e=new SimEngine({workDir:fs.mkdtempSync(path.join(temp,'engine-')),now:()=>0});
    const cases=[...Object.keys(F.SUPPORTED).map(localization=>({name:localization,localization,robot:{drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},start:{x:20,y:30,heading:0},zones:[{id:'a',type:'rect',x:70,y:60,width:16,height:40}],pins:[{x:110,y:40,wait:.5,action:'Score'},{x:120,y:120}],clearance:2})),
      {name:'turning route',localization:'odometry',robot:{drivetrain:'mecanum',length:24,width:12,heightIn:5,driveRpm:500,intakeIn:0},start:{x:72,y:30,heading:0},zones:[{id:'l',type:'rect',x:31.5,y:72,width:63,height:4},{id:'r',type:'rect',x:112.5,y:72,width:63,height:4}],pins:[{x:72,y:110},{x:30,y:120}],clearance:1},
      // Action paths, spins and turns while driving, pin turns and the RouteActions/RobotActions slots.
      {name:'actions',localization:'odometry',robot:{drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},start:{x:24,y:24,heading:0},zones:[],pins:[{x:110,y:30,path:{kind:'action',action:'Intake',rotate:'spin',spins:1}},{x:110,y:72,turn:90,wait:1.5,action:'Shoot'},{x:40,y:72,path:{kind:'action',action:'Shoot',rotate:'turn',heading:180}}],clearance:2},
      // A custom curve driven facing along the path, then a straight path driven backwards (tangent headings).
      {name:'tangent and custom curve',localization:'fused',robot:{drivetrain:'mecanum',length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},start:{x:24,y:24,heading:60},zones:[],pins:[{x:110,y:24,path:{rotate:'tangent',controls:[{x:50,y:80},{x:90,y:80}]}},{x:110,y:100,path:{rotate:'reverse'}}],clearance:2},
      // Tank-style robots: TankDrive and the tank drive-encoder localizer.
      ...[['tank','encoders'],['tank2','encoders'],['tracks','fused']].map(([drivetrain,localization])=>({name:drivetrain+' '+localization,localization,nonholonomic:true,robot:{drivetrain,length:17,width:17,heightIn:5,driveRpm:500,intakeIn:0},start:{x:24,y:24,heading:0},zones:[],pins:[{x:100,y:24},{x:100,y:100,wait:.5,action:'Score'}],clearance:2}))];
    try{
      for(const c of cases){
        const info=await e.load({field:'empty',start:c.start,robot:c.robot,zones:c.zones,sensors:{localization:c.localization}}),route=P.plan({start:c.start,zones:c.zones,pins:c.pins,clearance:c.clearance,style:c.nonholonomic?'sharp':'spline',nonholonomic:!!c.nonholonomic},info.footprint,[],info.bounds);
        const layout={name:'SDK check',field:'empty',width:144,height:144,start:c.start,zones:c.zones},out=F.files({route,layout,tuning:info.tuning,robot:info.robot,localization:c.localization,setupName:'SDK check',routeJava:X.java(route,layout,{polygon:P.polygon,className:'PlannedRoute',packageName:'org.firstinspires.ftc.teamcode'})});
        const dir=path.join(temp,'teamcode',c.name.replace(/\W/g,'-')),files=Object.entries(out.files).map(([rel,text])=>{const f=path.join(dir,rel);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,text);return f;});
        const warnings=javac(files,dir+'-classes',jars).split('\n').filter(l=>/warning:/.test(l));
        if(warnings.length)throw Error(`${c.name} export compiles with warnings:\n${warnings.join('\n')}`);
        console.log(`Control Hub export (${c.name}${route.turns?', turning':''}): ${files.length} files compile against the real SDK, no warnings.`);
        const single=F.onBotJava({route,layout,tuning:info.tuning,robot:info.robot,localization:c.localization,setupName:'SDK check',routeJava:X.java(route,layout,{polygon:P.polygon,className:'PlannedRoute',packageName:'org.firstinspires.ftc.teamcode'})});
        const singleDir=path.join(temp,'onbot',c.name.replace(/\W/g,'-'));fs.mkdirSync(singleDir,{recursive:true});const singlePath=path.join(singleDir,single.name);fs.writeFileSync(singlePath,single.source);
        javac([singlePath],singleDir+'-classes',jars);console.log(`OnBot Java (${c.name}): one Java 8 file compiles against the real SDK.`);
        if(!c.nonholonomic)pedro(c.name,Pedro.files({route,layout,setupName:'SDK check',robot:info.robot,defaultPower:.8,hardware:F.hardware(info.robot,c.localization),tuning:info.tuning}));
      }
      // The example setups, exported exactly as `deck-sim export` does (mechanisms included).
      for(const file of fs.readdirSync(path.join(root,'examples')).filter(f=>f.endsWith('.json')&&!f.endsWith('.pins.json'))){
        const setup=Cli.readSetup(path.join(root,'examples',file)),{e:ex,info,l}=await Cli.load(setup);
        try{const route=Cli.planRoute(setup,l,info);
          for(const format of ['teamcode','onbot',...(route.nonholonomic?[]:['pedro'])]){const {files}=Cli.exported(setup,l,route,info,format),name=`${file} ${format}`;
            if(format==='pedro'){pedro(file,{files});continue;}
            const dir=path.join(temp,'examples',name.replace(/\W/g,'-')),sources=write(dir,files);
            noWarnings(name,javac(sources,dir+'-classes',jars));console.log(`Example ${file} (${format}${info.mechanisms?.enabled?', mechanisms':''}): ${sources.length} file${sources.length>1?'s compile':' compiles'} against the real SDK.`);}
        }finally{ex.dispose();}
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
