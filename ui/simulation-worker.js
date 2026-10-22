'use strict';
// Route planning runs here so a large visibility graph cannot stall the driver station UI.
importScripts('vendor/planning.js','sim-planner.js');
onmessage=event=>{const {id,project,footprint,fieldZones,field}=event.data||{};try{postMessage({id,result:DeckPlanner.plan(project,footprint,fieldZones,field)});}catch(error){let issues=[];try{issues=DeckPlanner.analyze(project,footprint,fieldZones,field,true);}catch{}postMessage({id,error:error.message,issues});}};
