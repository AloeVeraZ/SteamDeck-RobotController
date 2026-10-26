'use strict';
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeckCalibration=factory();})(typeof self!=='undefined'?self:this,function(){
  const clamp=v=>Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;
  function deadzone(value){if(!Number.isFinite(value)||value<0||value>0.3)throw Error('Choose a deadzone between 0% and 30%.');return Math.round(value*100)/100;}
  function axes(values,zone=0){const out=Array.from({length:4},(_,i)=>clamp(values?.[i]));if(!zone)return out;for(const i of [0,2]){const radius=Math.hypot(out[i],out[i+1]);const scale=radius<=zone?0:(Math.min(1,radius)-zone)/(1-zone)/radius;out[i]*=scale;out[i+1]*=scale;}return out;}
  class DriftSample{
    constructor(){this.count=0;this.max=[0,0];this.sum=[0,0,0,0];this.min=[1,1,1,1];this.high=[-1,-1,-1,-1];}
    add(values){const a=axes(values);this.count++;a.forEach((v,i)=>{this.sum[i]+=v;this.min[i]=Math.min(this.min[i],v);this.high[i]=Math.max(this.high[i],v);});for(const [s,i]of [[0,0],[1,2]])this.max[s]=Math.max(this.max[s],Math.min(1,Math.hypot(a[i],a[i+1])));return this.result();}
    result(){return {count:this.count,peak:this.max.slice(),center:this.sum.map(v=>this.count?v/this.count:0),min:this.min.slice(),max:this.high.slice(),recommended:Math.min(0.3,Math.ceil((Math.max(...this.max)+0.02)*100-1e-9)/100)};}
  }
  return {axes,deadzone,DriftSample};
});
