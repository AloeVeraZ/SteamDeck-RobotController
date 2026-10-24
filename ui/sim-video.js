(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckSimVideo=value;})(typeof globalThis==='object'?globalThis:this,()=>{
  'use strict';
  // Run videos: the field as it is drawn (2D or 3D), filmed from the app's own window and cropped to the
  // field, with a bar above it for the period, the clock and the points. Filmed live while a run plays,
  // or afterwards by replaying the recorded run on the field.
  const SECTIONS={all:'Whole run',auto:'Autonomous',teleop:'Teleop'};
  const PHASES={auto:['Autonomous','#2f8f5b'],transition:['Transition','#7a7f87'],teleop:['Teleop','#2f6fb5'],finished:['Finished','#7a7f87']};
  // MP4 (H.264) plays everywhere a team shares videos; WebM is the fallback where the recorder lacks it.
  const TYPES=['video/mp4;codecs=avc1.640028','video/mp4;codecs=avc1','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  function pickType(supported=t=>globalThis.MediaRecorder?.isTypeSupported?.(t)){const type=TYPES.find(t=>{try{return supported(t);}catch{return false;}});return type?{type,ext:type.startsWith('video/mp4')?'mp4':'webm'}:null;}
  // Where each section starts and ends in a recorded run: [first frame, last frame] indices, or null.
  function sections(frames){
    const out={all:frames.length?[0,frames.length-1]:null,auto:null,teleop:null};
    frames.forEach((f,i)=>{const p=f.practice?.phase;if(p==='auto'||p==='teleop'){if(!out[p])out[p]=[i,i];else out[p][1]=i;}});
    // A run with no practice timer (or only one period) is all one section.
    if(!out.auto&&!out.teleop&&out.all&&!frames.some(f=>f.practice))out.auto=out.all.slice();
    return out;
  }
  const clock=s=>{const t=Math.max(0,Math.ceil(s-1e-6));return `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;};
  // The bar above the field: the period and its clock, the run's name, and the points when it scores.
  function caption(f,{name='',start=0}={}){
    const p=f?.practice,[phase,color]=PHASES[p?.phase]||['Run','#3a4049'];
    const time=p&&Number.isFinite(p.remaining)&&p.phase!=='finished'?clock(p.remaining):`${Math.max(0,(f?.time??start)-start).toFixed(1)} s`;
    const score=Number.isFinite(f?.mechanisms?.score)?`${f.mechanisms.score} pts`:'';
    return {phase,color,time,name:String(name).slice(0,60),score};
  }
  const safeName=s=>String(s||'').replace(/[^\w -]+/g,'').replace(/\s+/g,' ').trim().slice(0,60);
  // The suggested file name, without its extension: "Red auto - Autonomous".
  const title=(name,section)=>`${safeName(name)||'Deck run'} - ${SECTIONS[section]||'Run'}`;
  // Where an element sits in the captured window picture, in its pixels (the picture can be scaled).
  function crop(rect,view,video){
    const sx=video.width/view.width,sy=video.height/view.height;
    const x=Math.max(0,rect.left*sx),y=Math.max(0,rect.top*sy);
    return {x,y,width:Math.max(1,Math.min(video.width-x,rect.width*sx)),height:Math.max(1,Math.min(video.height-y,rect.height*sy))};
  }
  // Even sizes (H.264 needs them) no wider than `max`.
  function outputSize(width,height,max=1280){const k=Math.min(1,max/Math.max(width,1)),even=v=>Math.max(2,2*Math.round(v*k/2));return {width:even(width),height:even(height)};}

  // A recorder for one element of this page. open() asks Electron for the window picture (it must follow a
  // click); start() films; stop() resolves with the video. `frame()` gives the run frame shown now, for the bar.
  function create({element,frame,name=()=>'',start=()=>0}){
    let stream=null,video=null,canvas=null,ctx=null,track=null,recorder=null,chunks=[],raf=0,drawn=0,kind=null,size=null,done=null;
    const opened=()=>!!stream&&stream.getVideoTracks().some(t=>t.readyState==='live');
    async function open(){
      if(opened())return;
      if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Video recording is not available here.');
      kind=pickType();if(!kind)throw Error('This app cannot record video on this system.');
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:30},width:{max:2560},height:{max:2560}},audio:false,preferCurrentTab:true,selfBrowserSurface:'include'});
      video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play();
      // The first picture can take a moment to arrive.
      for(let i=0;i<50&&!video.videoWidth;i++)await new Promise(r=>setTimeout(r,20));
      for(const t of stream.getVideoTracks())t.onended=()=>{if(recorder?.state==='recording')recorder.stop();};
    }
    function draw(){
      // A steady 30 pictures a second, whatever the screen's refresh rate.
      raf=requestAnimationFrame(draw);const now=performance.now();if(!video?.videoWidth||now-drawn<1000/31)return;drawn=now;
      // While the field is out of view (another tab is open) the video holds its last picture.
      const r=element.getBoundingClientRect();if(r.width<2||r.height<2)return;const c=crop(r,{width:innerWidth,height:innerHeight},{width:video.videoWidth,height:video.videoHeight});
      const bar=canvas.height-size.field;ctx.fillStyle='#0d0f12';ctx.fillRect(0,0,canvas.width,canvas.height);
      // The field keeps its shape inside the frame if the window was resized while filming.
      const k=Math.min(canvas.width/c.width,size.field/c.height),w=c.width*k,h=c.height*k;
      ctx.drawImage(video,c.x,c.y,c.width,c.height,(canvas.width-w)/2,bar+(size.field-h)/2,w,h);
      const t=caption(frame(),{name:name(),start:start()}),pad=bar*.3,font=Math.round(bar*.5);
      ctx.font=`600 ${font}px system-ui, "Segoe UI", sans-serif`;ctx.textBaseline='middle';
      const label=`${t.phase}  ${t.time}`,lw=ctx.measureText(label).width+pad*2;
      ctx.fillStyle=t.color;ctx.fillRect(0,0,lw,bar);ctx.fillStyle='#fff';ctx.textAlign='left';ctx.fillText(label,pad,bar/2);
      ctx.textAlign='right';ctx.fillStyle='#e8ecf1';ctx.fillText([t.name,t.score].filter(Boolean).join('  ·  '),canvas.width-pad,bar/2);track?.requestFrame?.();
    }
    function begin(){
      if(!opened())throw Error('Recording is not ready.');if(recorder)return;
      const r=element.getBoundingClientRect();if(r.width<2||r.height<2)throw Error('Show the field to record it.');const c=crop(r,{width:innerWidth,height:innerHeight},{width:video.videoWidth||innerWidth,height:video.videoHeight||innerHeight});
      const out=outputSize(c.width,c.height),bar=2*Math.round(Math.max(28,out.width*.045)/2);size={field:out.height};
      canvas=document.createElement('canvas');canvas.width=out.width;canvas.height=out.height+bar;ctx=canvas.getContext('2d');draw();
      chunks=[];recorder=new MediaRecorder(new MediaStream([track=canvas.captureStream(0).getVideoTracks()[0]]),{mimeType:kind.type,videoBitsPerSecond:Math.round(Math.min(12e6,Math.max(3e6,canvas.width*canvas.height*30*.1)))});
      recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data);};
      done=new Promise(resolve=>{recorder.onstop=()=>{cancelAnimationFrame(raf);const blob=new Blob(chunks,{type:kind.type.split(';')[0]});recorder=null;chunks=[];resolve(blob);};});
      recorder.start(1000);
    }
    // Resolves with the video (a Blob, possibly empty) once the recorder has written its last part.
    async function stop(){if(!recorder)return null;const wait=done;if(recorder.state!=='inactive')recorder.stop();return wait;}
    function close(){cancelAnimationFrame(raf);if(recorder&&recorder.state!=='inactive'){recorder.onstop=null;recorder.stop();}recorder=null;for(const t of stream?.getTracks()||[])t.stop();stream=null;if(video)video.srcObject=null;video=null;}
    return {open,begin,stop,close,opened,recording:()=>!!recorder,ext:()=>kind?.ext||'webm'};
  }
  return {SECTIONS,pickType,sections,caption,title,crop,outputSize,create};
});
