/**
 * Runs in <head> before first paint (CSP nonce applied by the layout):
 * 1. data-theme from the saved choice, else the system preference (no flash of the wrong theme);
 * 2. data-splash="off" for webdriver (Lighthouse, tests) or ?nosplash;
 * 3. data-fx="off" for the same runs, so decorative effects do not affect scores.
 */
export const HEAD_SCRIPT = `(function(){
var d=document.documentElement;
try{
var t=null;
try{t=localStorage.getItem('leafy-theme')}catch(e){}
if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}
d.setAttribute('data-theme',t);
}catch(e){}
var q=location.search;
if(navigator.webdriver===true||/[?&]nosplash\\b/.test(q)){d.setAttribute('data-splash','off');d.setAttribute('data-fx','off')}
})();`;
