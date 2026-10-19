'use strict';
// Runs before the stylesheets paint so a saved Light or Dark choice never flashes.
(()=>{let theme='system';try{theme=localStorage.getItem('deck-theme')||'system';}catch{}if(theme==='light'||theme==='dark')document.documentElement.dataset.theme=theme;})();
