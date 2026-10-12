/* Shared PWA update observer. No account storage or message cache. */
(() => {
 'use strict';
 const LOCAL_VERSION='6.1.0';
 const key='cloux:installed:version';
 let triggeredReload=false;
 let registration=null;
 const register=async()=>{
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  try{
   registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
   registration.addEventListener('updatefound',()=>{
    const worker=registration?.installing;if(!worker)return;
    worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)show()});
   });
   if(registration.waiting&&navigator.serviceWorker.controller)show();
   if(navigator.serviceWorker.controller){
     navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(triggeredReload)location.reload();
     });
   }
  }catch(e){console.warn('Cloux PWA update registration unavailable:',e)}
 };
 function show(){
  let banner=document.getElementById('update-banner');
  if(!banner){
   banner=document.createElement('div');banner.id='update-banner';
   banner.setAttribute('role','status');
   banner.style.cssText='position:fixed;z-index:999999;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:50%;transform:translateX(-50%);max-width:calc(100% - 28px);width:440px;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#420008;border:1px solid #ff1a1a99;box-shadow:0 10px 36px #0009;border-radius:16px;padding:13px 16px;color:#fff;font:600 13px system-ui';
   banner.innerHTML='<span style="color:#fff">Доступна нова версія Cloux</span><button id="update-now" style="background:#e10600;color:#fff;border:0;border-radius:12px;padding:10px 14px;font-weight:750;cursor:pointer;white-space:nowrap">Оновити →</button>';
   document.body.append(banner);
  }
  banner.hidden=false;
  const button=sortButton();
  if(button)button.onclick=async()=>{
   triggeredReload=true;
   try{
    registration=registration||await navigator.serviceWorker?.getRegistration('/');
    if(registration?.waiting){registration.waiting.postMessage({type:'SKIP_WAITING'});setTimeout(()=>location.reload(),3500)}
    else {await registration?.update();location.reload()}
   }catch{location.reload()}
  };
 }
 function sortButton(){return document.getElementById('update-now')}
 async function checkVersion(){
  try{
   const response=await fetch('/version.json?'+Date.now(),{cache:'no-store'});
   if(!response.ok)return;
   const data=await response.json();if(!data?.version)return;
   const prev=localStorage.getItem(key);
   if(prev&&prev!==data.version)show();
   if(data.version!==LOCAL_VERSION)show();
   if(!prev)localStorage.setItem(key,data.version);
  }catch{/* offline: keep current app; never assume a version */}
 }
 window.addEventListener('DOMContentLoaded',()=>{
  void register();
  void checkVersion();
  window.setInterval(()=>{void checkVersion();void registration?.update().catch(()=>{})},5*60*1000);
 });
})();