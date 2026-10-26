(function(root,factory){const p=typeof module==='object'&&module.exports?require('./sim-planner.js'):root.DeckPlanner,value=factory(p);if(typeof module==='object'&&module.exports)module.exports=value;else root.DeckSimEditor=value;})(globalThis,P=>{
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  // Editing never mutates the saved layout. Only Done commits this one object's draft.
  function begin(layout,target){
    const original=target.kind==='zone'?layout.zones.find(z=>z.id===target.id):layout.pins[target.index];if(!original)throw Error('That object no longer exists.');
    const draft=clone(original),baseline=JSON.stringify(original);let finished=false;
    return {draft,target:{...target},commit(){if(finished)throw Error('This editor has already saved.');const current=target.kind==='zone'?layout.zones.find(z=>z.id===target.id):layout.pins[target.index];if(current!==original||JSON.stringify(current)!==baseline)throw Error('The object changed while editing. Finish this edit before changing the field.');
      if(target.kind==='zone')Object.assign(original,P.validateZone(draft));
      else if(target.kind==='path')original.path=P.pathEffects(draft.path);
      else{const effects=P.pinEffects(draft);delete effects.path;Object.assign(original,effects);}
      finished=true;return original;}};
  }
  return {begin};
});
