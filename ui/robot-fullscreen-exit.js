'use strict';
document.querySelector('button').onclick=()=>void window.robotViewControls.exit();
document.addEventListener('keydown',event=>{if(event.key==='Escape')void window.robotViewControls.exit();});
