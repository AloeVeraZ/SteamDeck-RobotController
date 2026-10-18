'use strict';
// Original, scalable device illustrations. Input indices follow the W3C
// Standard Gamepad layout; there are no proprietary touch/rear-button mappings.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeckControllerArt=factory();})(typeof self!=='undefined'?self:this,function(){
const defs=`<defs>
 <linearGradient id="shell" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#4b5158"/><stop offset=".32" stop-color="#30353d"/><stop offset="1" stop-color="#171c23"/></linearGradient>
 <linearGradient id="face" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#3d444d"/><stop offset="1" stop-color="#252b34"/></linearGradient>
 <linearGradient id="silver" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="#eef0f2"/><stop offset=".5" stop-color="#b7bec8"/><stop offset="1" stop-color="#7d8896"/></linearGradient>
 <radialGradient id="well"><stop stop-color="#0e1219"/><stop offset=".8" stop-color="#151b23"/><stop offset="1" stop-color="#58626e"/></radialGradient>
 <radialGradient id="cap" cx=".38" cy=".25" r=".8"><stop stop-color="#535e6b"/><stop offset=".65" stop-color="#303945"/><stop offset="1" stop-color="#1e2631"/></radialGradient>
 <linearGradient id="keycap" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="#525d6b"/><stop offset=".3" stop-color="#293441"/><stop offset="1" stop-color="#151e2a"/></linearGradient>
 <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#203a43"/><stop offset=".45" stop-color="#0e232d"/><stop offset="1" stop-color="#0a151e"/></linearGradient>
 <linearGradient id="trigger" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#80d9b6"/><stop offset="1" stop-color="#c1f5d4"/></linearGradient>
 <filter id="device-shadow" x="-.3" y="-.3" width="1.6" height="1.8"><feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#02070c" flood-opacity=".55"/></filter>
 <filter id="key-shadow" x="-.5" y="-.5" width="2" height="2"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#000" flood-opacity=".8"/></filter>
 <pattern id="grip-grain" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#b6c4d2" opacity=".18"/></pattern>
 </defs>`;
function key(index,x,y,label,accent=''){return `<g class="device-key ${accent}" data-pad-button="${index}"><circle class="key-rim" cx="${x}" cy="${y+1}" r="17.8"/><circle class="cap-base" cx="${x}" cy="${y}" r="15.2"/><path class="key-shine" d="M${x-10} ${y-8}q10-8 20 0"/><text x="${x}" y="${y+5}">${label}</text></g>`;}
function stick(index,x,y,r=35){return `<g class="device-stick" data-pad-button="${index}"><circle class="stick-bezel" cx="${x}" cy="${y}" r="${r+3}"/><circle class="stick-well" cx="${x}" cy="${y}" r="${r}"/><circle class="stick-gate" cx="${x}" cy="${y}" r="${r-4}"/><path class="gate-ticks" d="M${x} ${y-r+2}v4m0 ${r*2-8}v4M${x-r+2} ${y}h4m${r*2-8} 0h4"/><g id="stick-${index===10?'left':'right'}-dot"><circle class="stick-stem" cx="${x}" cy="${y+2}" r="22"/><circle class="stick-cap" cx="${x}" cy="${y}" r="21"/><circle class="stick-texture" cx="${x}" cy="${y}" r="16"/><path class="stick-shine" d="M${x-14} ${y-11}q14-10 28 0"/></g></g>`;}
function dpad(x,y){return `<g class="device-dpad" transform="translate(${x} ${y})"><path class="dpad-bed" d="M-17-42h34v25h25v34H17v25h-34V17h-25v-34h25Z"/><path class="dpad-face" d="M-14-38h28v24h24v28H14v24h-28V14h-24v-28h24Z"/><g data-pad-button="12"><path class="dpad-hit" d="M-14-38h28v24L0-3l-14-11Z"/><path class="dpad-arrow" d="m-5-24 5-6 5 6"/></g><g data-pad-button="13"><path class="dpad-hit" d="M-14 38h28V14L0 3l-14 11Z"/><path class="dpad-arrow" d="m-5 24 5 6 5-6"/></g><g data-pad-button="14"><path class="dpad-hit" d="M-38-14v28h24L-3 0l-11-14Z"/><path class="dpad-arrow" d="m-24-5-6 5 6 5"/></g><g data-pad-button="15"><path class="dpad-hit" d="M38-14v28H14L3 0l11-14Z"/><path class="dpad-arrow" d="m24-5 6 5-6 5"/></g><circle class="dpad-pivot" r="8"/></g>`;}
function shoulder(index,x,width,label,trigger=false){return `<g class="device-shoulder" data-pad-button="${index}"><rect class="shoulder-rim" x="${x}" y="${trigger?9:49}" width="${width}" height="${trigger?26:17}" rx="${trigger?9:6}"/><rect class="shoulder-face" x="${x+2}" y="${trigger?10:50}" width="${width-4}" height="${trigger?22:13}" rx="${trigger?7:4}"/>${trigger?`<rect id="trigger-${index===6?'left':'right'}-fill" class="analog-trigger-fill" x="${x+5}" y="14" width="0" height="16" rx="5"/>`:''}<text x="${x+width/2}" y="${trigger?27:61}">${label}</text></g>`;}
function deck(){return `
 ${shoulder(6,77,94,'L2',true)}${shoulder(7,629,94,'R2',true)}${shoulder(4,62,116,'L1')}${shoulder(5,622,116,'R1')}
 <g filter="url(#device-shadow)"><path class="device-shell" d="M91 65h618c35 0 61 25 66 60l10 150c2 37-13 65-39 72-31 8-56-11-76-21H130c-20 10-45 29-76 21-26-7-41-35-39-72l10-150c5-35 31-60 66-60Z"/>
 <path class="device-face" d="M94 70h612c31 0 55 23 59 56l10 148c2 27-8 54-29 63-23 10-49-10-70-19H124c-21 9-47 29-70 19-21-9-31-36-29-63l10-148c4-33 28-56 59-56Z"/>
 <path class="shell-seam" d="M201 75v242m398-242v242M46 104q19-26 47-26h89M618 78h89q28 0 47 26"/>
 <rect class="screen-bezel" x="209" y="84" width="382" height="237" rx="12"/>
 <rect class="screen-glass" x="220" y="95" width="360" height="214" rx="5"/>
 <path class="screen-reflection" d="M224 100h260L224 245Z"/>
 <text class="screen-kicker" x="400" y="124">STANDARD GAMEPAD INPUT</text>
 <g class="screen-scope"><circle cx="310" cy="201" r="47"/><path d="M263 201h94m-47-47v94"/><circle class="scope-inner" cx="310" cy="201" r="24"/><circle id="screen-left-dot" class="scope-point" cx="310" cy="201" r="4"/></g>
 <g class="screen-scope"><circle cx="490" cy="201" r="47"/><path d="M443 201h94m-47-47v94"/><circle class="scope-inner" cx="490" cy="201" r="24"/><circle id="screen-right-dot" class="scope-point" cx="490" cy="201" r="4"/></g>
 <text class="screen-label" x="310" y="273">LEFT STICK</text><text class="screen-label" x="490" y="273">RIGHT STICK</text>
 <rect class="trackpad-rim" x="72" y="201" width="103" height="87" rx="10"/><rect class="trackpad" x="76" y="205" width="95" height="79" rx="7"/>
 <rect class="trackpad-rim" x="625" y="201" width="103" height="87" rx="10"/><rect class="trackpad" x="629" y="205" width="95" height="79" rx="7"/>
 <path class="speaker-slits" d="M177 288v17m5-17v17m5-17v17m426-17v17m5-17v17m5-17v17"/>
 ${stick(10,158,143,32)}${stick(11,642,143,32)}
 <g transform="translate(70 140) scale(.66)">${dpad(0,0)}</g>
 ${key(0,732,168,'A')}${key(1,759,140,'B')}${key(2,705,140,'X')}${key(3,732,112,'Y')}
 ${key(8,70,91,'▱')}${key(9,730,91,'☰')}
 <g class="deck-system" data-pad-button="16"><rect class="cap-base" x="58" y="303" width="66" height="21" rx="10"/><text x="91" y="317">STEAM</text></g>
 <g class="deck-system system-unmapped"><rect x="676" y="303" width="66" height="21" rx="10"/><text x="709" y="317">•••</text></g></g>
 <text class="device-view-caption" x="400" y="374">FRONT VIEW · STANDARD INPUTS ONLY</text>`;}
function gamepad(sony=false){const lx=sony?290:239,ly=sony?262:151,rx=sony?510:443,ry=262,dx=sony?206:286,dy=sony?151:254,fx=594,fy=154;return `
 ${shoulder(6,190,105,sony?'L2':'LT',true)}${shoulder(7,505,105,sony?'R2':'RT',true)}${shoulder(4,177,131,sony?'L1':'LB')}${shoulder(5,492,131,sony?'R1':'RB')}
 <g filter="url(#device-shadow)"><path class="device-shell ${sony?'silver-shell':''}" d="M251 66c-47-10-78 13-98 59-24 54-40 119-49 173-8 47 7 69 36 65 24-3 48-34 76-68l42-48c46-8 94-9 142-9s96 1 142 9l42 48c28 34 52 65 76 68 29 4 44-18 36-65-9-54-25-119-49-173-20-46-51-69-98-59-28 6-59 12-149 12s-121-6-149-12Z"/>
 <path class="device-face" d="M254 79c-40-9-68 13-87 56-11 25-21 53-28 81 32 33 71 29 111 17 43-13 92-15 150-15s107 2 150 15c40 12 79 16 111-17-7-28-17-56-28-81-19-43-47-65-87-56-32 7-69 13-146 13s-114-6-146-13Z"/>
 <path class="grip-texture" d="M141 225q23 29 74 22l-26 35c-25 30-41 53-56 57-14 1-19-11-15-38q8-43 23-76Zm518 0q-23 29-74 22l26 35c25 30 41 53 56 57 14 1 19-11 15-38q-8-43-23-76Z"/>
 <path class="shell-seam" d="M142 221q47 44 116 17m284 0q69 27 116-17"/>
 ${sony?'<rect class="sony-touchpad" x="315" y="94" width="170" height="90" rx="17"/><path class="sony-led" d="M318 178q82 17 164 0"/>':'<path class="center-inlay" d="M347 101h106l-14 84h-78Z"/>'}
 ${stick(10,lx,ly,39)}${stick(11,rx,ry,39)}${dpad(dx,dy)}
 ${key(0,fx,fy+38,sony?'×':'A','face-a')}${key(1,fx+38,fy,sony?'○':'B','face-b')}${key(2,fx-38,fy,sony?'□':'X','face-x')}${key(3,fx,fy-38,sony?'△':'Y','face-y')}
 ${key(8,sony?284:354,sony?111:162,sony?'▱':'▱')}${key(9,sony?516:446,sony?111:162,'☰')}${key(16,400,sony?225:120,'●')}
 <path class="status-light" d="M386 201h28"/>
 </g><text class="device-view-caption" x="400" y="382">STANDARD GAMEPAD LAYOUT</text>`;}
function render(kind='generic'){const known=['steamdeck','playstation','xbox'].includes(kind)?kind:'generic';return `<svg class="device-illustration device-${known}" data-device-view="${known}" data-stick-travel="${known==='steamdeck'?10:16}" data-trigger-width="${known==='steamdeck'?84:95}" viewBox="0 0 800 395" role="img" aria-label="${known==='steamdeck'?'Steam Deck':known==='playstation'?'PlayStation-style':'Standard gamepad'} live input visualization">${defs}${known==='steamdeck'?deck():gamepad(known==='playstation')}</svg>`;}
return {render};
});
