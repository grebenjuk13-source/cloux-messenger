/* CLOUX silent PWA updates. No intrusive version banners or forced reloads. */
(()=>{
 'use strict';
 const removeBanner=()=>document.getElementById('update-banner')?.remove();
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeBanner,{once:true});
 else removeBanner();
 if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
 const register=async()=>{
  try{
   const worker=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
   // Background update: preserve open chats, unsent messages and active calls.
   const refresh=()=>{if(document.visibilityState==='visible')void worker.update().catch(()=>{});};
   document.addEventListener('visibilitychange',refresh);
   window.addEventListener('focus',refresh);
  }catch(error){console.warn('CLOUX offline worker unavailable',error)}
 };
 void register();
})();
