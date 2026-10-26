'use strict';
// Original vector drawing matching Hardware Tester's standard controller layout:
// detached triggers, offset sticks, and four independent directions/face keys.
// Physical product naming stays separate from this standard Gamepad API diagram.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeckControllerArt=factory();})(typeof self!=='undefined'?self:this,function(){
function lobe(index,x,y,rotation,label=''){
 return `<g class="tester-key" data-pad-button="${index}" transform="translate(${x} ${y})"><path transform="rotate(${rotation})" d="M-8-29H8q6 0 6 6L7-14q-7 7-14 0l-7-9q0-6 6-6Z"/>${label?`<text x="${rotation===90?22:rotation===270?-22:0}" y="${rotation===0?-18:rotation===180?26:4}">${label}</text>`:''}</g>`;
}
function stick(index,x,y,side){return `<g class="tester-stick" data-pad-button="${index}"><circle class="tester-zone" cx="${x}" cy="${y}" r="37.5"/><path class="tester-crosshair" d="M${x-32} ${y}h64M${x} ${y-32}v64"/><g id="stick-${side}-dot"><circle class="tester-cap" cx="${x}" cy="${y}" r="28"/><circle class="tester-center" cx="${x}" cy="${y}" r="3"/></g></g>`;}
function trigger(index,x,side){return `<g class="tester-trigger" data-pad-button="${index}"><rect class="tester-trigger-bed" x="${x}" y="2" width="28" height="42" rx="10"/><rect id="trigger-${side}-fill" class="tester-trigger-fill" x="${x+4}" y="40" width="20" height="0" rx="5"/><text x="${x+14}" y="28">${side==='left'?'LT':'RT'}</text></g>`;}
function render(){return `<svg class="tester-diagram" data-device-view="standard" data-stick-travel="8" data-trigger-height="34" data-trigger-bottom="40" viewBox="0 0 441 403" role="img" aria-label="Standard controller layout with live sticks, buttons and triggers">
 <path class="tester-shell-shadow" d="M124 101h193q41 0 59 45l53 161c16 51-6 91-38 85-16-3-28-20-45-38l-31-34H126l-31 34c-17 18-29 35-45 38-32 6-54-34-38-85l53-161q18-45 59-45Z"/>
 <path class="tester-shell" d="M124 93h193q41 0 59 45l53 161c16 51-6 91-38 85-16-3-28-20-45-38l-31-34H126l-31 34c-17 18-29 35-45 38-32 6-54-34-38-85l53-161q18-45 59-45Z"/>
 <path class="tester-seam" d="M72 132q13-27 49-27h199q36 0 49 27M23 302q-13 50 25 66 9 3 22-9l46-50q9-10 23-10h164q14 0 23 10l46 50q13 12 22 9 38-16 25-66"/>
 <circle class="tester-zone" cx="166" cy="238" r="37.5"/><circle class="tester-zone" cx="329" cy="160" r="37.5"/>
 ${stick(10,113,160,'left')}${stick(11,278,238,'right')}
 ${lobe(12,166,238,0)}${lobe(15,166,238,90)}${lobe(13,166,238,180)}${lobe(14,166,238,270)}
 ${lobe(3,329,160,0,'Y')}${lobe(1,329,160,90,'B')}${lobe(0,329,160,180,'A')}${lobe(2,329,160,270,'X')}
 <g class="tester-meta" data-pad-button="8"><circle cx="185" cy="162" r="10"/><path d="M181 159h6v5h-6Zm3-3h6v5"/></g>
 <g class="tester-meta" data-pad-button="9"><circle cx="259" cy="162" r="10"/><path d="M255 159h8m-8 3h8m-8 3h8"/></g>
 <g class="tester-meta tester-guide" data-pad-button="16"><circle cx="221" cy="210" r="10"/><path d="m216 210 5-4 5 4v5h-10Z"/></g>
 <g class="tester-shoulder" data-pad-button="4"><rect x="111.5" y="61.5" width="41" height="13" rx="5"/><text x="132" y="58">LB</text></g>
 <g class="tester-shoulder" data-pad-button="5"><rect x="289.5" y="61.5" width="41" height="13" rx="5"/><text x="310" y="58">RB</text></g>
 ${trigger(6,125,'left')}${trigger(7,289,'right')}
</svg>`;}
return {render};
});
