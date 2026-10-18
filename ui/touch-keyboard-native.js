'use strict';
window.DeckTouchKeyboard.mount(document.querySelector('#keyboard'),{press:action=>void window.touchKeyboardNative.press(action),close:()=>void window.touchKeyboardNative.press({kind:'done'})});
