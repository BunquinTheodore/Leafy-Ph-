/** Splash timing, shared by the inline controller and its tests. */
export const SPLASH_MIN_MS = 900;
export const SPLASH_MAX_MS = 2200;
export const SPLASH_EXIT_MS = 700;

/**
 * Tiny inline controller. Hides the overlay once fonts are loaded and the app has hydrated
 * (window.__leafyReady, set by SplashReady), but never before SPLASH_MIN_MS and never later
 * than SPLASH_MAX_MS. The node is never removed from the DOM (React owns it; removing it would
 * cause a hydration mismatch): data-state goes active, leaving, done, and CSS hides it.
 */
export const SPLASH_CONTROLLER_SCRIPT = `(function(){
var el=document.getElementById('leafy-splash');
if(!el)return;
if(document.documentElement.getAttribute('data-splash')==='off')return;
var start=performance.now(),done=false,fonts=!(document.fonts&&document.fonts.ready);
function hide(){if(done)return;done=true;el.setAttribute('data-state','leaving');setTimeout(function(){el.setAttribute('data-state','done')},${SPLASH_EXIT_MS})}
function check(){
if(done||!fonts||!window.__leafyReady)return;
var wait=${SPLASH_MIN_MS}-(performance.now()-start);
if(wait<=0)hide();else setTimeout(hide,wait)}
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){fonts=true;check()})}
window.__leafyReadyCheck=check;
setTimeout(hide,${SPLASH_MAX_MS});
})();`;
